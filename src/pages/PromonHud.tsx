import { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Copy,
  Check,
  Send,
  Loader2,
  X,
  Sparkles,
  ShieldAlert,
  Bot
} from 'lucide-react';
import { Claude } from '@lobehub/icons';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { copyToClipboard } from '../utils/clipboard';

interface PromonResult {
  success: boolean;
  role: string;
  output: string;
  execution_time_ms: number;
  error?: string;
}

type PromonMode = 'phraser' | 'auditor';
type TargetDestination = 'clipboard' | 'claude' | 'agy';

export default function PromonHud() {
  const [mode, setMode] = useState<PromonMode>('phraser');
  const [target, setTarget] = useState<TargetDestination>('clipboard');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PromonResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle global shortcuts within the HUD
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismissHud();
      } else if (e.key === 'F1') {
        e.preventDefault();
        setMode('phraser');
      } else if (e.key === 'F2') {
        e.preventDefault();
        setMode('auditor');
      } else if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        setTarget(prev => {
          if (prev === 'clipboard') return 'claude';
          if (prev === 'claude') return 'agy';
          return 'clipboard';
        });
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleExecute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [input, mode, target]);

  const dismissHud = async () => {
    try {
      const win = getCurrentWindow();
      await win.hide();
    } catch {
      try {
        await invoke('toggle_promon_hud', { show: false });
      } catch (err) {
        console.error('Failed to dismiss HUD:', err);
      }
    }
  };

  const handleExecute = async () => {
    if (!input.trim() || isLoading) return;
    setIsLoading(true);
    setStatusMsg('Synthesizing via RTX A5500 BF16...');
    setResult(null);

    try {
      const res = await invoke<PromonResult>('execute_promon_model', {
        role: mode,
        query: input.trim(),
        code: mode === 'auditor' ? input.trim() : null
      });

      setResult(res);

      if (res.success && res.output) {
        // Auto-action based on target destination
        if (target === 'clipboard') {
          await copyToClipboard(res.output);
          setCopied(true);
          setStatusMsg('Copied 3-Tier Spec to clipboard!');
          setTimeout(() => setCopied(false), 2000);
        } else if (target === 'claude') {
          await copyToClipboard(res.output);
          setStatusMsg('Launching Claude Code terminal in E:\\Claude...');
          await invoke('launch_claude_cli', {
            workspace: 'E:\\Claude',
            prompt: res.output
          });
        } else if (target === 'agy') {
          // Store in session storage for AGy-chats to consume
          sessionStorage.setItem('agy_injected_prompt', res.output);
          setStatusMsg('Primed for AGy-chats! Opening main window...');
          await invoke('show_main_window');
        }
      } else {
        setStatusMsg(res.error || 'Execution encountered an error');
      }
    } catch (err: any) {
      console.error('PROMON execution failed:', err);
      setStatusMsg(`Error: ${err.toString()}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyResult = async () => {
    if (!result?.output) return;
    await copyToClipboard(result.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-screen h-screen flex flex-col justify-center items-center bg-transparent select-none p-4">
      {/* HUD Floating Glass Card */}
      <div className="w-full max-w-[740px] bg-slate-900/95 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/50 flex flex-col overflow-hidden text-slate-100 font-sans transition-all duration-200">
        
        {/* Top Header & Drag Region */}
        <div
          data-tauri-drag-region
          className="flex items-center justify-between px-4 py-2.5 bg-slate-800/60 border-b border-white/5 cursor-move"
          onMouseDown={() => getCurrentWindow().startDragging()}
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400">
              <Zap className="w-4 h-4 fill-cyan-400" />
            </div>
            <span className="text-xs font-bold tracking-wider text-cyan-300 uppercase">
              PROMON Systems HUD
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 border border-slate-600/30 font-mono">
              RTX A5500 BF16
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-mono">
              [Esc] Dismiss
            </span>
            <button
              onClick={dismissHud}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-3.5 flex flex-col gap-2.5">
          <div className="relative flex items-center">
            <textarea
              ref={inputRef}
              rows={mode === 'auditor' ? 3 : 2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === 'phraser'
                  ? 'Enter systems intent (e.g. ARM64 detour with cache flush & AAPCS64 SP alignment)...'
                  : 'Paste C++/ASM snippet to audit for memory barriers, ABI, or coherency defects...'
              }
              className="w-full bg-slate-950/60 text-sm text-slate-100 placeholder-slate-500 rounded-xl p-3 outline-none border border-white/10 focus:border-cyan-500/60 transition-all font-mono resize-none"
            />
          </div>

          {/* Mode Badges & Target Selectors */}
          <div className="flex items-center justify-between gap-2 text-xs">
            {/* Modes (F1/F2) */}
            <div className="flex items-center gap-1.5 bg-slate-950/40 p-1 rounded-lg border border-white/5">
              <button
                onClick={() => setMode('phraser')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
                  mode === 'phraser'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Phraser (F1)</span>
              </button>
              <button
                onClick={() => setMode('auditor')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
                  mode === 'auditor'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Auditor (F2)</span>
              </button>
            </div>

            {/* Target Selectors (Tab) */}
            <div className="flex items-center gap-1.5 bg-slate-950/40 p-1 rounded-lg border border-white/5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider px-1 font-mono">
                Target:
              </span>
              <button
                onClick={() => setTarget('clipboard')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  target === 'clipboard'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Copy className="w-3 h-3" />
                <span>Clipboard</span>
              </button>
              <button
                onClick={() => setTarget('claude')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  target === 'claude'
                    ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Claude className="w-3 h-3" />
                <span>Claude Code</span>
              </button>
              <button
                onClick={() => setTarget('agy')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  target === 'agy'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Bot className="w-3 h-3" />
                <span>AGy-chats</span>
              </button>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleExecute}
              disabled={isLoading || !input.trim()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium shadow-md shadow-cyan-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-xs"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Execute [Ctrl+↵]</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Result / Status Drawer */}
        {(statusMsg || result) && (
          <div className="px-3.5 pb-3.5 pt-1 border-t border-white/5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                {isLoading && <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />}
                <span className={isLoading ? 'text-cyan-400' : 'text-slate-300'}>
                  {statusMsg}
                </span>
              </span>
              {result && (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-500">
                    {result.execution_time_ms}ms
                  </span>
                  <button
                    onClick={handleCopyResult}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-200 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {result?.output && (
              <div className="max-h-40 overflow-y-auto rounded-xl bg-slate-950/80 p-3 border border-white/5 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed select-text">
                {result.output}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
