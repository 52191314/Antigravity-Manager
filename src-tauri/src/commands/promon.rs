use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};
use tracing::{error, info};

#[derive(Debug, Serialize, Deserialize)]
pub struct PromonExecutionResult {
    pub success: bool,
    pub role: String,
    pub output: String,
    pub execution_time_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClaudeHistoryItem {
    pub display: String,
    pub timestamp: u64,
    pub project: Option<String>,
    pub session_id: Option<String>,
}

/// Execute the local RTX A5500 fine-tuned model via E:\JB\promon_dual_role.py
#[tauri::command]
pub async fn execute_promon_model(
    role: String,
    query: String,
    code: Option<String>,
) -> Result<PromonExecutionResult, String> {
    let start = std::time::Instant::now();
    info!("Executing PROMON model role: {}", role);

    tokio::task::spawn_blocking(move || {
        let script_path = PathBuf::from(r"E:\JB\promon_dual_role.py");
        if !script_path.exists() {
            return Err(format!("PROMON script not found at {:?}", script_path));
        }

        let mut cmd = Command::new("python");
        cmd.arg(&script_path);
        cmd.arg("--role").arg(&role);

        // Enforce offline execution to prevent HuggingFace timeout/hangs
        cmd.env("HF_HUB_OFFLINE", "1");
        cmd.env("TRANSFORMERS_OFFLINE", "1");
        cmd.env("PYTHONIOENCODING", "utf-8");

        let mut temp_file_path: Option<PathBuf> = None;

        if role == "auditor" {
            if let Some(code_snippet) = code {
                // Write code snippet to a temp file to avoid Windows command line length limits
                let temp_dir = std::env::temp_dir();
                let file_path = temp_dir.join(format!("promon_audit_{}.tmp", uuid::Uuid::new_v4()));
                if let Err(e) = std::fs::write(&file_path, &code_snippet) {
                    return Err(format!("Failed to write temp audit file: {}", e));
                }
                cmd.arg("--file").arg(&file_path);
                temp_file_path = Some(file_path);
            } else if !query.is_empty() {
                cmd.arg("--code").arg(&query);
            }
        } else {
            // Phraser mode
            cmd.arg("--query").arg(&query);
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let output = cmd.output().map_err(|e| format!("Failed to spawn Python process: {}", e))?;

        // Cleanup temporary audit file if created
        if let Some(p) = temp_file_path {
            let _ = std::fs::remove_file(p);
        }

        let duration = start.elapsed().as_millis() as u64;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            error!("PROMON model execution failed: {}", stderr);
            return Ok(PromonExecutionResult {
                success: false,
                role,
                output: stdout,
                execution_time_ms: duration,
                error: Some(stderr),
            });
        }

        Ok(PromonExecutionResult {
            success: true,
            role,
            output: stdout.trim().to_string(),
            execution_time_ms: duration,
            error: None,
        })
    })
    .await
    .map_err(|e| format!("Task execution panicked: {}", e))?
}

/// Show or hide the floating Promon HUD secondary window
#[tauri::command]
pub async fn toggle_promon_hud(app: AppHandle, show: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("promon-hud") {
        if show {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.center();
            let _ = window.set_focus();
        } else {
            let _ = window.hide();
        }
        Ok(())
    } else {
        Err("promon-hud window not found in runtime".to_string())
    }
}

/// Parse Claude Code session history from ~/.claude/history.jsonl
#[tauri::command]
pub async fn get_claude_history(limit: Option<usize>) -> Result<Vec<ClaudeHistoryItem>, String> {
    tokio::task::spawn_blocking(move || {
        let max_items = limit.unwrap_or(100);
        let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\X".to_string());
        let history_path = PathBuf::from(user_profile).join(".claude").join("history.jsonl");

        if !history_path.exists() {
            return Ok(Vec::new());
        }

        let file = File::open(&history_path).map_err(|e| format!("Cannot open history.jsonl: {}", e))?;
        let reader = BufReader::new(file);

        let mut items: Vec<ClaudeHistoryItem> = Vec::new();

        for line_res in reader.lines() {
            if let Ok(line) = line_res {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    let display = val.get("display").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let timestamp = val.get("timestamp").and_then(|v| v.as_u64()).unwrap_or(0);
                    let project = val.get("project").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let session_id = val.get("sessionId").and_then(|v| v.as_str()).map(|s| s.to_string());

                    if !display.is_empty() {
                        items.push(ClaudeHistoryItem {
                            display,
                            timestamp,
                            project,
                            session_id,
                        });
                    }
                }
            }
        }

        // Return latest items first (reversed) up to limit
        items.reverse();
        items.truncate(max_items);

        Ok(items)
    })
    .await
    .map_err(|e| format!("History parse task panicked: {}", e))?
}

/// Launch Claude Code interactive CLI in a target workspace
#[tauri::command]
pub async fn launch_claude_cli(
    workspace: Option<String>,
    prompt: Option<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let target_dir = workspace.unwrap_or_else(|| r"E:\Claude".to_string());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NEW_CONSOLE: u32 = 0x00000010;

            let mut cmd = Command::new("powershell.exe");
            cmd.arg("-NoExit");

            let prompt_arg = if let Some(p) = prompt {
                format!("; claude \"{}\"", p.replace("\"", "\\\""))
            } else {
                "; claude".to_string()
            };

            let script = format!("Set-Location -Path '{}'{}", target_dir, prompt_arg);
            cmd.arg("-Command").arg(&script);
            cmd.creation_flags(CREATE_NEW_CONSOLE);

            cmd.spawn()
                .map_err(|e| format!("Failed to spawn PowerShell Claude process: {}", e))?;

            Ok(format!("Claude Code session launched in {}", target_dir))
        }

        #[cfg(not(target_os = "windows"))]
        {
            Err("Terminal launching is only configured for Windows".to_string())
        }
    })
    .await
    .map_err(|e| format!("Launch task panicked: {}", e))?
}
