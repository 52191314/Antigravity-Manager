use std::fs;
use std::path::Path;
// codesign 仅 macOS 分支使用（patch_agy_binary 重签名）
#[cfg(target_os = "macos")]
use std::process::Command;

#[tauri::command]
pub async fn patch_agy_binary(file_path: String) -> Result<String, String> {
    let mut actual_path = file_path.clone();
    if actual_path.ends_with(".app") || actual_path.ends_with(".app/") {
        let app_path = Path::new(&actual_path);
        let inner = app_path.join("Contents/MacOS/agy");
        if inner.exists() {
            actual_path = inner.to_string_lossy().to_string();
        }
    }

    let path = Path::new(&actual_path);
    if !path.exists() {
        return Err("File not found".into());
    }

    let data = fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
    let n = data.len();
    let mut patch_offset = None;
    let mut new_inst_bytes = None;
    let mut is_pe_x64 = false;

    // 1. Scan for x86_64 PE (Windows/Linux) pattern
    // Pattern: cmpb $0x0, (%r12) -> 41 80 3c 24 00
    //          jne offset32      -> 0f 85 XX XX XX XX
    //          leaq rip_off, rax -> 48 8d 05 XX XX XX XX
    //          mov $0x18, %ebx   -> bb 18 00 00 00
    let pe_pattern = [0x41, 0x80, 0x3c, 0x24, 0x00, 0x0f, 0x85];
    let mut i = 0;
    while i < n - 25 {
        if data[i..i + 7] == pe_pattern {
            // Validate the rest of the pattern
            // leaq opcode starts after jne (which is 6 bytes: 0f 85 XX XX XX XX)
            let leaq_idx = i + 5 + 6;
            if data[leaq_idx..leaq_idx + 3] == [0x48, 0x8d, 0x05] {
                // mov $0x18, %ebx starts after leaq (which is 7 bytes: 48 8d 05 XX XX XX XX)
                let mov_idx = leaq_idx + 7;
                if data[mov_idx..mov_idx + 2] == [0xbb, 0x18] {
                    // Found the gate!
                    patch_offset = Some(i + 5); // Points to the jne instruction: 0f 85 ...
                                                // Rewrite jne to 6 NOP bytes (0x90) so it falls through unconditionally
                    new_inst_bytes = Some(vec![0x90; 6]);
                    is_pe_x64 = true;
                    break;
                }
            }
        }
        i += 1;
    }

    // 2. Scan for ARM64 eligibility gate pattern if not PE x86_64
    if patch_offset.is_none() {
        for j in (0..n - 20).step_by(4) {
            let inst1 = u32::from_le_bytes(data[j..j + 4].try_into().unwrap());
            let inst2 = u32::from_le_bytes(data[j + 4..j + 8].try_into().unwrap());
            let inst4 = u32::from_le_bytes(data[j + 12..j + 16].try_into().unwrap());
            let inst5 = u32::from_le_bytes(data[j + 16..j + 20].try_into().unwrap());

            // 1. ldrb wA, [xB, #0x58]
            if (inst1 & 0xfffffc00) != 0x39416000 {
                continue;
            }
            let b_reg = (inst1 >> 5) & 0x1f;
            let a_reg = inst1 & 0x1f;

            // 2. tbnz wA, #0, label1
            if (inst2 & 0xffe0001f) != (0x37000000 | a_reg) {
                continue;
            }

            // 3. ldr xC, [xB, #0x38]
            if (inst4 & 0xfffffc00) != 0xf9401c00 || ((inst4 >> 5) & 0x1f) != b_reg {
                continue;
            }
            let c_reg = inst4 & 0x1f;

            // 4. cbz xC, label_send
            if (inst5 & 0xffe0001f) != (0xb4000000 | c_reg) {
                continue;
            }

            // Extract imm19 from cbz
            let imm19_raw = (inst5 >> 5) & 0x7ffff;
            let imm19 = if (imm19_raw & 0x40000) != 0 {
                (imm19_raw as i32) - 0x80000
            } else {
                imm19_raw as i32
            };

            patch_offset = Some(j + 16);
            // Encode unconditional branch: b label_send (0x14000000 | (imm19 & 0x3ffffff))
            let b_inst = 0x14000000 | ((imm19 as u32) & 0x3ffffff);
            new_inst_bytes = Some(b_inst.to_le_bytes().to_vec());
            break;
        }
    }

    if patch_offset.is_none() {
        // Check if already patched for x86_64 PE
        let mut check_idx = 0;
        while check_idx < n - 25 {
            if data[check_idx..check_idx + 7] == pe_pattern {
                let leaq_idx = check_idx + 5 + 6;
                if data[leaq_idx..leaq_idx + 3] == [0x48, 0x8d, 0x05] {
                    let mov_idx = leaq_idx + 7;
                    if data[mov_idx..mov_idx + 2] == [0xbb, 0x18] {
                        if data[check_idx + 5..check_idx + 11] == [0x90; 6] {
                            return Ok("Binary is already patched.".into());
                        }
                    }
                }
            }
            check_idx += 1;
        }

        // Check if already patched for ARM64
        for j in (0..n - 20).step_by(4) {
            let inst1 = u32::from_le_bytes(data[j..j + 4].try_into().unwrap());
            let inst2 = u32::from_le_bytes(data[j + 4..j + 8].try_into().unwrap());
            let inst4 = u32::from_le_bytes(data[j + 12..j + 16].try_into().unwrap());
            let inst5 = u32::from_le_bytes(data[j + 16..j + 20].try_into().unwrap());

            if (inst1 & 0xfffffc00) == 0x39416000 {
                let b_reg = (inst1 >> 5) & 0x1f;
                let a_reg = inst1 & 0x1f;
                if (inst2 & 0xffe0001f) == (0x37000000 | a_reg) {
                    if (inst4 & 0xfffffc00) == 0xf9401c00 && ((inst4 >> 5) & 0x1f) == b_reg {
                        if (inst5 & 0xfc000000) == 0x14000000 {
                            return Ok("Binary is already patched.".into());
                        }
                    }
                }
            }
        }

        return Err("Pattern not found. This version of the CLI might not have the eligibility gate, or the structure has changed.".into());
    }

    let offset = patch_offset.unwrap();
    let patch_bytes = new_inst_bytes.unwrap();

    // Create backup
    let backup_path = format!("{}.bak", actual_path);
    if !Path::new(&backup_path).exists() {
        fs::copy(path, &backup_path).map_err(|e| format!("Failed to create backup: {}", e))?;
    }

    // Apply patch
    use std::io::{Seek, SeekFrom, Write};
    let mut file = fs::OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|e| format!("Failed to open file for writing: {}", e))?;
    file.seek(SeekFrom::Start(offset as u64))
        .map_err(|e| format!("Seek failed: {}", e))?;
    file.write_all(&patch_bytes)
        .map_err(|e| format!("Write failed: {}", e))?;

    // Re-sign on macOS (only if we patched an ARM64 macOS executable)
    #[cfg(target_os = "macos")]
    {
        if !is_pe_x64 {
            let _ = Command::new("codesign")
                .args(&["--remove-signature", &actual_path])
                .output();
            let output = Command::new("codesign")
                .args(&["--sign", "-", &actual_path])
                .output();
            match output {
                Ok(out) if out.status.success() => {}
                Ok(out) => {
                    let err_msg = String::from_utf8_lossy(&out.stderr);
                    return Err(format!(
                        "Patch applied, but codesigning failed: {}",
                        err_msg
                    ));
                }
                Err(e) => {
                    return Err(format!(
                        "Patch applied, but codesigning execution failed: {}",
                        e
                    ))
                }
            }
        }
    }

    Ok("Patch applied successfully!".into())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClaudeInstallationInfo {
    pub version: String,
    pub path: String,
    pub is_patched: bool,
    pub is_patchable: bool,
    pub size_mb: f64,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ClaudePatchStatus {
    pub file_path: String,
    pub is_patched: bool,
    pub is_patchable: bool,
    pub message: String,
    pub available_installations: Vec<ClaudeInstallationInfo>,
}

/// 扫描系统中所有已安装的 Claude 运行时或客户端二进制
fn scan_all_claude_installations() -> Vec<ClaudeInstallationInfo> {
    let mut results = Vec::new();

    #[cfg(target_os = "macos")]
    {
        let mut candidates = Vec::new();

        // 1. 扫描当前用户目录下的 Claude-3p/claude-code
        if let Some(home) = dirs::home_dir() {
            let base_dir = home.join("Library/Application Support/Claude-3p/claude-code");
            if base_dir.exists() {
                if let Ok(entries) = fs::read_dir(&base_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        let ver_name = entry.file_name().to_string_lossy().to_string();
                        let bin = path.join("claude.app/Contents/MacOS/claude");
                        if bin.exists() {
                            candidates.push((ver_name, bin));
                        }
                    }
                }
            }
        }

        // 2. 扫描系统 Applications 与常见安装目录
        let standard_apps = [
            "/Applications/Claude.app/Contents/MacOS/claude",
            "/Applications/Claude.app/Contents/MacOS/Claude",
        ];
        for app in standard_apps {
            let p = std::path::PathBuf::from(app);
            if p.exists() {
                candidates.push(("Desktop-App".to_string(), p));
            }
        }

        // 3. 去重并提取补丁状态
        let patched_re = regex::bytes::Regex::new(
            r"function\s+[a-zA-Z0-9_$]+\([a-zA-Z0-9_$]+,[a-zA-Z0-9_$]+,[a-zA-Z0-9_$]+\)\{return 0;\}"
        ).ok();

        let origin_re = regex::bytes::Regex::new(
            r"function\s+([a-zA-Z0-9_$]+)\(([a-zA-Z0-9_$]+),([a-zA-Z0-9_$]+),([a-zA-Z0-9_$]+)\)\{let\s+[a-zA-Z0-9_$]+=0,[a-zA-Z0-9_$]+=0;for\(let\s+[a-zA-Z0-9_$]+=[a-zA-Z0-9_$]+-1;[a-zA-Z0-9_$]+>=0;[a-zA-Z0-9_$]+--\)if\([a-zA-Z0-9_$]+\+=[a-zA-Z0-9_$]+\[[a-zA-Z0-9_$]+\],[a-zA-Z0-9_$]+\+\+,[a-zA-Z0-9_$]+>=[a-zA-Z0-9_$]+\)break;if\([a-zA-Z0-9_$]+>=[a-zA-Z0-9_$]+-1\)return\s+Math\.max\(1,Math\.floor\([a-zA-Z0-9_$]+/2\)\);return\s+[a-zA-Z0-9_$]+\}"
        ).ok();

        for (ver, path) in candidates {
            if let Ok(meta) = fs::metadata(&path) {
                let sz_mb = meta.len() as f64 / (1024.0 * 1024.0);
                let (is_patched, is_patchable) = if let Ok(data) = fs::read(&path) {
                    let patched = patched_re.as_ref().map_or(false, |r| r.is_match(&data));
                    let patchable = if patched {
                        true
                    } else {
                        origin_re.as_ref().map_or(false, |r| r.is_match(&data))
                    };
                    (patched, patchable)
                } else {
                    (false, false)
                };

                results.push(ClaudeInstallationInfo {
                    version: ver,
                    path: path.to_string_lossy().to_string(),
                    is_patched,
                    is_patchable,
                    size_mb: (sz_mb * 10.0).round() / 10.0,
                });
            }
        }
    }

    results
}

