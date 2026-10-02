# Claude Desktop Cowork 模式深度归档增强 (Deep Compact) 与全链路技术规范

> **本文档为 Antigravity Tools 针对 Claude Desktop Cowork 模式长会话治理方案的官方底层架构与故障排查白皮书。旨在为后续核心维护者、开发者提供完整详尽的逆向证据、AST 物理机制、状态机时序流以及长效运维指导。**
> 
> 关联 GitHub Issue: [#3576](https://github.com/lbjlaq/Antigravity-Manager/issues/3576)  
> 核心署名: @cubelikeplayDaniel & Gemini & Claude Fable 5  
> 维护者审查认可: @jeikl (2026-10-02)

---

## 目录
- [一、背景与架构困境 (Motivation & Architecture)](#一背景与架构困境-motivation--architecture)
- [二、确定性 `./compact` 穿透协议与网关状态机闭环](#二确定性-compact-穿透协议与网关状态机闭环)
- [三、客户端二进制微创 AST 补丁深度逆向](#三客户端二进制微创-ast-补丁深度逆向)
- [四、macOS 系统级安全与完整性保全 (TCC / Codesign)](#四macos-系统级安全与完整性保全-tcc--codesign)
- [五、Token 算力法典与官方 0-diff 绝对对齐](#五token-算力法典与官方-0-diff-绝对对齐)
- [六、自动压缩与手动深度归档的智能互锁协同](#六自动压缩与手动深度归档的智能互锁协同)
- [七、未来维护者排错与自适应指南 (Troubleshooting Guide)](#七未来维护者排错与自适应指南-troubleshooting-guide)

---

## 一、背景与架构困境 (Motivation & Architecture)

在 Claude Desktop 的 **Cowork**（本地智能体协作）模式下，由于引入了高频自动全屏截屏、文档读取和大规模本地工具调用，长会话上下文往往在短短十几轮交互内急剧膨胀至 200k - 350k tokens（单次请求的 JSON 载荷高达 20MB - 36MB）。

这引发了三个致命的架构级缺陷：

### 1. 客户端命令调度断层 (Slash Command Dispatch Fault)
- 在普通终端 CLI 模式下，用户可自由键入 `/compact` 执行压缩，由 CLI 内核的 `NSi` 函数将历史清空并全量归档；
- 但在 **Cowork 桌面模式** 下，前端缺少终端命令解释器，用户输入 `/compact` 会被前端直接包装为外部工具调用 `Skill(skill="compact")`。由于本地根本没有注册该技能，客户端直接抛出红字报错：`Unknown skill: compact`，用户完全失去了主动压缩手段。

### 2. 官方修剪算法的“50% 膨胀死穴”
- 官方内置的被动修剪逻辑（`khf` / `rAt`）在计算保留轮次时，尾部硬编码了如下保全逻辑：
  ```javascript
  if (g >= n - 1) return Math.max(1, Math.floor(n / 2));
  ```
- **这意味着无论怎么压缩，官方强制要求保留至少 50% 的历史轮次！** 当会话积累到 240k 时，压缩只能削减到 189k，剩下的 189k 死活压不掉，仅仅两轮新对话后又迅速逼近上限，会话陷入不可逆的臃肿与延迟暴增。

### 3. 百万上下文底座的主动短路门禁失效
- Claude 内核的主动压缩逻辑要求 `source !== "auto"`。在 Cowork 模式下该门禁被短路阻断，必须依赖服务端报错 `400 Prompt-Too-Long` 才能被动激活压缩；
- 但 Antigravity Tools 代理的 Google Gemini 拥有 100 万超长窗口，上游从不主动报错，导致客户端永远不触发压缩，直到传输耗尽本地内存崩溃。

---

## 二、确定性 `./compact` 穿透协议与网关状态机闭环

为了打破上述困境，同时让用户拥有**按需深度归档的主动掌控权**，系统设计了确定性穿透协议：

### 1. 为什么是小圆点 `./compact`？
- 输入 `/compact`：触发桌面前端正则 `^/[a-zA-Z0-9_-]+`，被强制拦截为 Skill 调用；
- 输入 **`./compact`**：以字符 `.` 起始，桌面前端将其判定为普通用户聊天文本，**100% 顺利穿透前端并送达 8045 网关**。

### 2. 400 假报警与 Token Gap 的数学解析
客户端在收到 400 假报警时，其内部通过 `Fst` 与 `fIt` 函数计算需要裁剪的目标缺口（`initialTokenGap`）：
```javascript
function Fst(e) {
    let n = e.match(/prompt is too long[^0-9]*(\d+)\s*tokens?\s*>\s*(\d+)/i);
    return { actualTokens: parseInt(n[1], 10), limitTokens: parseInt(n[2], 10) };
}
function fIt(e) {
    let { actualTokens: n, limitTokens: r } = Fst(e.errorDetails);
    return n - r; // 核心：计算削减缺口
}
```

- **历史大坑**：若网关报错信息写 `> 200000 maximum`（如 `250000 > 200000`），客户端算出的缺口只有可怜的 `50,000 tokens`，导致它只削减 50k 牙膏皮便中止循环；
- **破局解法**：8045 网关将目标上限直接钉死为 **`20000 maximum`**！
  $$\text{Gap} = \text{actualTokens} - 20000 \approx 230,000\text{ tokens}$$
  强制客户端产生足额的缺口认知，驱动其把所有旧历史全部切除归档！

### 3. 时序流图与单次免死状态机闭环

```text
用户在 Cowork 键入: ./compact
          │
          ▼
[8045 网关] 捕获文本包含 ./compact
          │
          ├─► 回送 400 假报警: "prompt is too long: 250000 tokens > 20000 maximum"
          │   (记录 session 状态: before_tokens = 250k, ts = now, summary_done = false)
          ▼
[Claude 客户端] 收到 400 假报警，激活内置 Reactive Compact
          │
          ├─► 步骤 1: 后台异步发出总结请求 (携带 Prompt: "write a concise summary...")
          │          │
          │          ▼
          │   [8045 网关] 识别为 is_compaction_request，无条件 200 透传放行给 Gemini
          │          │   (颁发单次接续保护令牌 COMPACTION_ONE_SHOT_SESSIONS，标记 summary_done = true)
          │          ▼
          │   [Claude 客户端] 获得 Gemini 提炼的结构化 Markdown 摘要
          │
          └─► 步骤 2: 客户端将历史折叠替换为 <summary>，携带折叠后上下文发起网络重试
                     │
                     ▼
              [8045 网关] 接收到重试请求，执行健康状态机检查:
                     ├─ 条件 A: summary_already_done == true
                     ├─ 条件 B: 拥有单次接续令牌 is_post_compaction 或检测到接续标记
                     └─ 条件 C: tokens < before_tokens * 0.85 或 num_msgs < 50
                     │
                     ├─► 判定完成！消费销毁单次令牌 (防止终身免死)
                     └─► 返回原生 200 OK:
                         "Compacted conversation · saved 143k tokens"
```

---

## 三、客户端二进制微创 AST 补丁深度逆向

### 1. 官方修剪函数的 AST 原型 (以 2.1.286 版本为例)
通过反编译 `/Contents/MacOS/claude`，其原生修剪函数如下（函数名在不同构建中可能为 `khf` / `Gj1` / `yNt` / `rAt`）：
```javascript
function rAt(e, n, r) {
    let s = 0, g = 0;
    for (let h = n - 1; h >= 0; h--) {
        if (s += e[h], g++, s >= r) break;
    }
    if (g >= n - 1) return Math.max(1, Math.floor(n / 2));
    return g;
}
```
- 参数解析：
  - `e`: 各交互轮次（Turn Group）的 Token 大小数组 `[tok_0, tok_1, ...]`；
  - `n`: 交互组总数；
  - `r`: 目标削减量（由报错 gap 算出）。
- 致命缺陷：尾部的 `Math.max(1, Math.floor(n / 2))` 强制保留 50% 历史。

### 2. 135 字节等长原位替换（35k 活跃上下文硬预算）
为了彻底解除 50% 轮次绑架，直接注入 **35k（35,000 tokens）活跃上下文预算**：

```javascript
function rAt(e,n,r){let s=0,g=0;for(let h=n-1;h>=0;h--)if(s+=e[h],g++,s>=35000)break;return g;}/*                                    */
```

- **严格 135 字节等长填充**：末尾使用 JavaScript 注释 `/* ... */` 填补空格，保持 Mach-O 二进制文件大小和所有后续代码物理偏移 **0 漂移**；
- **按 Token 累加截断**：从最新的轮次往前数，只要保留的上下文累计达到 35,000 tokens，立即截断并返回保留轮数 `g`；
- **原子轮次不可分割约束**：Claude 协议要求一个交互轮次（User + Assistant ToolUse + ToolResult）是不可分割的。如果某一轮中包含 6 张高清错题截图（单轮达 100k），算法将严格保留这完整的一轮（避免切断图片导致 `tool_call_id` 失联崩溃），而将更早的 200k+ 历史全部送去总结。

---

## 四、macOS 系统级安全与完整性保全 (TCC / Codesign)

在逆向修改 macOS App Bundle 时，必须严格遵循系统安全规范：

### 1. 为什么用 8045 打过补丁后会请求文件夹权限并立即闪退？
- **TCC 权限检查崩溃**：当沙盒实例向用户请求文稿目录访问权限时，系统守护进程 `tccd` 和 `syspolicyd` 会强制读取应用 Bundle 内的 `Contents/Info.plist` 获取 `CFBundleIdentifier`；
- 若测试沙盒缺少 `Info.plist`，系统判定调用方身份非法，直接向应用进程发送 `SIGKILL` / `SIGABRT`（错误码 `RBSRequestErrorDomain`）；
- **根治**：系统扫描器和所有实例必须完备携带合法 `Info.plist`。

### 2. 为什么不能在 Bundle 内部存放 `.bak` 备份？
- macOS Gatekeeper 在启动应用时会校验 `CodeResources` 签名密封清单；
- 若在 `Contents/MacOS/` 下写入未经签名的 `claude.bak`，系统报 `unsealed contents found in the bundle root` 并阻断拉起；
- **根治**：所有备份外移至 App Bundle 外部专属隔离目录：
  `.../2.1.286/f2326db61802/.deep_compact_backups/claude.app.claude.bak`。

### 3. 代码重签名铁律
- 修改 Mach-O 二进制后，必须赋予可执行权限（`chmod 0o755`）；
- 必须使用 ad-hoc 递归重签名：
  ```bash
  codesign --force --sign - <bundle>/Contents/MacOS/claude
  codesign --force --deep --sign - <bundle.app>
  ```

---

## 五、Token 算力法典与官方 0-diff 绝对对齐

通过深入反编译 Claude 客户端的计词调用链（`Fm -> KNn -> hq -> Rn -> rd`），证实了官方的真实计算标准：

| 实体类型 | 官方真实算法 (`2.1.286` 反编译确认) | 网关旧算法 (失真根因) | 本次修复方案 (`estimator.rs`) |
| :--- | :--- | :--- | :--- |
| **高分辨率图片** | `if (e.type === "image") return 2000;` 固定 **2000 tokens/张** | 3MB 图片按字节折算 4800，tool_result 内 Base64 误当文本算成 **58,000 tokens** (虚高 29 倍) | 统一固定 **2000 tokens**，识别 `data:image/` 与 `iVBORw0KGgo` 强制拦截防膨胀 |
| **文本 / 代码** | `Math.round(e.length / 4)` (普通) / `Math.round(e.length / 2)` (JSON) | 拆分 ASCII (4) / CJK (1.5) 并**额外乘 1.15 虚高余量** | 去除 1.15 余量，ASCII 4.0，中文 2.2 紧密拟合 |
| **工具声明 (Tools)** | 紧凑 Schema 签名，21 个 MCP 工具在 `/context` 中仅计 **1.4k tokens** (平均 ~66 tokens/个) | 序列化完整巨大的 Description 和 JSON Schema，虚报 **15k - 20k tokens** | 紧凑统计名称与参数，按平均 **~70 tokens/工具** 计算 |

---

## 六、自动压缩与手动深度归档的智能互锁协同

为了让普通用户、轻度用户和极客长会话用户各取所需，网关在 `src-tauri/src/proxy/handlers/claude.rs` 中实现了双轨协同与智能互锁：

1. **自动响应式自愈 (`enable_cowork_auto_compact`)**：
   - 适用于不习惯敲命令的日常用户；
   - 当上下文自然累积达到设置的门限（如 200k）时，网关在后台静默注入 400 自愈信号驱动客户端折叠。
2. **手动深度归档穿透 (`enable_cowork_manual_compact`)**：
   - 适用于复杂重度任务，用户希望自由掌控压缩节奏；
   - 随时敲击 `./compact`，网关确定性拦截并闭环回显。
3. **两者的防撞车互锁保护**：
   - 当用户触发 `./compact` 进入手动压缩流程时，网关检测到 `is_in_manual_compact == true`，**自动压制自动门禁**，绝对杜绝双重 400 撞车导致客户端报 `compactionImpossible`；
   - 压缩完成后统一颁发单次接续保护令牌（`One-Shot Immunity`），平滑承接后续请求。

### 4. 渐进式解耦架构（只开开关 vs 配合补丁）

| 操作模式 | 文件侵入性 | 客户端修剪算法 | 上下文削减率 | 适用人群 |
| :--- | :--- | :--- | :--- | :--- |
| **仅开启开关** | **100% 零侵入**（不修改本地文件） | 官方原生折半算法 | **约 30% 至 50%**（折半裁剪） | 保守型用户、企业环境、无 root 权限环境 |
| **开启开关 + 注入微创补丁** | 原位修改 135 字节，自动隔离备份 | 35k 活跃上下文硬预算截断 | **约 85% 至 95%**（极限瘦身至 20k - 35k） | 重度长会话极客、追求极致响应速度者 |

---

## 七、未来维护者排错与自适应指南 (Troubleshooting Guide)

### Q1: 官方发布全新版本后，微创补丁提示“未匹配到目标修剪特征”怎么办？
**排查步骤**：
1. 打开最新版二进制进行混淆函数搜索：
   ```bash
   python3 -c "
   import re
   with open('/path/to/claude', 'rb') as f: data = f.read()
   # 匹配标准修剪循环
   pat = re.compile(rb'function\s+([a-zA-Z0-9_$]+)\(([a-zA-Z0-9_$]+),([a-zA-Z0-9_$]+),([a-zA-Z0-9_$]+)\)\{let\s+[a-zA-Z0-9_$]+=0.*?Math\.floor\(\3/2\)\);return\s+[a-zA-Z0-9_$]+\}')
   m = pat.search(data)
   if m: print('Found function:', m.group(1))
   "
   ```
2. 提取出新的函数名与参数，更新 `patch.rs` 中的正则表达式即可完成自适应。

### Q2: 用户反馈敲 `./compact` 后客户端弹出红字“Prompt is too long”怎么办？
**排查步骤**：
1. 查看网关日志是否有连续两个 400 报警：
   - 检查 `is_compaction_request` 是否未识别到客户端发送的总结 Prompt；
   - 检查是否有其他代理插件篡改了 Header；
2. 检查会话是否未消费单次令牌：确保 `COMPACTION_ONE_SHOT_SESSIONS` 正常写入与消费。

### Q3: 为什么执行 compact 后，`/context` 显示 Messages 还有较多 tokens？
**物理检查**：
1. 检查会话最后这一轮交互中是否包含连续多张高清大图或超长终端输出；
2. 只要最新轮次本身是一个包含大图的原子块，算法会严格保护最新轮次不被腰斩；
3. 用户在当前会话随意回复一句话后再次输入 `./compact`，该批图片成为历史轮次后便会被 100% 打包削减。

---

*文档生效日期: 2026-10-02*  
*代码基线: Antigravity-Manager v4.9.0*
