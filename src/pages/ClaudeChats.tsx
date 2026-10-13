import { useState, useEffect } from 'react';
import {
  Terminal,
  Play,
  Copy,
  Check,
  Search,
  FolderOpen,
  RefreshCw,
  Sparkles,
  Loader2,
  Clock,
  Send,
  Eye,
  Layers
} from 'lucide-react';
import { Claude } from '@lobehub/icons';
import { invoke } from '@tauri-apps/api/core';
import { copyToClipboard } from '../utils/clipboard';

interface ClaudeSessionItem {
  session_id: string;
  cwd: string;
  project: string;
  model: string;
  entrypoint: string;
  first_prompt: string;
  last_prompt: string;
  user_turns_count: number;
  total_steps: number;
  total_cost: number;
  total_duration_ms: number;
  last_timestamp: string;
}

const COMMON_WORKSPACES = [
  'E:\\Claude',
  'E:\\JB',
  'E:\\02_Projects\\Antigravity-Manager',
  'E:\\02_Projects\\agy-chats',
  'E:\\02_Projects\\claude-chats',
  'C:\\Users\\X',
];

export default function ClaudeChats() {
  const [sessions, setSessions] = useState<ClaudeSessionItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [workspace, setWorkspace] = useState('E:\\Claude');
  const [showAll, setShowAll] = useState(false);
  const [selectedProject, setSelectedProject] = useState('ALL');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  // PROMON Phraser modal / assistance state
  const [showPhraserBar, setShowPhraserBar] = useState(false);
  const [phraserPrompt, setPhraserPrompt] = useState('');
  const [isPhrasing, setIsPhrasing] = useState(false);
  const [phraserResult, setPhraserResult] = useState('');

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const items = await invoke<ClaudeSessionItem[]>('get_claude_sessions', {
        limit: 100,
        search: searchQuery.trim() ? searchQuery.trim() : null,
        all: showAll,
      });
      setSessions(items);
    } catch (err) {
      console.error('Failed to load Claude sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [searchQuery, showAll]);

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

  const handleResumeSession = async (session: ClaudeSessionItem) => {
    setStatusMessage(`Resuming session ${session.session_id.slice(0, 8)} in ${session.cwd}...`);
    try {
      const res = await invoke<string>('resume_claude_session', {
        sessionId: session.session_id,
        cwd: session.cwd,
      });
      setStatusMessage(res);
      setTimeout(() => setStatusMessage(''), 4000);
    } catch (err: any) {
      console.error('Failed to resume Claude session:', err);
      setStatusMessage(`Error: ${err.toString()}`);
    }
  };

  const handleUnhideSessions = async () => {
    setStatusMessage('Unhiding SDK sessions via claude_chats.py -u...');
    try {
      const res = await invoke<string>('unhide_claude_sessions');
      setStatusMessage(res);
      await fetchSessions();
      setTimeout(() => setStatusMessage(''), 4000);
    } catch (err: any) {
      console.error('Failed to unhide Claude sessions:', err);
      setStatusMessage(`Error: ${err.toString()}`);
    }
  };

  const handleCopyResumeCmd = async (session: ClaudeSessionItem) => {
    const cmd = `cd '${session.cwd}' ; claude --resume ${session.session_id} --setting-sources project`;
    await copyToClipboard(cmd);
    setCopiedId(session.session_id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRunPhraser = async () => {
    if (!phraserPrompt.trim() || isPhrasing) return;
    setIsPhrasing(true);
    setPhraserResult('');
    try {
      const res = await invoke<{ success: boolean; output: string }>('execute_promon_model', {
        role: 'phraser',
        query: phraserPrompt.trim(),
        code: null,
      });
      if (res.success && res.output) {
        setPhraserResult(res.output);
        await copyToClipboard(res.output);
        setStatusMessage('Synthesized 3-Tier prompt copied to clipboard!');
      }
    } catch (err) {
      console.error('Failed to run PROMON Phraser:', err);
    } finally {
      setIsPhrasing(false);
    }
  };

  // Projects list for filtering
  const projects = Array.from(
    new Set(sessions.map((s) => s.project || s.cwd).filter(Boolean))
  );

  const filteredSessions = sessions.filter((s) => {
    if (selectedProject !== 'ALL' && (s.project || s.cwd) !== selectedProject) {
      return false;
    }
    return true;
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formatCost = (cost: number) => {
    if (!cost || cost <= 0) return '$0.00';
    return `$${cost.toFixed(3)}`;
  };

  const getModelBadgeClass = (model: string) => {
    if (!model) return 'badge-ghost';
    const m = model.toLowerCase();
    if (m.includes('opus')) return 'badge-secondary text-secondary-content';
    if (m.includes('sonnet')) return 'badge-accent text-accent-content';
    if (m.includes('haiku')) return 'badge-info text-info-content';
    return 'badge-ghost';
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-base-100 text-base-content">
      {/* Top Header & Toolbar */}
      <div className="p-4 border-b border-base-200 bg-base-200/40 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-500 flex items-center justify-center">
              <Claude size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-wide">Claude-chats Hub</h2>
                <span className="badge badge-xs badge-outline font-mono text-[10px]">
                  E:\02_Projects\claude-chats
                </span>
              </div>
              <p className="text-[11px] text-base-content/60">
                Interactive Claude Code session launcher, resumption engine, and indexed history
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPhraserBar(!showPhraserBar)}
              className={`btn btn-sm gap-1.5 ${
                showPhraserBar ? 'btn-primary' : 'btn-outline btn-primary'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>⚡ PROMON Phraser</span>
            </button>
            <button
              onClick={handleUnhideSessions}
              className="btn btn-sm btn-ghost gap-1.5 text-xs"
              title="Unhide SDK sessions in claude_chats.py"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Unhide SDK</span>
            </button>
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
              onClick={fetchSessions}
              disabled={isLoading}
              className="btn btn-sm btn-ghost btn-square"
              title="Refresh Sessions"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Collapsible PROMON Phraser Bar */}
        {showPhraserBar && (
          <div className="p-3 bg-base-300/40 border border-primary/20 rounded-xl flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-semibold text-primary">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>RTX A5500 Systems Phraser (Claude Prompt Synthesizer)</span>
              </span>
              <span className="text-[10px] font-mono text-base-content/60">
                Pure Offline BF16
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={phraserPrompt}
                onChange={(e) => setPhraserPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRunPhraser();
                }}
                placeholder="Enter intent (e.g. Memory safety, kernel interposition, or ELF section parsing)..."
                className="input input-sm input-bordered flex-1 text-xs font-mono"
              />
              <button
                onClick={handleRunPhraser}
                disabled={isPhrasing || !phraserPrompt.trim()}
                className="btn btn-sm btn-primary gap-1"
              >
                {isPhrasing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Synthesize & Copy</span>
              </button>
            </div>
            {phraserResult && (
              <div className="max-h-28 overflow-y-auto p-2 bg-base-100 rounded-lg text-[11px] font-mono text-base-content whitespace-pre-wrap select-text border border-base-300">
                {phraserResult}
              </div>
            )}
          </div>
        )}

        {/* Workspace & Launch Prompt Bar */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          {/* Workspace Selector */}
          <div className="flex items-center gap-1.5 bg-base-100 px-3 py-1.5 rounded-lg border border-base-300 text-xs shrink-0">
            <FolderOpen className="w-3.5 h-3.5 text-base-content/60" />
            <span className="text-[11px] font-mono text-base-content/60">Spawn CWD:</span>
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

        {/* Filters and Controls */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-base-content/50" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search session prompts, project names, or paths..."
                className="input input-sm input-bordered w-full pl-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Project Filter */}
            <div className="flex items-center gap-1.5 bg-base-100 px-2.5 py-1 rounded-lg border border-base-300 text-xs">
              <Layers className="w-3.5 h-3.5 text-base-content/60" />
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="bg-transparent font-mono text-xs outline-none cursor-pointer max-w-[160px] truncate"
              >
                <option value="ALL">All Projects</option>
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Show SDK Sessions Toggle */}
            <label className="label cursor-pointer gap-1.5 bg-base-100 px-2.5 py-1 rounded-lg border border-base-300 text-xs">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="checkbox checkbox-xs checkbox-primary"
              />
              <span className="text-[11px]">Include SDK / All</span>
            </label>
          </div>
        </div>

        {statusMessage && (
          <div className="text-[11px] font-mono text-info flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Main Sessions List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {filteredSessions.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-base-content/50 text-xs">
            <Claude size={32} className="opacity-40 mb-2" />
            <span>No Claude Code sessions found matching query</span>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div
              key={session.session_id}
              className="p-3.5 rounded-xl bg-base-200/50 hover:bg-base-200 border border-base-300 transition-all flex flex-col gap-2 group shadow-sm"
            >
              {/* Card Header */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-base-content truncate max-w-sm">
                    {session.project || 'Claude Session'}
                  </span>
                  <span className={`badge badge-xs font-mono text-[10px] ${getModelBadgeClass(session.model)}`}>
                    {session.model || 'claude'}
                  </span>
                  {session.user_turns_count > 0 && (
                    <span className="badge badge-xs badge-outline font-mono text-[10px]">
                      {session.user_turns_count} turns
                    </span>
                  )}
                  {session.total_cost > 0 && (
                    <span className="badge badge-xs badge-success/20 text-success font-mono text-[10px]">
                      {formatCost(session.total_cost)}
                    </span>
                  )}
                  {session.entrypoint && session.entrypoint !== 'cli' && (
                    <span className="badge badge-xs badge-warning/20 text-warning font-mono text-[10px]">
                      {session.entrypoint}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-base-content/60 font-mono">
                    {formatDate(session.last_timestamp)}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCopyResumeCmd(session)}
                      className="btn btn-xs btn-ghost gap-1"
                      title="Copy cd & resume command"
                    >
                      {copiedId === session.session_id ? (
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
                      onClick={() => handleResumeSession(session)}
                      className="btn btn-xs btn-primary gap-1 shadow-sm"
                      title="Resume in Terminal"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span className="text-[10px]">Resume</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Path and Session ID */}
              <div className="flex items-center justify-between text-[11px] text-base-content/60 font-mono">
                <div className="flex items-center gap-1.5 truncate">
                  <FolderOpen className="w-3 h-3 shrink-0" />
                  <span className="truncate">{session.cwd}</span>
                </div>
                <span className="text-[10px] text-base-content/40 shrink-0">
                  {session.session_id.slice(0, 8)}
                </span>
              </div>

              {/* Prompt Previews */}
              <div className="flex flex-col gap-1.5 text-xs font-mono">
                {session.first_prompt && (
                  <div className="bg-base-100/70 p-2 rounded-lg border border-base-300/50 line-clamp-2 select-text">
                    <span className="text-primary font-semibold mr-1.5">First:</span>
                    <span className="text-base-content/80">{session.first_prompt}</span>
                  </div>
                )}
                {session.last_prompt && session.last_prompt !== session.first_prompt && (
                  <div className="bg-base-100/40 p-2 rounded-lg border border-base-300/30 line-clamp-2 select-text">
                    <span className="text-secondary font-semibold mr-1.5">Last:</span>
                    <span className="text-base-content/70">{session.last_prompt}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
