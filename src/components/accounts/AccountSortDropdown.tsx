import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    ArrowUpDown, 
    Sparkles, 
    Clock, 
    Calendar, 
    BatteryCharging, 
    BatteryLow, 
    History, 
    Star, 
    ArrowDownAZ, 
    ArrowUpAZ, 
    Check, 
    X,
    ChevronDown 
} from 'lucide-react';
import { AccountSortOption } from '../../utils/accountSort';

interface AccountSortDropdownProps {
    sortOption: AccountSortOption;
    onSortChange: (option: AccountSortOption) => void;
    quotaWindow?: '5h' | 'weekly';
}

interface SortItemConfig {
    id: AccountSortOption;
    labelKey: string;
    defaultLabel: string;
    icon: React.ReactNode;
    badge?: string;
    group: 'custom' | '5h' | 'weekly' | 'quota' | 'activity' | 'identity';
}

export default function AccountSortDropdown({
    sortOption,
    onSortChange,
    quotaWindow = '5h',
}: AccountSortDropdownProps) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const sortOptions: SortItemConfig[] = [
        {
            id: 'default',
            labelKey: 'accounts.sort.default',
            defaultLabel: 'Default Order',
            icon: <ArrowUpDown className="w-3.5 h-3.5" />,
            group: 'custom',
        },
        {
            id: 'reset_5h_weekly_priority',
            labelKey: 'accounts.sort.reset_5h_weekly_priority',
            defaultLabel: '5H Reset (Weekly-Prioritized)',
            icon: <Sparkles className="w-3.5 h-3.5 text-amber-500" />,
            badge: 'Best',
            group: '5h',
        },
        {
            id: 'reset_5h_asc',
            labelKey: 'accounts.sort.reset_5h_asc',
            defaultLabel: '5H Reset: Shortest first',
            icon: <Clock className="w-3.5 h-3.5 text-emerald-500" />,
            group: '5h',
        },
        {
            id: 'reset_5h_desc',
            labelKey: 'accounts.sort.reset_5h_desc',
            defaultLabel: '5H Reset: Longest first',
            icon: <Clock className="w-3.5 h-3.5 text-gray-400" />,
            group: '5h',
        },
        {
            id: 'reset_weekly_asc',
            labelKey: 'accounts.sort.reset_weekly_asc',
            defaultLabel: 'Weekly Reset: Shortest first',
            icon: <Calendar className="w-3.5 h-3.5 text-blue-500" />,
            group: 'weekly',
        },
        {
            id: 'reset_weekly_desc',
            labelKey: 'accounts.sort.reset_weekly_desc',
            defaultLabel: 'Weekly Reset: Longest first',
            icon: <Calendar className="w-3.5 h-3.5 text-gray-400" />,
            group: 'weekly',
        },
        {
            id: 'quota_desc',
            labelKey: 'accounts.sort.quota_desc',
            defaultLabel: 'Quota: Highest first',
            icon: <BatteryCharging className="w-3.5 h-3.5 text-emerald-500" />,
            group: 'quota',
        },
        {
            id: 'quota_asc',
            labelKey: 'accounts.sort.quota_asc',
            defaultLabel: 'Quota: Lowest first',
            icon: <BatteryLow className="w-3.5 h-3.5 text-rose-500" />,
            group: 'quota',
        },
        {
            id: 'last_used_desc',
            labelKey: 'accounts.sort.last_used_desc',
            defaultLabel: 'Last Used: Newest first',
            icon: <History className="w-3.5 h-3.5 text-indigo-500" />,
            group: 'activity',
        },
        {
            id: 'last_used_asc',
            labelKey: 'accounts.sort.last_used_asc',
            defaultLabel: 'Last Used: Oldest first',
            icon: <History className="w-3.5 h-3.5 text-gray-400" />,
            group: 'activity',
        },
        {
            id: 'priority_desc',
            labelKey: 'accounts.sort.priority_desc',
            defaultLabel: 'Priority: Highest first',
            icon: <Star className="w-3.5 h-3.5 text-amber-500" />,
            group: 'identity',
        },
        {
            id: 'email_asc',
            labelKey: 'accounts.sort.email_asc',
            defaultLabel: 'Name / Email: A to Z',
            icon: <ArrowDownAZ className="w-3.5 h-3.5 text-gray-500" />,
            group: 'identity',
        },
        {
            id: 'email_desc',
            labelKey: 'accounts.sort.email_desc',
            defaultLabel: 'Name / Email: Z to A',
            icon: <ArrowUpAZ className="w-3.5 h-3.5 text-gray-500" />,
            group: 'identity',
        },
    ];

    const currentItem = sortOptions.find(o => o.id === sortOption) || sortOptions[0];
    const isCustomActive = sortOption !== 'default';

    return (
        <div className="relative inline-block text-left" ref={dropdownRef}>
            <div className="flex items-center">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`
                        h-8 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border
                        ${isCustomActive
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 shadow-sm'
                            : 'bg-gray-100 dark:bg-base-200 text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-base-content hover:bg-gray-200/70'
                        }
                    `}
                    title={t('accounts.sort.title', 'Sort Accounts')}
                >
                    <span className="shrink-0">{currentItem.icon}</span>
                    <span className="hidden sm:inline max-w-[130px] truncate">
                        {t(currentItem.labelKey, currentItem.defaultLabel)}
                    </span>
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 opacity-60 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isCustomActive && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSortChange('default');
                        }}
                        className="ml-1 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-base-200 transition-colors"
                        title={t('accounts.sort.reset_to_default', 'Reset to Default Order')}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="absolute right-0 sm:left-0 sm:right-auto mt-1.5 w-64 rounded-xl bg-white dark:bg-base-100 shadow-2xl border border-gray-100 dark:border-base-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-base-200/60 flex items-center justify-between">
                        <span>{t('accounts.sort.title', 'Sort Accounts')}</span>
                        {isCustomActive && (
                            <button
                                onClick={() => {
                                    onSortChange('default');
                                    setIsOpen(false);
                                }}
                                className="text-blue-500 hover:text-blue-600 text-[10px] font-normal normal-case hover:underline"
                            >
                                {t('common.reset', 'Reset')}
                            </button>
                        )}
                    </div>

                    <div className="max-h-80 overflow-y-auto py-1 divide-y divide-gray-50 dark:divide-white/5">
                        {/* Group: Default */}
                        <div className="py-1">
                            {sortOptions.filter(o => o.group === 'custom').map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                        onSortChange(opt.id);
                                        setIsOpen(false);
                                    }}
                                    className={`
                                        w-full px-3 py-1.5 text-xs text-left flex items-center justify-between transition-colors
                                        ${sortOption === opt.id
                                            ? 'bg-blue-50/70 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-2">
                                        {opt.icon}
                                        <span>{t(opt.labelKey, opt.defaultLabel)}</span>
                                    </div>
                                    {sortOption === opt.id && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                                </button>
                            ))}
                        </div>

                        {/* Group: 5H Reset */}
                        <div className="py-1">
                            <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                                <span>{t('accounts.sort.group_5h', '5-Hour Window')}</span>
                                {quotaWindow === '5h' && (
                                    <span className="text-[8px] font-semibold text-blue-500 lowercase bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                                        active
                                    </span>
                                )}
                            </div>
                            {sortOptions.filter(o => o.group === '5h').map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                        onSortChange(opt.id);
                                        setIsOpen(false);
                                    }}
                                    className={`
                                        w-full px-3 py-1.5 text-xs text-left flex items-center justify-between transition-colors
                                        ${sortOption === opt.id
                                            ? 'bg-blue-50/70 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        {opt.icon}
                                        <span className="truncate">{t(opt.labelKey, opt.defaultLabel)}</span>
                                        {opt.badge && (
                                            <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                                                {opt.badge}
                                            </span>
                                        )}
                                    </div>
                                    {sortOption === opt.id && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                                </button>
                            ))}
                        </div>

                        {/* Group: Weekly Reset */}
                        <div className="py-1">
                            <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                                <span>{t('accounts.sort.group_weekly', 'Weekly Window')}</span>
                                {quotaWindow === 'weekly' && (
                                    <span className="text-[8px] font-semibold text-blue-500 lowercase bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                                        active
                                    </span>
                                )}
                            </div>
                            {sortOptions.filter(o => o.group === 'weekly').map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                        onSortChange(opt.id);
                                        setIsOpen(false);
                                    }}
                                    className={`
                                        w-full px-3 py-1.5 text-xs text-left flex items-center justify-between transition-colors
                                        ${sortOption === opt.id
                                            ? 'bg-blue-50/70 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-2">
                                        {opt.icon}
                                        <span>{t(opt.labelKey, opt.defaultLabel)}</span>
                                    </div>
                                    {sortOption === opt.id && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                                </button>
                            ))}
                        </div>

                        {/* Group: Quota % */}
                        <div className="py-1">
                            <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-gray-400">
                                {t('accounts.sort.group_quota', 'Quota Percentage')}
                            </div>
                            {sortOptions.filter(o => o.group === 'quota').map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                        onSortChange(opt.id);
                                        setIsOpen(false);
                                    }}
                                    className={`
                                        w-full px-3 py-1.5 text-xs text-left flex items-center justify-between transition-colors
                                        ${sortOption === opt.id
                                            ? 'bg-blue-50/70 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-2">
                                        {opt.icon}
                                        <span>{t(opt.labelKey, opt.defaultLabel)}</span>
                                    </div>
                                    {sortOption === opt.id && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                                </button>
                            ))}
                        </div>

                        {/* Group: Activity & Identity */}
                        <div className="py-1">
                            <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-gray-400">
                                {t('accounts.sort.group_other', 'Usage & Details')}
                            </div>
                            {sortOptions.filter(o => o.group === 'activity' || o.group === 'identity').map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                        onSortChange(opt.id);
                                        setIsOpen(false);
                                    }}
                                    className={`
                                        w-full px-3 py-1.5 text-xs text-left flex items-center justify-between transition-colors
                                        ${sortOption === opt.id
                                            ? 'bg-blue-50/70 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-2">
                                        {opt.icon}
                                        <span>{t(opt.labelKey, opt.defaultLabel)}</span>
                                    </div>
                                    {sortOption === opt.id && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