/// 辅助函数：解析 Claude 客户端可执行文件路径
fn resolve_claude_binary_path(custom_path: Option<String>) -> Result<std::path::PathBuf, String> {
    if let Some(p) = custom_path {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            let path = std::path::PathBuf::from(trimmed);
            // 兼容用户直接传入 .app 目录
            if path.is_dir() {
                let inner = path.join("Contents/MacOS/claude");
                if inner.exists() {
                    return Ok(inner);
                }
            }
            if path.exists() {
                return Ok(path);
            }
            return Err(format!("指定路径不存在: {}", trimmed));
        }
    }

    let installations = scan_all_claude_installations();
    if let Some(first) = installations.into_iter().max_by(|a, b| a.version.cmp(&b.version)) {
        return Ok(std::path::PathBuf::from(first.path));
    }

    Err("未在系统中自动发现 Claude Desktop 实例，请手动选择或输入路径".into())
}

/// 列出系统中所有发现的 Claude Desktop 实例 (暴露给前端选择器)
#[tauri::command]
pub async fn list_claude_installations() -> Result<Vec<ClaudeInstallationInfo>, String> {
    Ok(scan_all_claude_installations())
}

/// 检查 Claude 客户端的深度归档补丁状态 (外置纯只读检查)
#[tauri::command]
pub async fn check_claude_cowork_patch(file_path: Option<String>) -> Result<ClaudePatchStatus, String> {
    let all_installs = scan_all_claude_installations();
    let path = resolve_claude_binary_path(file_path)?;
    let data = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;

    // 1. 检查是否已经注入过补丁
    let patched_re = regex::bytes::Regex::new(
        r"function\s+[a-zA-Z0-9_$]+\([a-zA-Z0-9_$]+,[a-zA-Z0-9_$]+,[a-zA-Z0-9_$]+\)\{return 0;\}"
    ).map_err(|e| e.to_string())?;

    if patched_re.is_match(&data) {
        return Ok(ClaudePatchStatus {
            file_path: path.to_string_lossy().to_string(),
            is_patched: true,
            is_patchable: true,
            message: "已成功注入深度归档补丁 (return 0;)，支持 100% 全量历史归档".into(),
            available_installations: all_installs,
        });
    }

    // 2. 检查是否匹配官方原生修剪算法特征 (Structural AST 模式)
    let origin_re = regex::bytes::Regex::new(
        r"function\s+([a-zA-Z0-9_$]+)\(([a-zA-Z0-9_$]+),([a-zA-Z0-9_$]+),([a-zA-Z0-9_$]+)\)\{let\s+[a-zA-Z0-9_$]+=0,[a-zA-Z0-9_$]+=0;for\(let\s+[a-zA-Z0-9_$]+=[a-zA-Z0-9_$]+-1;[a-zA-Z0-9_$]+>=0;[a-zA-Z0-9_$]+--\)if\([a-zA-Z0-9_$]+\+=[a-zA-Z0-9_$]+\[[a-zA-Z0-9_$]+\],[a-zA-Z0-9_$]+\+\+,[a-zA-Z0-9_$]+>=[a-zA-Z0-9_$]+\)break;if\([a-zA-Z0-9_$]+>=[a-zA-Z0-9_$]+-1\)return\s+Math\.max\(1,Math\.floor\([a-zA-Z0-9_$]+/2\)\);return\s+[a-zA-Z0-9_$]+\}"
    ).map_err(|e| e.to_string())?;

    if origin_re.is_match(&data) {
        return Ok(ClaudePatchStatus {
            file_path: path.to_string_lossy().to_string(),
            is_patched: false,
            is_patchable: true,
            message: "检测到官方原生修剪算法，可安全注入 135 字节等长微创补丁".into(),
            available_installations: all_installs,
        });
    }

    Ok(ClaudePatchStatus {
        file_path: path.to_string_lossy().to_string(),
        is_patched: false,
        is_patchable: false,
        message: "未匹配到目标修剪特征，当前版本结构可能已变更".into(),
        available_installations: all_installs,
    })
}

