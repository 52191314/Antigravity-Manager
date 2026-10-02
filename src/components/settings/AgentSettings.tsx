import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, Check, Bot, Laptop, ShieldCheck, Zap, AlertTriangle, Wrench, RotateCcw, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ExperimentalConfig } from "../../types/config";
import { showToast } from "../common/ToastContainer";

interface AgentSettingsProps {
    experimentalConfig?: ExperimentalConfig;
    onChange: (updates: Partial<ExperimentalConfig>) => void;
    onSave?: () => Promise<void> | void;
}

export const AgentSettings: React.FC<AgentSettingsProps> = ({
    experimentalConfig,
    onChange,
    onSave,
}) => {
    const { t } = useTranslation();
    const [isSaving, setIsSaving] = useState(false);
    const [savedSuccessfully, setSavedSuccessfully] = useState(false);

    const isEnabled = experimentalConfig?.enable_cowork_auto_compact ?? false;
    const threshold = experimentalConfig?.cowork_compact_threshold ?? 200000;
    const isManualCompactEnabled = experimentalConfig?.enable_cowork_manual_compact ?? false;

    const [patchStatus, setPatchStatus] = useState<{ is_patched: boolean; is_patchable: boolean; message: string; file_path: string; available_installations?: Array<{ version: string; path: string; is_patched: boolean; size_mb: number }> } | null>(null);
    const [selectedPath, setSelectedPath] = useState<string>("");
    const [customPath, setCustomPath] = useState<string>("");
    const [isCheckingPatch, setIsCheckingPatch] = useState(false);
    const [isPatching, setIsPatching] = useState(false);

    const activeTargetPath = customPath.trim() || selectedPath.trim() || undefined;

    const handleCheckPatch = async (pathOverride?: string) => {
        setIsCheckingPatch(true);
        try {
            const p = pathOverride !== undefined ? pathOverride : activeTargetPath;
            const res = await invoke<any>("check_claude_cowork_patch", { filePath: p || null });
            setPatchStatus(res);
            if (!selectedPath && res.file_path) {
                setSelectedPath(res.file_path);
            }
            showToast(res.message, res.is_patched ? "success" : "info");
        } catch (err: any) {
            showToast(String(err), "error");
        } finally {
            setIsCheckingPatch(false);
        }
    };

    const handleApplyPatch = async () => {
        setIsPatching(true);
        try {
            const res = await invoke<string>("apply_claude_cowork_patch", { filePath: activeTargetPath || null });
            showToast(res, "success");
            await handleCheckPatch();
        } catch (err: any) {
            showToast(String(err), "error");
        } finally {
            setIsPatching(false);
        }
    };

    const handleRevertPatch = async () => {
        setIsPatching(true);
        try {
            const res = await invoke<string>("revert_claude_cowork_patch", { filePath: activeTargetPath || null });
            showToast(res, "success");
            await handleCheckPatch();
        } catch (err: any) {
            showToast(String(err), "error");
        } finally {
            setIsPatching(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (onSave) {
                await onSave();
            }
            setSavedSuccessfully(true);
            showToast(t("common.success", { defaultValue: "特定 Agent 设置已保存" }), "success");
            setTimeout(() => setSavedSuccessfully(false), 2000);
        } catch (error: any) {
            console.error("保存特定 Agent 设置失败:", error);
            showToast(t("common.error", { defaultValue: "保存失败" }), "error");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-5 text-gray-800 dark:text-gray-200">
            {/* 顶栏说明提示 */}
            <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/20 rounded-xl border border-blue-200/70 dark:border-blue-800/40 text-xs leading-relaxed space-y-1">
                <div className="font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                    <Bot size={14} className="text-blue-600 dark:text-blue-400" />
                    {t("proxy.agent_settings.banner_title", { defaultValue: "特定 Agent 专属特性与优化治理" })}
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    {t("proxy.agent_settings.banner_desc", {
                        defaultValue: "针对主流智能体（Claude Desktop、Claude Code、Cursor、Cline 等）的客户端特异性机制与沙箱限制，提供非侵入式的网关级调度协同。默认保持纯净线缆，仅在启用后对指定 Agent 流量精准介入。"
                    })}
                </p>
            </div>

            {/* 板块 1: Claude Desktop 板块 */}
            <div className="p-4 bg-gray-50/70 dark:bg-base-200/60 rounded-xl border border-gray-200/70 dark:border-base-300 space-y-4">
                {/* 标题栏 */}
                <div className="flex items-center justify-between pb-3 border-b border-gray-200/60 dark:border-base-300/60">
                    <div className="flex items-center gap-2">
                        <Laptop size={16} className="text-cyan-500" />
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                            {t("proxy.agent_settings.claude_desktop.title", { defaultValue: "Claude Desktop 系列" })}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300">
                            {t("proxy.agent_settings.claude_desktop.tag", { defaultValue: "Cowork 模式专属" })}
                        </span>
                    </div>
                </div>

                {/* Cowork 模式自动响应式自愈压缩开关 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200/60 dark:border-base-300/60">
                    <div className="space-y-0.5 max-w-xl">
                        <div className="text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                            <Zap size={14} className="text-amber-500" />
                            {t("proxy.agent_settings.claude_desktop.auto_compact_title", {
                                defaultValue: "Cowork 模式自动响应式压缩自愈 (Auto Reactive Compact)"
                            })}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                            {t("proxy.agent_settings.claude_desktop.auto_compact_desc", {
                                defaultValue: "针对 Cowork 模式无法敲击 /compact 且沙箱旁路本地配置、高频全屏截屏导致上下文迅速膨胀至 200k+（单次 JSON 达 20~36MB）引发几十秒卡顿的顽疾。开启后，网关在后台实行双重确权校验（严格识别 Cowork 会话并对压缩总结请求无条件豁免放行），就地触发客户端内置 Summarizer 自动打上 compact_boundary 折叠历史与截图，恢复秒级极速响应。默认关闭以完整享受 Gemini 100万 Token 超长上下文。"
                            })}
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                        <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={(e) => onChange({ enable_cowork_auto_compact: e.target.checked })}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-hidden rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-cyan-600"></div>
                    </label>
                </div>

                {/* 阈值编辑区 (仅开启时可用) */}
                <div className={`space-y-3 transition-all duration-200 ${isEnabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5">
                            <label className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                                {t("proxy.agent_settings.claude_desktop.threshold_label", {
                                    defaultValue: "压缩触发门限 (Tokens)"
                                })}
                            </label>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                {t("proxy.agent_settings.claude_desktop.threshold_desc", {
                                    defaultValue: "当 Cowork 会话预估 Token 水位达到此数值时触发自愈信号。全屏截图按官方规格精准折算（~1600 tokens/张）。"
                                })}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min={50000}
                                max={500000}
                                step={10000}
                                value={threshold}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (!isNaN(val)) {
                                        onChange({ cowork_compact_threshold: Math.max(50000, val) });
                                    }
                                }}
                                className="w-32 px-3 py-1.5 text-xs text-right font-mono bg-white dark:bg-base-100 border border-gray-300 dark:border-base-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-cyan-500"
                            />
                            <span className="text-xs text-gray-500 dark:text-gray-400">Tokens</span>
                        </div>
                    </div>

                    {/* 快捷推荐预设胶囊 */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 mr-1">快捷预设:</span>
                        {[
                            { label: "150,000 (极速)", val: 150000 },
                            { label: "180,000 (敏捷)", val: 180000 },
                            { label: "200,000 (官方推荐)", val: 200000 },
                            { label: "250,000 (宽裕)", val: 250000 },
                        ].map((preset) => (
                            <button
                                key={preset.val}
                                type="button"
                                onClick={() => onChange({ cowork_compact_threshold: preset.val })}
                                className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-all ${
                                    threshold === preset.val
                                        ? "bg-cyan-500 text-white shadow-xs"
                                        : "bg-white dark:bg-base-100 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-base-300 hover:border-cyan-300 dark:hover:border-cyan-700"
                                }`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {/* 双重校验安全保障提示 */}
                    <div className="flex items-start gap-2 p-2.5 bg-amber-50/60 dark:bg-amber-950/20 rounded-lg border border-amber-200/60 dark:border-amber-800/30 text-[11px] text-amber-800 dark:text-amber-300">
                        <ShieldCheck size={14} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                        <span>
                            {t("proxy.agent_settings.claude_desktop.safety_note", {
                                defaultValue: "后台双重安全校验：① 仅对 tools 显式包含 mcp__cowork 的桌面会话生效，普通 CLI / Cursor 绝对零误伤；② 对携带 x-stainless-helper: compaction 或 Prompt 包含官方压缩签名的总结请求无条件放行，绝对杜绝卡死会话。"
                            })}
                        </span>
                    </div>
                </div>

                {/* ===== 高危进阶选项：Claude Cowork 深度归档增强 (Deep Compact) ===== */}
                <div className="pt-4 border-t border-red-200/60 dark:border-red-900/30 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-semibold text-xs text-red-700 dark:text-red-400">
                                <AlertTriangle size={14} className="text-red-600 dark:text-red-400 shrink-0" />
                                <span>⚠️ 高危选项：Claude Cowork 深度归档增强 (Deep Compact)</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 font-normal">
                                    非必要请勿开启
                                </span>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                                针对 Claude Cowork 模式无法通过 /compact 进行深度归档（被桌面拦截为未注册 Skill 且官方修剪逻辑强制保留 50% 历史）的底层缺陷。
                                开启后：① 网关支持捕获 <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded font-mono text-[10px]">./compact</code> 文本穿透并就地协调响应式压缩；
                                ② 配合下方外置微创补丁将历史 100% 深度归档入摘要，基底压缩至 5k~15k tokens（释放率 85%~95%），并动态核算回显真实释放量。默认关闭。
                            </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                            <input
                                type="checkbox"
                                checked={isManualCompactEnabled}
                                onChange={(e) => onChange({ enable_cowork_manual_compact: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-hidden rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-red-600"></div>
                        </label>
                    </div>

                    {/* 外置微创补丁操作区 (与网关完全解耦) */}
                    <div className="p-3 bg-red-50/40 dark:bg-red-950/10 rounded-lg border border-red-200/50 dark:border-red-900/20 space-y-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="text-[11px] text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                <Wrench size={13} className="text-red-500 shrink-0" />
                                <span className="font-medium">客户端二进制微创补丁工具 (仅 macOS)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleCheckPatch()}
                                    disabled={isCheckingPatch}
                                    className="btn btn-xs bg-white dark:bg-base-100 border border-gray-200 dark:border-base-300 hover:border-red-300 text-gray-700 dark:text-gray-300 text-[11px] gap-1"
                                >
                                    <RefreshCw size={11} className={isCheckingPatch ? "animate-spin text-red-500" : ""} />
                                    检查补丁状态
                                </button>
                                <button
                                    type="button"
                                    onClick={handleApplyPatch}
                                    disabled={isPatching}
                                    className="btn btn-xs bg-red-600 hover:bg-red-700 text-white text-[11px] gap-1 shadow-xs"
                                >
                                    <Wrench size={11} />
                                    一键注入补丁
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRevertPatch}
                                    disabled={isPatching}
                                    className="btn btn-xs bg-gray-200 dark:bg-base-300 hover:bg-gray-300 dark:hover:bg-base-100 text-gray-700 dark:text-gray-300 text-[11px] gap-1"
                                >
                                    <RotateCcw size={11} />
                                    还原原生
                                </button>
                            </div>
                        </div>

                        {/* 目标版本自动发现选择器与自定义路径 */}
                        <div className="space-y-1.5 pt-1 text-[11px]">
                            {patchStatus?.available_installations && patchStatus.available_installations.length > 0 && (
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <span className="text-gray-500 dark:text-gray-400 shrink-0">检测到本机安装:</span>
                                    <select
                                        value={selectedPath}
                                        onChange={(e) => {
                                            setSelectedPath(e.target.value);
                                            setCustomPath("");
                                            handleCheckPatch(e.target.value);
                                        }}
                                        className="select select-xs select-bordered bg-white dark:bg-base-100 text-[11px] font-mono flex-1 truncate"
                                    >
                                        {patchStatus.available_installations.map((inst, idx) => (
                                            <option key={idx} value={inst.path}>
                                                v{inst.version} ({inst.size_mb} MB) {inst.is_patched ? " [已打补丁]" : " [官方原版]"} - {inst.path}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <span className="text-gray-500 dark:text-gray-400 shrink-0">自定义路径:</span>
                                <input
                                    type="text"
                                    value={customPath}
                                    placeholder="可选：输入自定义 claude 或 .app 路径进行测试/修补"
                                    onChange={(e) => setCustomPath(e.target.value)}
                                    onBlur={() => {
                                        if (customPath.trim()) {
                                            handleCheckPatch(customPath.trim());
                                        }
                                    }}
                                    className="input input-xs input-bordered bg-white dark:bg-base-100 text-[11px] font-mono flex-1"
                                />
                            </div>
                        </div>

                        {patchStatus && (
                            <div className={`p-2 rounded text-[11px] border font-mono ${
                                patchStatus.is_patched
                                    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/40 text-green-800 dark:text-green-300"
                                    : "bg-gray-100 dark:bg-base-100 border-gray-200 dark:border-base-300 text-gray-700 dark:text-gray-300"
                            }`}>
                                <div className="font-semibold mb-0.5">{patchStatus.message}</div>
                                <div className="text-[10px] text-gray-500 truncate" title={patchStatus.file_path}>生效路径: {patchStatus.file_path}</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 保存按钮 */}
            {onSave && (
                <div className="flex justify-end pt-2">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`btn btn-sm text-xs gap-1.5 font-medium transition-all ${
                            savedSuccessfully
                                ? "bg-green-600 hover:bg-green-700 text-white"
                                : "bg-cyan-600 hover:bg-cyan-700 text-white shadow-xs"
                        }`}
                    >
                        {savedSuccessfully ? (
                            <>
                                <Check size={14} />
                                {t("common.saved", { defaultValue: "已保存" })}
                            </>
                        ) : (
                            <>
                                <Save size={14} />
                                {isSaving ? t("common.saving", { defaultValue: "保存中..." }) : t("common.save", { defaultValue: "保存设置" })}
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};

export default AgentSettings;
