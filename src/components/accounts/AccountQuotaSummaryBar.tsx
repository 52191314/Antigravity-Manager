import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Zap,
    Calendar,
    CalendarDays,
    Sparkles,
    Info,
    ChevronDown,
    X,
    Layers,
    Cpu,
    Bot,
} from 'lucide-react';
import { Account } from '../../types/account';
import { QuotaWindow } from '../../pages/Accounts';
import { cn } from '../../utils/cn';

interface AccountQuotaSummaryBarProps {
    accounts: Account[];
    totalAccountsCount?: number;
    quotaWindow: QuotaWindow;
    onSelectWindow?: (window: QuotaWindow) => void;
}

interface FleetQuotaStats {
    totalAccounts: number;
    activeAccounts: number;
    readyAccounts: number;
    exhaustedAccounts: number;
    disabledAccounts: number;
    sum5h: number;
    sumWeekly: number;
    sumMonthly: number;
    equiv5h: string;
    equivWeekly: string;
    equivMonthly: string;
    gemini5hSum: number;
    claude5hSum: number;
    geminiWeeklySum: number;
    claudeWeeklySum: number;
}

export default function AccountQuotaSummaryBar({
    accounts,
    totalAccountsCount,
    quotaWindow,
    onSelectWindow,
}: AccountQuotaSummaryBarProps) {
    const { t } = useTranslation();
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const detailsRef = useRef<HTMLDivElement>(null);

    // Close details popover on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) {
                setIsDetailsOpen(false);
            }
        }
        if (isDetailsOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isDetailsOpen]);

    // Close on Escape key
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape' && isDetailsOpen) {
                setIsDetailsOpen(false);
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isDetailsOpen]);

    // Compute fleet-wide quota statistics
    const stats: FleetQuotaStats = useMemo(() => {
        let activeAccounts = 0;
        let readyAccounts = 0;
        let exhaustedAccounts = 0;
        let disabledAccounts = 0;

        let sum5h = 0;
        let sumWeekly = 0;

        let gemini5hSum = 0;
        let claude5hSum = 0;
        let geminiWeeklySum = 0;
        let claudeWeeklySum = 0;

        for (const account of accounts) {
            const isDisabled = account.disabled || account.quota?.is_forbidden || account.validation_blocked;
            if (isDisabled) {
                disabledAccounts++;
                continue;
            }
            activeAccounts++;

            // Extract per-pool statistics (Gemini vs Claude)
            let gWeekly: number | null = null;
            let cWeekly: number | null = null;
            let g5h: number | null = null;
            let c5h: number | null = null;

            for (const group of account.quota?.quota_groups || []) {
                const name = (group.display_name || '').toLowerCase();
                const isClaude = name.includes('claude') || name.includes('gpt');
                for (const bucket of group.buckets || []) {
                    const isW = /week|7d/i.test(`${bucket.window || ''} ${bucket.bucket_id || ''}`);
                    const is5 = /5h|hour/i.test(`${bucket.window || ''} ${bucket.bucket_id || ''}`);
                    const frac = typeof bucket.remaining_fraction === 'number'
                        ? Math.round(bucket.remaining_fraction * 100)
                        : null;

                    if (frac !== null) {
                        if (isClaude) {
                            if (isW && (cWeekly === null || frac < cWeekly)) cWeekly = frac;
                            if (is5 && (c5h === null || frac < c5h)) c5h = frac;
                        } else {
                            if (isW && (gWeekly === null || frac < gWeekly)) gWeekly = frac;
                            if (is5 && (g5h === null || frac < g5h)) g5h = frac;
                        }
                    }
                }
            }

            // Model fallbacks if quota_groups is not populated
            const models = account.quota?.models || [];
            const claudeModel = models.find(m => m.name.toLowerCase().includes('claude'));
            const proModel = models.find(m => m.name.toLowerCase().includes('pro'));
            const flashModel = models.find(m => m.name.toLowerCase().includes('flash'));

            if (cWeekly === null && claudeModel?.percentage !== undefined) {
                cWeekly = claudeModel.percentage;
            }
            if (c5h === null && claudeModel?.percentage !== undefined) {
                c5h = claudeModel.percentage;
            }

            const geminiPcts = [proModel?.percentage, flashModel?.percentage].filter((p): p is number => typeof p === 'number');
            if (g5h === null) {
                g5h = geminiPcts.length > 0 ? Math.min(...geminiPcts) : (models[0]?.percentage ?? 100);
            }
            if (gWeekly === null) {
                gWeekly = g5h;
            }

            // Gemini Quotas (Pure Gemini capacity)
            const accountGeminiWeekly = Math.max(0, Math.min(100, gWeekly ?? 100));
            let accountGemini5h = Math.max(0, Math.min(100, g5h ?? 100));
            if (accountGeminiWeekly <= 0) {
                accountGemini5h = 0;
            }

            // Claude Quotas (for pool breakdown popup)
            const accountClaudeWeekly = Math.max(0, Math.min(100, cWeekly ?? 100));
            let accountClaude5h = Math.max(0, Math.min(100, c5h ?? 100));
            if (accountClaudeWeekly <= 0) {
                accountClaude5h = 0;
            }

            // Summary pills strictly represent Gemini capacity ("Shows only Gemini")
            sumWeekly += accountGeminiWeekly;
            sum5h += accountGemini5h;

            if (accountGeminiWeekly > 0 && accountGemini5h > 0) {
                readyAccounts++;
            } else {
                exhaustedAccounts++;
            }

            geminiWeeklySum += accountGeminiWeekly;
            gemini5hSum += accountGemini5h;
            claudeWeeklySum += accountClaudeWeekly;
            claude5hSum += accountClaude5h;
        }

        // Monthly capacity is 4 full weekly renewal cycles
        const sumMonthly = Math.round(sumWeekly * 4);

        return {
            totalAccounts: accounts.length,
            activeAccounts,
            readyAccounts,
            exhaustedAccounts,
            disabledAccounts,
            sum5h,
            sumWeekly,
            sumMonthly,
            equiv5h: (sum5h / 100).toFixed(1),
            equivWeekly: (sumWeekly / 100).toFixed(1),
            equivMonthly: (sumMonthly / 100).toFixed(1),
            gemini5hSum,
            claude5hSum,
            geminiWeeklySum,
            claudeWeeklySum,
        };
    }, [accounts]);

    const isFiltered = totalAccountsCount !== undefined && totalAccountsCount > accounts.length;

    return (
        <div className="relative flex-none">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-gray-50/80 dark:bg-base-200/50 backdrop-blur-md rounded-xl border border-gray-200/70 dark:border-white/5 transition-all">
                {/* Left side: Category label & Quota Pills */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Gemini Fleet Label */}
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                        <span className="hidden sm:inline">
                            {t('accounts.summary.fleet_capacity', 'Gemini Quota')}:
                        </span>
                    </div>

                    {/* 1. Weekly Quota Pill (Primary User Request) */}
                    <button
                        type="button"
                        onClick={() => onSelectWindow?.('weekly')}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all group shrink-0",
                            "border",
                            quotaWindow === 'weekly'
                                ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 ring-2 ring-blue-500/20 shadow-xs"
                                : "bg-white/80 dark:bg-base-100/80 text-gray-700 dark:text-gray-300 border-gray-200/80 dark:border-white/10 hover:border-blue-400/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
                        )}
                        title={t('accounts.summary.tooltip_weekly', {
                            count: stats.activeAccounts,
                            equiv: stats.equivWeekly,
                        })}
                    >
                        <Calendar className={cn(
                            "w-3.5 h-3.5 transition-colors",
                            quotaWindow === 'weekly' ? "text-blue-600 dark:text-blue-400" : "text-blue-500"
                        )} />
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                            {t('accounts.summary.quota_weekly')}:
                        </span>
                        <span className="font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                            {stats.sumWeekly}%
                        </span>
                        <span className={cn(
                            "text-[10px] px-1.5 py-0.2 rounded-md font-semibold tracking-tight transition-colors",
                            quotaWindow === 'weekly'
                                ? "bg-blue-600/15 text-blue-800 dark:text-blue-200"
                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        )}>
                            {t('accounts.summary.acc_equivalent', { equiv: stats.equivWeekly })}
                        </span>
                    </button>

                    {/* 2. Monthly Quota Pill (Primary User Request) */}
                    <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 bg-white/80 dark:bg-base-100/80 border border-purple-500/25 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 shadow-xs"
                        title={t('accounts.summary.tooltip_monthly', {
                            count: stats.activeAccounts,
                            equiv: stats.equivMonthly,
                        })}
                    >
                        <CalendarDays className="w-3.5 h-3.5 text-purple-500" />
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                            {t('accounts.summary.quota_monthly')}:
                        </span>
                        <span className="font-bold text-purple-700 dark:text-purple-300 tabular-nums">
                            ~{stats.sumMonthly}%
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md font-semibold tracking-tight bg-purple-500/10 text-purple-700 dark:text-purple-300">
                            {t('accounts.summary.acc_equivalent_monthly', { equiv: stats.equivMonthly })}
                        </span>
                    </div>

                    {/* 3. 5H Current Quota Pill */}
                    <button
                        type="button"
                        onClick={() => onSelectWindow?.('5h')}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all group shrink-0",
                            "border",
                            quotaWindow === '5h'
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 ring-2 ring-amber-500/20 shadow-xs"
                                : "bg-white/80 dark:bg-base-100/80 text-gray-700 dark:text-gray-300 border-gray-200/80 dark:border-white/10 hover:border-amber-400/50 hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
                        )}
                        title={t('accounts.summary.tooltip_5h', {
                            count: stats.activeAccounts,
                            equiv: stats.equiv5h,
                        })}
                    >
                        <Zap className={cn(
                            "w-3.5 h-3.5 transition-colors",
                            quotaWindow === '5h' ? "text-amber-600 dark:text-amber-400" : "text-amber-500"
                        )} />
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                            {t('accounts.summary.quota_5h')}:
                        </span>
                        <span className="font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                            {stats.sum5h}%
                        </span>
                        <span className={cn(
                            "text-[10px] px-1.5 py-0.2 rounded-md font-semibold tracking-tight transition-colors",
                            quotaWindow === '5h'
                                ? "bg-amber-600/15 text-amber-800 dark:text-amber-200"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        )}>
                            {t('accounts.summary.acc_equivalent', { equiv: stats.equiv5h })}
                        </span>
                    </button>
                </div>

                {/* Right side: Fleet readiness and details trigger */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Readiness indicator */}
                    <div
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100/80 dark:bg-base-100/80 text-gray-600 dark:text-gray-300 border border-gray-200/50 dark:border-white/5"
                        title={
                            stats.exhaustedAccounts > 0
                                ? `${stats.readyAccounts} ready accounts, ${stats.exhaustedAccounts} recovering/exhausted`
                                : `${stats.readyAccounts} all active accounts ready`
                        }
                    >
                        <span className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            stats.readyAccounts > 0 ? "bg-emerald-500" : "bg-amber-500"
                        )} />
                        <span className="tabular-nums">
                            {stats.readyAccounts} / {stats.activeAccounts}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 text-[10px]">
                            {t('accounts.summary.ready')}
                        </span>
                        {stats.exhaustedAccounts > 0 && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                ({stats.exhaustedAccounts} {t('accounts.summary.waiting')})
                            </span>
                        )}
                    </div>

                    {/* Filtered Notice */}
                    {isFiltered && (
                        <span className="hidden xl:inline text-[11px] text-gray-400 dark:text-gray-500">
                            {t('accounts.summary.filtered_notice', {
                                visible: accounts.length,
                                total: totalAccountsCount,
                            })}
                        </span>
                    )}

                    {/* Breakdown Details Toggle */}
                    <button
                        type="button"
                        onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                        className={cn(
                            "p-1.5 rounded-lg text-gray-500 dark:text-gray-400 transition-colors flex items-center gap-1 text-xs hover:bg-gray-200/60 dark:hover:bg-base-100",
                            isDetailsOpen && "bg-gray-200/80 dark:bg-base-100 text-blue-600 dark:text-blue-400"
                        )}
                        title={t('accounts.summary.toggle_details')}
                    >
                        <Info className="w-3.5 h-3.5" />
                        <ChevronDown className={cn(
                            "w-3 h-3 transition-transform duration-200",
                            isDetailsOpen && "transform rotate-180"
                        )} />
                    </button>
                </div>
            </div>

            {/* Dropdown Popover: Detailed Fleet & Pool Breakdown */}
            {isDetailsOpen && (
                <div
                    ref={detailsRef}
                    className="absolute right-0 top-full mt-1.5 z-40 w-80 sm:w-96 p-4 bg-white dark:bg-base-100 rounded-xl shadow-xl border border-gray-200 dark:border-base-300 text-xs animate-in fade-in zoom-in-95 duration-150"
                >
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-gray-100 dark:border-white/5">
                        <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-base-content text-sm">
                            <Layers className="w-4 h-4 text-blue-500" />
                            <span>{t('accounts.summary.breakdown_title')}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsDetailsOpen(false)}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="space-y-3">
                        {/* Pool Summary Cards */}
                        <div className="grid grid-cols-2 gap-2">
                            {/* Gemini Pool */}
                            <div className="p-2.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/40">
                                <div className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 mb-1.5">
                                    <Cpu className="w-3.5 h-3.5" />
                                    <span>Gemini Models</span>
                                </div>
                                <div className="space-y-1 text-gray-600 dark:text-gray-300">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Weekly:</span>
                                        <span className="font-semibold text-blue-600 dark:text-blue-400">{stats.geminiWeeklySum}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">5H Rolling:</span>
                                        <span className="font-semibold">{stats.gemini5hSum}%</span>
                                    </div>
                                </div>
                            </div>

                            {/* Claude / 3P Pool */}
                            <div className="p-2.5 rounded-lg bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/50 dark:border-purple-900/40">
                                <div className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 dark:text-purple-300 mb-1.5">
                                    <Bot className="w-3.5 h-3.5" />
                                    <span>Claude & 3P</span>
                                </div>
                                <div className="space-y-1 text-gray-600 dark:text-gray-300">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Weekly:</span>
                                        <span className="font-semibold text-purple-600 dark:text-purple-400">{stats.claudeWeeklySum}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">5H Rolling:</span>
                                        <span className="font-semibold">{stats.claude5hSum}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Account Pool Status */}
                        <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-base-200 border border-gray-100 dark:border-white/5 space-y-1.5">
                            <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                <span className="text-gray-500">Active Accounts:</span>
                                <span className="font-semibold">{stats.activeAccounts} of {stats.totalAccounts}</span>
                            </div>
                            <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                <span className="text-gray-500">Ready to Request:</span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stats.readyAccounts}</span>
                            </div>
                            {stats.exhaustedAccounts > 0 && (
                                <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                    <span className="text-gray-500">Waiting for Reset:</span>
                                    <span className="font-semibold text-amber-600 dark:text-amber-400">{stats.exhaustedAccounts}</span>
                                </div>
                            )}
                            {stats.disabledAccounts > 0 && (
                                <div className="flex justify-between text-gray-600 dark:text-gray-300">
                                    <span className="text-gray-500">Disabled / Blocked:</span>
                                    <span className="font-semibold text-red-500">{stats.disabledAccounts}</span>
                                </div>
                            )}
                        </div>

                        {/* Explanation Note */}
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed bg-blue-50/30 dark:bg-white/5 p-2 rounded-lg">
                            <p>
                                💡 <strong>Calculation Notes:</strong>
                            </p>
                            <ul className="list-disc list-inside mt-1 space-y-0.5 text-[10.5px]">
                                <li><strong>Gemini Focus:</strong> Summary pills track pure Gemini capacity, unconstrained by 3P/Claude limits.</li>
                                <li><strong>Current Quotas:</strong> Sum of actual remaining percentages across active accounts.</li>
                                <li><strong>Account Equivalent:</strong> 100% available quota = 1.0 Account Equivalent.</li>
                                <li><strong>Monthly Capacity:</strong> Estimated as 4 weekly rolling cycles per month.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
