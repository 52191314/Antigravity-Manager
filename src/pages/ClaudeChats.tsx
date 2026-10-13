import { useState, useEffect } from 'react';
import {
  Terminal,
  Play,
  Copy,
  Check,
  Search,
  FolderOpen,
  RefreshCw,
  Loader2,
  Clock,
  Send
} from 'lucide-react';
import { Claude } from '@lobehub/icons';
import { invoke } from '@tauri-apps/api/core';
import { copyToClipboard } from '../utils/clipboard';

interface ClaudeHistoryItem {
  display: string;
  timestamp: number;
  project?: string;
  session_id?: string;
}

const COMMON_WORKSPACES = [
  'E:\\Claude',
  'E:\\JB',
  'E:\\02_Projects\\Antigravity-Manager',
  'C:\\Users\\X',
];

export default function ClaudeChats() {
  const [history, setHistory] = useState<ClaudeHistoryItem[]>([]);
  const [workspace, setWorkspace] = useState<string>('E:\\Claude');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLaunching, setIsLaunching] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const items = await invoke<ClaudeHistoryItem[]>('get_claude_history', { limit: 150 });
      setHistory(items);
    } catch (err) {
      console.error('Failed to load Claude history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleLaunchCli = async (promptToSend?: string) => {
    setIsLaunching(true);
    setStatusMessage(`Launching Claude Code in ${workspace}...`);
    try {
      const res = await invoke<string>('launch_claude_cli', {
        workspace,
        prompt: promptToSend || (customPrompt.trim() ? customPrompt.trim() : null),
      });
      setStatusMessage(res);
      setCustomPrompt('');
      setTimeout(() => setStatusMessage(''), 4000);
    } catch (err: any) {
      console.error('Failed to launch Claude CLI:', err);
      setStatusMessage(`Error: ${err.toString()}`);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleCopy = async (text: string, index: number) => {
    await copyToClipboard(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const filteredHistory = history.filter((item) => {
    const matchesSearch =
      !searchQuery ||
      item.display.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.project && item.project.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  const formatDate = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-base-100 text-base-content">
      {/* Top Header / Launcher Control Bar */}
      <div className="p-4 border-b border-base-200 bg-base-200/40 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-500 flex items-center justify-center">
              <Claude size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wide">Claude-chats Hub</h2>
              <p className="text-[11px] text-base-content/60">
                Interactive Claude Code session launcher and history browser
              </p>
            </div>
          </div>

          {/* Quick Launch Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleLaunchCli()}
              disabled={isLaunching}
              className="btn btn-sm btn-primary gap-1.5 shadow-sm"
            >
              {isLaunching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>Launch Terminal CLI</span>
            </button>
            <button
              onClick={fetchHistory}
              disabled={isLoading}
              className="btn btn-sm btn-ghost btn-square"
              title="Refresh History"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Workspace & Prompt Injection Bar */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          {/* Workspace Selector */}
          <div className="flex items-center gap-1.5 bg-base-100 px-3 py-1.5 rounded-lg border border-base-300 text-xs shrink-0">
            <FolderOpen className="w-3.5 h-3.5 text-base-content/60" />
            <span className="text-[11px] font-mono text-base-content/60">Workspace:</span>
            <select
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              className="bg-transparent font-mono text-xs outline-none cursor-pointer"
            >
              {COMMON_WORKSPACES.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Instruction Input */}
          <div className="flex-1 flex gap-1.5 items-center bg-base-100 px-3 py-1 rounded-lg border border-base-300">
            <Terminal className="w-3.5 h-3.5 text-base-content/50 shrink-0" />
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLaunchCli();
              }}
              placeholder="Initial prompt for Claude Code CLI (or leave blank to launch shell)..."
              className="w-full bg-transparent text-xs font-mono outline-none py-1"
            />
            {customPrompt && (
              <button
                onClick={() => handleLaunchCli()}
                className="btn btn-xs btn-primary gap-1 shrink-0"
              >
                <Send className="w-3 h-3" />
                <span>Send</span>
              </button>
            )}
          </div>
        </div>

        {statusMessage && (
          <div className="text-[11px] font-mono text-info flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Main Content: History Explorer */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
        {/* Search Bar & Stats */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-base-content/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search previous prompts, projects, or commands..."
              className="input input-sm input-bordered w-full pl-8 text-xs font-mono"
            />
          </div>
          <span className="text-xs text-base-content/60 font-mono">
            {filteredHistory.length} recorded interactions in ~/.claude/history.jsonl
          </span>
        </div>

        {/* History Items List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filteredHistory.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-base-content/50 text-xs">
              <Claude size={32} className="opacity-40 mb-2" />
              <span>No interactions matching search query</span>
            </div>
          ) : (
            filteredHistory.map((item, index) => (
              <div
                key={`${item.timestamp}_${index}`}
                className="p-3 rounded-xl bg-base-200/50 hover:bg-base-200 border border-base-300 transition-colors flex flex-col gap-2 group"
              >
                <div className="flex items-center justify-between text-[11px] text-base-content/60">
                  <div className="flex items-center gap-2">
                    <span className="font-mono bg-base-300 px-1.5 py-0.5 rounded text-[10px]">
                      {item.project || 'Global'}
                    </span>
                    <span>{formatDate(item.timestamp)}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCopy(item.display, index)}
                      className="btn btn-xs btn-ghost gap-1"
                      title="Copy Prompt"
                    >
                      {copiedIndex === index ? (
                        <>
                          <Check className="w-3 h-3 text-success" />
                          <span className="text-success text-[10px]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span className="text-[10px]">Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleLaunchCli(item.display)}
                      className="btn btn-xs btn-primary btn-outline gap-1"
                      title="Launch with this prompt"
                    >
                      <Play className="w-3 h-3" />
                      <span className="text-[10px]">Re-run CLI</span>
                    </button>
                  </div>
                </div>

                <div className="font-mono text-xs text-base-content whitespace-pre-wrap select-text break-words">
                  {item.display}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
