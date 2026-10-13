import { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User,
  Plus,
  Trash2,
  Sparkles,
  Copy,
  Check,
  Loader2,
  MessageSquare
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAccountStore } from '../stores/useAccountStore';
import { useConfigStore } from '../stores/useConfigStore';
import { copyToClipboard } from '../utils/clipboard';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  messages: ChatMessage[];
}

const AVAILABLE_MODELS = [
  { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' },
  { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
  { id: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro (High)' },
  { id: 'claude-sonnet-4-6', label: 'Claude 3.7 Sonnet' },
  { id: 'claude-opus-4-6-thinking', label: 'Claude 3.7 Opus (Thinking)' },
  { id: 'gpt-oss-120b-medium', label: 'Strata 120B / Codex' },
];

export default function AgyChats() {
  const { currentAccount } = useAccountStore();
  const { config } = useConfigStore();

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('agy_chat_sessions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash-high');
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [isPhrasing, setIsPhrasing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync sessions to localStorage
  useEffect(() => {
    localStorage.setItem('agy_chat_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // Handle prompt injected from the Promon HUD
  useEffect(() => {
    const injected = sessionStorage.getItem('agy_injected_prompt');
    if (injected) {
      setInputPrompt(injected);
      sessionStorage.removeItem('agy_injected_prompt');
    }
  }, []);

  // Ensure an active session exists
  useEffect(() => {
    if (sessions.length === 0) {
      createNewSession();
    } else if (!activeSessionId) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions.length, activeSessionId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions, activeSessionId]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: `session_${Date.now()}`,
      title: 'New Conversation',
      model: selectedModel,
      createdAt: Date.now(),
      messages: [
        {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: 'Hello! I am your Antigravity (AGy) Systems Assistant. How can I assist with your low-level architecture, cache coherence, or reverse engineering today?',
          timestamp: Date.now(),
        },
      ],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== id);
    setSessions(updated);
    if (activeSessionId === id && updated.length > 0) {
      setActiveSessionId(updated[0].id);
    }
  };

  // Run RTX A5500 prompt phraser on the current input prompt
  const handlePhraserAssist = async () => {
    if (!inputPrompt.trim() || isPhrasing) return;
    setIsPhrasing(true);
    try {
      const res = await invoke<{ success: boolean; output: string }>('execute_promon_model', {
        role: 'phraser',
        query: inputPrompt.trim(),
        code: null,
      });
      if (res.success && res.output) {
        setInputPrompt(res.output);
      }
    } catch (err) {
      console.error('Failed to run Phraser Assist:', err);
    } finally {
      setIsPhrasing(false);
    }
  };

  // Send message to local Proxymateur API proxy
  const handleSendMessage = async () => {
    if (!inputPrompt.trim() || isSending || !activeSession) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: inputPrompt.trim(),
      timestamp: Date.now(),
    };

    const updatedMessages = [...activeSession.messages, userMsg];

    // Update session title on first user message
    let title = activeSession.title;
    if (activeSession.messages.length <= 1) {
      title = userMsg.content.slice(0, 32) + (userMsg.content.length > 32 ? '...' : '');
    }

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id ? { ...s, title, messages: updatedMessages } : s
      )
    );

    setInputPrompt('');
    setIsSending(true);

    try {
      const proxyPort = config?.proxy?.port || 8045;
      const proxyUrl = `http://127.0.0.1:${proxyPort}/v1/chat/completions`;
      const apiKey = config?.proxy?.api_key || 'sk-736ad8956af54d4da0fa686c3f80fb16';

      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Proxy returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const assistantText = data?.choices?.[0]?.message?.content || 'No response generated.';

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: assistantText,
        timestamp: Date.now(),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? { ...s, messages: [...updatedMessages, assistantMsg] }
            : s
        )
      );
    } catch (err: any) {
      console.error('Chat request error:', err);
      const errorMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'system',
        content: `Connection Error: ${err.message || 'Unable to communicate with local proxy'}. Check that Proxymateur proxy is running.`,
        timestamp: Date.now(),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? { ...s, messages: [...updatedMessages, errorMsg] }
            : s
        )
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyMessage = async (id: string, text: string) => {
    await copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex-1 h-full flex flex-row overflow-hidden bg-base-100 text-base-content">
      {/* Session Drawer */}
      <div className="w-64 border-r border-base-200 bg-base-200/50 flex flex-col justify-between shrink-0">
        <div className="p-3 border-b border-base-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm tracking-wide">AGy-chats</span>
          </div>
          <button
            onClick={createNewSession}
            className="btn btn-xs btn-primary btn-outline flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={`group flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs transition-all ${
                s.id === activeSession?.id
                  ? 'bg-primary text-primary-content font-medium shadow-sm'
                  : 'hover:bg-base-200 text-base-content/80'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span className="truncate">{s.title}</span>
              </div>
              <button
                onClick={(e) => deleteSession(s.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-error transition-opacity"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Telemetry Footer */}
        <div className="p-3 border-t border-base-200 bg-base-200 text-[11px] text-base-content/70">
          <div className="flex items-center justify-between mb-1">
            <span>Account:</span>
            <span className="font-mono font-medium truncate max-w-[120px]">
              {currentAccount?.email || 'Default'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Proxy Status:</span>
            <span className="badge badge-xs badge-success">Online</span>
          </div>
        </div>
      </div>

      {/* Main Conversation Thread */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Thread Header */}
        <div className="px-6 py-3 border-b border-base-200 bg-base-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{activeSession?.title}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Model Selector */}
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="select select-bordered select-xs text-xs font-mono"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeSession?.messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role !== 'user' && (
                <div className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-xs leading-relaxed group relative ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-content font-sans'
                    : msg.role === 'system'
                    ? 'bg-error/10 border border-error/20 text-error'
                    : 'bg-base-200 border border-base-300 font-mono select-text'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {msg.role !== 'system' && (
                  <button
                    onClick={() => handleCopyMessage(msg.id, msg.content)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded bg-base-100/60 hover:bg-base-100 transition-opacity text-base-content/70"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3 h-3 text-success" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-base-300 text-base-content/70 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isSending && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <span className="text-xs text-base-content/60 italic">
                Thinking via {selectedModel}...
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Composer */}
        <div className="p-4 border-t border-base-200 bg-base-100 flex flex-col gap-2">
          {/* Quick Action Badges */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePhraserAssist}
              disabled={isPhrasing || !inputPrompt.trim()}
              className="btn btn-xs btn-outline btn-primary gap-1"
            >
              {isPhrasing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              <span>⚡ Phraser Assist (RTX A5500)</span>
            </button>
          </div>

          {/* Text Input & Send */}
          <div className="flex gap-2 items-end">
            <textarea
              rows={2}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask anything or request low-level systems architectures (Enter to send, Shift+Enter for new line)..."
              className="textarea textarea-bordered flex-1 text-xs resize-none font-mono"
            />
            <button
              onClick={handleSendMessage}
              disabled={isSending || !inputPrompt.trim()}
              className="btn btn-primary btn-md h-[58px] px-5"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
