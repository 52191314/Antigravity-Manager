import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    FlaskConical,
    Terminal,
    Bot,
    Cpu,
    Layout,
    Swords,
    Boxes,
    Code2,
    CheckCheck,
    XCircle,
    RefreshCw,
    ArrowRightLeft,
    Share2,
    LucideIcon
} from 'lucide-react';
import { AntigravityLabConfig } from '../../types/config';
import { request } from '../../utils/request';
import { showToast } from '../common/ToastContainer';

interface AntigravityLabSettingsProps {
    config?: AntigravityLabConfig;
    onChange: (config: AntigravityLabConfig) => void;
    antigravityArgs?: string[];
    onArgsChange?: (args: string[]) => void;
}

export const DEFAULT_LAB_CONFIG: AntigravityLabConfig = {
    enable_owl_slash_command: false,
    jetski_autonomous_mode: false,
    disable_teamwork_forced_flash_model: false,
    jetski_generative_ui: false,
    enable_battle_mode: false,
    enable_subagent_hub: false,
    enable_programmatic_tools: false,
};

interface LabExperimentItem {
    key: keyof AntigravityLabConfig;
    cliFlag: string;
    titleKey: string;
    descKey: string;
    defaultTitle: string;
    defaultDesc: string;
    icon: LucideIcon;
    colorClasses: string;
}

export const EXPERIMENT_ITEMS: LabExperimentItem[] = [
    {
        key: 'enable_owl_slash_command',
        cliFlag: '--enable-owl-slash-command',
        titleKey: 'settings.lab.owl_slash_command_title',
        descKey: 'settings.lab.owl_slash_command_desc',
        defaultTitle: 'Owl Slash Command',
        defaultDesc: 'Enables the /owl slash command for agentic codebase exploration and deep autonomous synthesis.',
        icon: Terminal,
        colorClasses: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
    },
    {
        key: 'jetski_autonomous_mode',
        cliFlag: '--jetski-autonomous-mode',
        titleKey: 'settings.lab.jetski_autonomous_mode_title',
        descKey: 'settings.lab.jetski_autonomous_mode_desc',
        defaultTitle: 'Jetski Autonomous Mode',
        defaultDesc: 'Unlocks non-interactive, multi-turn autonomous execution for complex engineering workflows without manual interruption.',
        icon: Bot,
        colorClasses: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
    },
    {
        key: 'disable_teamwork_forced_flash_model',
        cliFlag: '--disable-teamwork-forced-flash-model',
        titleKey: 'settings.lab.disable_teamwork_forced_flash_model_title',
        descKey: 'settings.lab.disable_teamwork_forced_flash_model_desc',
        defaultTitle: 'Disable Teamwork Forced Flash Model',
        defaultDesc: 'Allows subagents in Teamwork mode to inherit parent model capabilities (e.g., Pro/Ultra) instead of being locked to Flash.',
        icon: Cpu,
        colorClasses: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
    },
    {
        key: 'jetski_generative_ui',
        cliFlag: '--jetski-generative-ui',
        titleKey: 'settings.lab.jetski_generative_ui_title',
        descKey: 'settings.lab.jetski_generative_ui_desc',
        defaultTitle: 'Jetski Generative UI',
        defaultDesc: 'Renders interactive dynamic UI widgets, charts, and visualizations directly within agent conversation turns.',
        icon: Layout,
        colorClasses: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
    },
    {
        key: 'enable_battle_mode',
        cliFlag: '--enable-battle-mode',
        titleKey: 'settings.lab.battle_mode_title',
        descKey: 'settings.lab.battle_mode_desc',
        defaultTitle: 'Battle Mode (Multi-Agent Arena)',
        defaultDesc: 'Runs competing models side-by-side on the same prompt to benchmark quality, reasoning depth, and latency in real time.',
        icon: Swords,
        colorClasses: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
    },
    {
        key: 'enable_subagent_hub',
        cliFlag: '--enable-subagent-hub',
        titleKey: 'settings.lab.subagent_hub_title',
        descKey: 'settings.lab.subagent_hub_desc',
        defaultTitle: 'Subagent Hub',
        defaultDesc: 'Provides a centralized dashboard for tracking, debugging, and managing distributed subagent lifecycles and transcripts.',
        icon: Boxes,
        colorClasses: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/30',
    },
    {
        key: 'enable_programmatic_tools',
        cliFlag: '--enable-programmatic-tools',
        titleKey: 'settings.lab.programmatic_tools_title',
        descKey: 'settings.lab.programmatic_tools_desc',
        defaultTitle: 'Programmatic Tools Execution',
        defaultDesc: 'Enables direct code-based tool execution pipelines for high-throughput data processing and headless tool chaining.',
        icon: Code2,
        colorClasses: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30',
    },
];

