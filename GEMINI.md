# Antigravity Manager Development Guidelines

## 1. Quota & Account Model Invariants

- **Strict Quota Decoupling (Gemini vs. 3P/Claude)**:
  - Antigravity accounts maintain independent quota pools: `Gemini Models` and `Claude and GPT models` (3P).
  - Claude weekly quota exhausts quickly (often at 0%), while Gemini quota remains fully available (100%).
  - **NEVER** use `Math.min(...)` across both pools or allow Claude quota exhaustion to zero out, throttle, or degrade Gemini quota calculations, summaries, or sorting rank.
  - The main summary pills and fleet capacity metrics represent **Gemini Quota** by default.
  - Accounts with exhausted Claude weekly quota are still fully capable of servicing Gemini requests and must be marked ready if Gemini quota is available.

- **Sorting & Priority Logic**:
  - When sorting accounts by reset time (e.g. `reset_5h_weekly_priority`), evaluate **Gemini** weekly quota so accounts with large available Gemini budgets receive higher priority.
  - Sorting by highest quota must reflect Gemini effective quota.

## 2. UI & UX Conventions

- **Email & Account Display**:
  - For standard emails (especially `@gmail.com`), display and truncation should emphasize the username prefix before `@` rather than trailing ellipses that obscure identity.
- **Notifications & Banners**:
  - Notifications, toasts, and alert banners must be positioned on the right side and be non-blocking.

## 3. Windows Build & Deployment Workflow

When compiling and delivering changes for Antigravity Tools on Windows:
1. **Verification**: Run `npx tsc --noEmit` and `npm run build` to ensure 0 frontend compilation or bundling errors.
2. **Binary Build**: Execute `cmd.exe /c "build_exe.bat"`.
3. **Hot Deployment**:
   - Check and gracefully terminate any running `antigravity-tools.exe` process (`Stop-Process -Name "antigravity-tools" -Force`).
   - Copy `src-tauri\target\release\antigravity-tools.exe` to:
     - `D:\02_Projects\Antigravity-Manager\Antigravity-Tools.exe`
     - `C:\Users\Renzu\AppData\Local\Antigravity Tools\antigravity-tools.exe`
   - Restart the executable from `C:\Users\Renzu\AppData\Local\Antigravity Tools\antigravity-tools.exe`.

## 4. Windows Startup & Window Lifecycle Invariants

- **Default Window Visibility**:
  - In `src-tauri/tauri.conf.json`, `windows[0].visible` MUST remain `true`.
  - **NEVER** set `visible: false` relying on delayed frontend dynamic imports (`import("@tauri-apps/api/core").then(...)`) to show the window.
  - Quiet startup policies (`--minimized` on login) must hide the window to tray via backend lifecycle hooks (`apply_login_launch_policy`), while normal user launches remain visible and focused immediately.

- **Agent Sandbox Desktop vs. User Interactive Desktop (`WinSta0\default`)**:
  - Automated agent tools (`run_command`) execute under an isolated desktop station (`exebox-...`) and Windows Job Object.
  - **NEVER** leave desktop GUI binaries running from inside `run_command` expecting the user to see them on their screen. They will be trapped on the virtual desktop, hold single-instance mutexes/sockets against the user, and terminate abruptly when the tool step ends.
  - For verification: deploy binaries to canonical paths (`AppData\Local\Antigravity Tools` and project root), stop lingering sandbox test processes, and let the user launch directly from their native desktop shortcut.

- **Headless Port 8045 Takeover & Single-Instance Bounds**:
  - Desktop GUI launches must check port 8045 for running `--headless` background instances, issuing graceful `/system/shutdown` and waiting for port release before binding.
  - Secondary launches must complete single-instance handoffs with strict timeout bounds (<= 1.5s) and exit cleanly with code 0 in < 3s, never creating zombie processes.