/// 应用 Claude Cowork 深度归档微创等长补丁 (外置独立工具命令)
#[tauri::command]
pub async fn apply_claude_cowork_patch(file_path: Option<String>) -> Result<String, String> {
    let path = resolve_claude_binary_path(file_path)?;
    let actual_path = path.to_string_lossy().to_string();

    let data = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;

    // 1. 检查是否已打补丁
    let patched_re = regex::bytes::Regex::new(
        r"function\s+[a-zA-Z0-9_$]+\([a-zA-Z0-9_$]+,[a-zA-Z0-9_$]+,[a-zA-Z0-9_$]+\)\{return 0;\}"
    ).map_err(|e| e.to_string())?;
    if patched_re.is_match(&data) {
        return Ok("该文件已处于补丁生效状态，无需重复注入".into());
    }

    // 2. 匹配原生特征并提取变量名
    let origin_re = regex::bytes::Regex::new(
        r"function\s+([a-zA-Z0-9_$]+)\(([a-zA-Z0-9_$]+),([a-zA-Z0-9_$]+),([a-zA-Z0-9_$]+)\)\{let\s+[a-zA-Z0-9_$]+=0,[a-zA-Z0-9_$]+=0;for\(let\s+[a-zA-Z0-9_$]+=[a-zA-Z0-9_$]+-1;[a-zA-Z0-9_$]+>=0;[a-zA-Z0-9_$]+--\)if\([a-zA-Z0-9_$]+\+=[a-zA-Z0-9_$]+\[[a-zA-Z0-9_$]+\],[a-zA-Z0-9_$]+\+\+,[a-zA-Z0-9_$]+>=[a-zA-Z0-9_$]+\)break;if\([a-zA-Z0-9_$]+>=[a-zA-Z0-9_$]+-1\)return\s+Math\.max\(1,Math\.floor\([a-zA-Z0-9_$]+/2\)\);return\s+[a-zA-Z0-9_$]+\}"
    ).map_err(|e| e.to_string())?;

    let Some(caps) = origin_re.captures(&data) else {
        return Err("未找到修剪算法特征，无法应用补丁".into());
    };

    let matched_match = caps.get(0).unwrap();
    let offset = matched_match.start();
    let matched_len = matched_match.end() - offset;

    let fn_name = std::str::from_utf8(caps.get(1).unwrap().as_bytes()).unwrap();
    let p1 = std::str::from_utf8(caps.get(2).unwrap().as_bytes()).unwrap();
    let p2 = std::str::from_utf8(caps.get(3).unwrap().as_bytes()).unwrap();
    let p3 = std::str::from_utf8(caps.get(4).unwrap().as_bytes()).unwrap();

    // 构造严格等长替换字节流 (保持 0 偏移漂移)
    let prefix = format!("function {}({},{},{}){{return 0;}}/*", fn_name, p1, p2, p3);
    let suffix = "*/";
    if prefix.len() + suffix.len() > matched_len {
        return Err("构造补丁长度超限".into());
    }
    let spaces_needed = matched_len - prefix.len() - suffix.len();
    let mut replacement = prefix.into_bytes();
    replacement.extend(vec![b' '; spaces_needed]);
    replacement.extend_from_slice(suffix.as_bytes());

    // 3. 创建 .bak 备份文件
    let backup_path = format!("{}.deep_compact.bak", actual_path);
    if !std::path::Path::new(&backup_path).exists() {
        fs::copy(&path, &backup_path).map_err(|e| format!("创建备份文件失败: {}", e))?;
    }

    // 4. 原位定点写入 (In-place WriteAt)
    use std::io::{Seek, SeekFrom, Write};
    let mut file = fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .map_err(|e| format!("无法以写模式打开目标文件: {}", e))?;

    file.seek(SeekFrom::Start(offset as u64))
        .map_err(|e| format!("定位写入偏移失败: {}", e))?;
    file.write_all(&replacement)
        .map_err(|e| format!("写入补丁失败: {}", e))?;
    file.flush()
        .map_err(|e| format!("刷新缓冲区失败: {}", e))?;
    drop(file);

    // 5. macOS ad-hoc 代码重签名
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("codesign")
            .args(&["--force", "--sign", "-", &actual_path])
            .output();
        match output {
            Ok(out) if out.status.success() => {}
            Ok(out) => {
                let err_msg = String::from_utf8_lossy(&out.stderr);
                return Err(format!("补丁已写入，但 codesign 重签名失败: {}", err_msg));
            }
            Err(e) => {
                return Err(format!("执行 codesign 命令失败: {}", e));
            }
        }
    }

    Ok(format!("成功为 Claude 注入深度归档微创补丁并完成重签名！目标路径: {}", actual_path))
}