export function syncArgsWithLabConfig(currentArgs: string[] = [], labConfig: AntigravityLabConfig): string[] {
    let result = [...currentArgs];
    for (const item of EXPERIMENT_ITEMS) {
        const flag = item.cliFlag;
        const isEnabled = !!labConfig[item.key];

        // 移除该 flag 现有的任何形式（如 --flag, --flag=true, --flag=false）
        result = result.filter(arg => {
            const trimmed = arg.trim();
            return !(trimmed === flag || trimmed.startsWith(`${flag}=`));
        });

        // 若已开启，则写入 --flag=true
        if (isEnabled) {
            result.push(`${flag}=true`);
        }
    }
    return result;
}

export default function AntigravityLabSettings({
    config = DEFAULT_LAB_CONFIG,
    onChange,
    antigravityArgs = [],
    onArgsChange,
}: AntigravityLabSettingsProps) {
    const { t } = useTranslation();
    const currentConfig: AntigravityLabConfig = {
        ...DEFAULT_LAB_CONFIG,
        ...config,
    };

    const [isSyncingCli, setIsSyncingCli] = useState(false);
    const [isLoadingCli, setIsLoadingCli] = useState(false);
    const [autoSyncArgs, setAutoSyncArgs] = useState<boolean>(() => {
        const saved = localStorage.getItem('antigravity_lab_auto_sync_args');
        return saved !== 'false';
    });

    const activeCount = EXPERIMENT_ITEMS.filter(item => currentConfig[item.key]).length;

    const handleToggle = (key: keyof AntigravityLabConfig, enabled: boolean) => {
        const nextConfig: AntigravityLabConfig = {
            ...currentConfig,
            [key]: enabled,
        };
        onChange(nextConfig);

        if (autoSyncArgs && onArgsChange) {
            const nextArgs = syncArgsWithLabConfig(antigravityArgs, nextConfig);
            onArgsChange(nextArgs);
        }
    };

    const handleEnableAll = () => {
        const nextConfig: AntigravityLabConfig = {
            enable_owl_slash_command: true,
            jetski_autonomous_mode: true,
            disable_teamwork_forced_flash_model: true,
            jetski_generative_ui: true,
            enable_battle_mode: true,
            enable_subagent_hub: true,
            enable_programmatic_tools: true,
        };
        onChange(nextConfig);

        if (autoSyncArgs && onArgsChange) {
            const nextArgs = syncArgsWithLabConfig(antigravityArgs, nextConfig);
            onArgsChange(nextArgs);
        }
    };

    const handleDisableAll = () => {
        const nextConfig: AntigravityLabConfig = {
            enable_owl_slash_command: false,
            jetski_autonomous_mode: false,
            disable_teamwork_forced_flash_model: false,
            jetski_generative_ui: false,
            enable_battle_mode: false,
            enable_subagent_hub: false,
            enable_programmatic_tools: false,
        };
        onChange(nextConfig);

        if (autoSyncArgs && onArgsChange) {
            const nextArgs = syncArgsWithLabConfig(antigravityArgs, nextConfig);
            onArgsChange(nextArgs);
        }
    };

    const handleToggleAutoSync = (enabled: boolean) => {
        setAutoSyncArgs(enabled);
        localStorage.setItem('antigravity_lab_auto_sync_args', String(enabled));
        if (enabled && onArgsChange) {
            const nextArgs = syncArgsWithLabConfig(antigravityArgs, currentConfig);
            onArgsChange(nextArgs);
            showToast(t('settings.lab.sync_startup_args_success', { defaultValue: 'Startup arguments updated to match active lab flags.' }), 'success');
        }
    };

    const handleManualSyncStartupArgs = () => {
        if (onArgsChange) {
            const nextArgs = syncArgsWithLabConfig(antigravityArgs, currentConfig);
            onArgsChange(nextArgs);
            showToast(t('settings.lab.sync_startup_args_success', { defaultValue: 'Startup arguments updated to match active lab flags.' }), 'success');
        }
    };

    const handleSyncCli = async () => {
        setIsSyncingCli(true);
        try {
            await request('sync_cli_experiments', { experiments: currentConfig });
            showToast(t('settings.lab.sync_cli_success', { defaultValue: 'Successfully synced experimental features to CLI settings (~/.gemini/antigravity-cli/settings.json)' }), 'success');
        } catch (error) {
            console.error('Failed to sync to CLI settings:', error);
            showToast(`${t('settings.lab.sync_cli_error', { defaultValue: 'Failed to sync to CLI settings' })}: ${error}`, 'error');
        } finally {
            setIsSyncingCli(false);
        }
    };

    const handleLoadCli = async () => {
        setIsLoadingCli(true);
        try {
            const cliData = await request<AntigravityLabConfig>('get_cli_experiments');
            if (cliData && typeof cliData === 'object') {
                const nextConfig = {
                    ...currentConfig,
                    ...cliData,
                };
                onChange(nextConfig);
                if (autoSyncArgs && onArgsChange) {
                    const nextArgs = syncArgsWithLabConfig(antigravityArgs, nextConfig);
                    onArgsChange(nextArgs);
                }
                showToast(t('settings.lab.load_cli_success', { defaultValue: 'Successfully loaded experimental features from CLI settings' }), 'success');
            }
        } catch (error) {
            console.error('Failed to load CLI settings:', error);
            showToast(`${t('settings.lab.load_cli_error', { defaultValue: 'Failed to load CLI settings' })}: ${error}`, 'error');
        } finally {
            setIsLoadingCli(false);
        }
    };

    return (
        <div className="border border-purple-200/60 dark:border-purple-900/30 bg-purple-50/20 dark:bg-purple-950/10 rounded-xl p-4 sm:p-5 space-y-4 my-4">
            {/* 1. Header Card */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-purple-100 dark:border-purple-900/30">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 border border-purple-200 dark:border-purple-800/40">
                        <FlaskConical size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">
                                {t('settings.lab.title', { defaultValue: 'Antigravity Lab (实验性特性开关)' })}
                            </h4>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold border border-purple-200 dark:border-purple-800/40 flex items-center gap-1">
                                <span>🧪</span>
                                {t('settings.lab.badge', { defaultValue: 'Experimental Lab' })}
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded bg-base-200 dark:bg-base-300 text-base-content/70 font-mono">
                                {activeCount} / {EXPERIMENT_ITEMS.length} Active
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
                            {t('settings.lab.desc', {
                                defaultValue: 'Configure cutting-edge experimental features for the Antigravity engine and CLI. Flags can be synced dynamically with CLI configurations (~/.gemini/antigravity-cli/settings.json) and startup arguments.',
                            })}
                        </p>
                    </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
                    <button
                        type="button"
                        onClick={handleEnableAll}
                        className="btn btn-xs rounded-none border border-base-content/30 text-base-content font-bold uppercase tracking-wider hover:bg-base-content hover:text-base-100 flex items-center gap-1"
                        title={t('settings.lab.enable_all', { defaultValue: 'Enable All' })}
                    >
                        <CheckCheck size={12} />
                        {t('settings.lab.enable_all', { defaultValue: 'Enable All' })}
                    </button>
                    <button
                        type="button"
                        onClick={handleDisableAll}
                        className="btn btn-xs rounded-none border border-base-content/30 text-base-content font-bold uppercase tracking-wider hover:bg-base-content hover:text-base-100 flex items-center gap-1"
                        title={t('settings.lab.disable_all', { defaultValue: 'Disable All' })}
                    >
                        <XCircle size={12} />
                        {t('settings.lab.disable_all', { defaultValue: 'Disable All' })}
                    </button>
                </div>
            </div>

            {/* 2. Startup Arguments & CLI Synchronization Hub */}
            <div className="bg-base-100/70 dark:bg-base-200/50 border border-purple-100 dark:border-purple-900/20 rounded-lg p-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-md bg-purple-100/50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5">
                            <ArrowRightLeft size={16} />
                        </div>
                        <div className="space-y-0.5">
                            <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                                {t('settings.lab.auto_sync_args', { defaultValue: 'Auto-sync with Startup Arguments (antigravity_args)' })}
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                {t('settings.lab.auto_sync_args_desc', {
                                    defaultValue: 'When enabled, active flags are automatically mirrored in Desktop IDE startup arguments (e.g. --enable-owl-slash-command=true) so the desktop client receives them on startup.',
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <button
                            type="button"
                            onClick={handleManualSyncStartupArgs}
                            className="btn btn-xs btn-ghost rounded-none border border-base-content/20 text-base-content text-[11px]"
                        >
                            {t('settings.lab.sync_startup_args_btn', { defaultValue: 'Apply to Startup Args' })}
                        </button>

                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={autoSyncArgs}
                                onChange={(e) => handleToggleAutoSync(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-gray-600 peer-checked:bg-purple-600"></div>
                        </label>
                    </div>
                </div>

                {/* CLI Synchronization Buttons */}
                <div className="pt-2 border-t border-base-200 dark:border-base-300 flex flex-wrap items-center gap-2 justify-between">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                        ~/.gemini/antigravity-cli/settings.json
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={handleLoadCli}
                            disabled={isLoadingCli}
                            className="btn btn-xs rounded-none border border-base-content/30 text-base-content font-bold uppercase tracking-wider hover:bg-base-content hover:text-base-100 flex items-center gap-1.5"
                        >
                            <RefreshCw size={12} className={isLoadingCli ? 'animate-spin' : ''} />
                            {isLoadingCli
                                ? t('settings.lab.loading_cli', { defaultValue: 'Loading...' })
                                : t('settings.lab.load_cli_btn', { defaultValue: 'Fetch from CLI' })}
                        </button>
                        <button
                            type="button"
                            onClick={handleSyncCli}
                            disabled={isSyncingCli}
                            className="btn btn-xs btn-primary rounded-none font-bold uppercase tracking-wider flex items-center gap-1.5"
                        >
                            <Share2 size={12} className={isSyncingCli ? 'animate-spin' : ''} />
                            {isSyncingCli
                                ? t('settings.lab.syncing_cli', { defaultValue: 'Syncing...' })
                                : t('settings.lab.sync_cli_btn', { defaultValue: 'Sync to CLI Settings (~/.gemini/antigravity-cli/settings.json)' })}
                        </button>
                    </div>
                </div>
            </div>

            {/* 3. Seven Experimental Toggles */}
            <div className="space-y-2.5">
                {EXPERIMENT_ITEMS.map((item) => {
                    const isEnabled = !!currentConfig[item.key];
                    const IconComponent = item.icon;

                    return (
                        <div
                            key={item.key}
                            className={`p-3 rounded-lg border transition-all duration-200 flex items-start justify-between gap-3 ${
                                isEnabled
                                    ? 'bg-purple-50/30 dark:bg-purple-950/20 border-purple-300/80 dark:border-purple-800/60 shadow-xs'
                                    : 'bg-white/70 dark:bg-base-100/70 border-base-200 dark:border-base-300/60 hover:border-purple-200 dark:hover:border-purple-900/40'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-lg border mt-0.5 shrink-0 ${item.colorClasses}`}>
                                    <IconComponent size={16} />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-xs text-gray-900 dark:text-gray-100">
                                            {t(item.titleKey, { defaultValue: item.defaultTitle })}
                                        </span>
                                        <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-base-200 dark:bg-base-300 text-purple-700 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/40">
                                            {item.cliFlag}
                                        </code>
                                    </div>
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                                        {t(item.descKey, { defaultValue: item.defaultDesc })}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                <span className={`text-[11px] font-medium hidden sm:inline ${isEnabled ? 'text-purple-600 dark:text-purple-400 font-semibold' : 'text-gray-400'}`}>
                                    {isEnabled
                                        ? t('common.enabled', { defaultValue: 'Enabled' })
                                        : t('common.disabled', { defaultValue: 'Disabled' })}
                                </span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isEnabled}
                                        onChange={(e) => handleToggle(item.key, e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-gray-600 peer-checked:bg-purple-600"></div>
                                </label>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