/// 还原 Claude Cowork 原始修剪逻辑 (外置独立工具命令)
#[tauri::command]
pub async fn revert_claude_cowork_patch(file_path: Option<String>) -> Result<String, String> {
    let path = resolve_claude_binary_path(file_path)?;
    let actual_path = path.to_string_lossy().to_string();
    let backup_path = format!("{}.deep_compact.bak", actual_path);

    if std::path::Path::new(&backup_path).exists() {
        fs::copy(&backup_path, &path).map_err(|e| format!("从备份文件恢复失败: {}", e))?;
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("codesign")
                .args(&["--force", "--sign", "-", &actual_path])
                .output();
        }
        return Ok("已成功从备份还原原生二进制！".into());
    }

    Err("未找到 .deep_compact.bak 备份文件，无法执行一键还原".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_claude_cowork_patch_lifecycle() {
        let sample_path = "/tmp/claude_versions/darwin-287/package/claude";
        if !std::path::Path::new(sample_path).exists() {
            println!("Sample not found, skipping: {}", sample_path);
            return;
        }

        // 1. 检查初始状态（应为未打补丁但可打补丁）
        let status = check_claude_cowork_patch(Some(sample_path.to_string())).await.unwrap();
        assert!(status.is_patchable);

        // 2. 应用补丁
        let apply_res = apply_claude_cowork_patch(Some(sample_path.to_string())).await.unwrap();
        assert!(apply_res.contains("成功") || apply_res.contains("已处于"));

        // 3. 再次检查状态（应为已打补丁）
        let status_patched = check_claude_cowork_patch(Some(sample_path.to_string())).await.unwrap();
        assert!(status_patched.is_patched);

        // 4. 执行一键还原
        let revert_res = revert_claude_cowork_patch(Some(sample_path.to_string())).await.unwrap();
        assert!(revert_res.contains("成功从备份还原"));

        // 5. 还原后检查状态（应回到未打补丁）
        let status_reverted = check_claude_cowork_patch(Some(sample_path.to_string())).await.unwrap();
        assert!(!status_reverted.is_patched);
        assert!(status_reverted.is_patchable);
    }

    #[tokio::test]
    async fn test_antigravity_tools_claude_discovery_and_patching() {
        println!("\n================================================================================");
        println!("🚀 [Antigravity Tools 原生命令集成测试: 自动发现与沙盒多版本调度]");
        println!("================================================================================");

        // 1. 测试自动发现
        println!("🔍 步骤 1: 调用 list_claude_installations 探测本机已安装 Claude 实例...");
        let installs = list_claude_installations().await.expect("Failed to list installations");
        println!("   └─ 发现系统实例总数: {}", installs.len());
        for (i, inst) in installs.iter().enumerate() {
            println!("      [{}] 版本: {:<12} | 路径: {} (已打补丁: {}, 可打补丁: {})",
                i + 1, inst.version, inst.path, inst.is_patched, inst.is_patchable);
        }
        assert!(!installs.is_empty(), "必须能发现系统中已安装的 Claude 实例！");

        // 2. 测试对沙盒中跨度达数十个版本的样本（远古 v2.1.110、早期 v2.1.160、最新 v2.1.287）执行集成修补
        let test_targets = [
            ("远古基线", "/Users/daniel/Documents/test_sandbox/Claude_Desktop_2.1.110.app"),
            ("早期演进", "/Users/daniel/Documents/test_sandbox/Claude_Desktop_2.1.160.app"),
            ("官方最新", "/Users/daniel/Documents/test_sandbox/Claude_Desktop_2.1.287.app"),
        ];

        for (stage, app_path) in test_targets {
            println!("\n--------------------------------------------------------------------------------");
            println!("🎯 步骤 2: 针对【{}】沙盒实例进行端到端验证: {}", stage, app_path);

            // 2.1 检查状态 (验证对 .app 目录路径的自动内省支持)
            let status = check_claude_cowork_patch(Some(app_path.to_string())).await.expect("Check failed");
            println!("   ├─ 路径解析:   {}", status.file_path);
            assert!(status.file_path.ends_with("Contents/MacOS/claude"));
            println!("   ├─ 初始补丁状态: is_patched={}, is_patchable={}", status.is_patched, status.is_patchable);
            println!("   ├─ 状态描述:   {}", status.message);
            assert!(status.is_patchable, "目标版本必须可打补丁！");

            // 2.2 应用微创等长补丁
            let apply_res = apply_claude_cowork_patch(Some(app_path.to_string())).await.expect("Apply failed");
            println!("   ├─ 应用补丁结果: {}", apply_res);

            // 2.3 验证打补丁后状态
            let status_after = check_claude_cowork_patch(Some(app_path.to_string())).await.expect("Re-check failed");
            assert!(status_after.is_patched, "打完补丁后必须为已打补丁状态！");
            println!("   ├─ 验证状态变更: 成功识别为已打补丁 (return 0;)");

            // 2.4 一键安全还原
            let revert_res = revert_claude_cowork_patch(Some(app_path.to_string())).await.expect("Revert failed");
            println!("   ├─ 一键还原结果: {}", revert_res);

            // 2.5 还原后再检查
            let status_restored = check_claude_cowork_patch(Some(app_path.to_string())).await.expect("Restore-check failed");
            assert!(!status_restored.is_patched, "还原后必须恢复为未打补丁状态！");
            assert!(status_restored.is_patchable, "还原后必须恢复为可打补丁！");
            println!("   └─ ✅ 端到端生命周期无损验证通过！");
        }
        println!("\n================================================================================\n");
    }
}

