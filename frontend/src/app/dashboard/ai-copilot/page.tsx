'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, Bot, User as UserIcon, Trash2, ChevronDown, History, Code as CodeIcon } from 'lucide-react';
import { api } from '@/services/api/client';
import { useToast, useLocalStorage } from '@/hooks';
import { Button, Badge, Skeleton } from '@/components';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentName?: string;
  agentType?: string;
  confidence?: number;
  reasoning?: any[];
  timestamp: string;
  feedback?: 'up' | 'down';
  pending?: boolean;
}

interface Agent {
  agent_type: string;
  name?: string;
  description?: string;
  capabilities?: string[];
}

const STORAGE_KEY = 'airos_copilot_history';
const AGENT_KEY = 'airos_copilot_agent';
const SUGGESTED = [
  'Summarize my top candidates',
  'Who should I move to interview next?',
  'Explain the score for Sarah Chen',
  'Where is the pipeline bottlenecked?',
];

const DEFAULT_AGENTS: Agent[] = [
  { agent_type: 'recruiting_copilot', name: 'Recruiting Copilot', description: 'General recruiting assistant' },
  { agent_type: 'screening', name: 'Screening Agent', description: 'Resume & profile screening' },
  { agent_type: 'matching', name: 'Matching Agent', description: 'Candidate-job matching' },
  { agent_type: 'interview', name: 'Interview Agent', description: 'Interview questions & analysis' },
  { agent_type: 'pipeline', name: 'Pipeline Agent', description: 'Pipeline analytics & insights' },
];

function formatCodeBlocks(text: string) {
  const parts: React.ReactNode[] = [];
  const regex = /```(\w+)?\n?([\s\S]*?)```/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(<span key={key++}>{text.slice(lastIdx, match.index)}</span>);
    }
    parts.push(
      <pre key={key++} className="my-2 p-2.5 bg-gray-900 text-green-300 font-mono text-xs rounded overflow-x-auto" aria-label={match[1] ? `${match[1]} code` : 'Code block'}>
        {match[2]}
      </pre>
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIdx)}</span>);
  }
  return parts;
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    if (/^#\s+/.test(line)) return <h3 key={i} className="text-base font-bold mt-2 mb-1">{line.slice(2)}</h3>;
    if (/^##\s+/.test(line)) return <h4 key={i} className="text-sm font-bold mt-2 mb-1">{line.slice(3)}</h4>;
    if (/^-\s+/.test(line)) return <div key={i} className="flex gap-1.5 ml-1"><span className="text-gray-400">•</span><span>{line.slice(2)}</span></div>;
    if (/^\d+\.\s+/.test(line)) {
      const m = /^(\d+)\.\s+(.*)/.exec(line)!;
      return <div key={i} className="flex gap-1.5 ml-1"><span className="text-gray-400 font-mono">{m[1]}.</span><span>{m[2]}</span></div>;
    }
    if (line.trim() === '') return <div key={i} className="h-2" />;
    return <div key={i}>{formatCodeBlocks(line)}</div>;
  });
}

export default function AICopilotPage() {
  const [history, setHistory] = useLocalStorage<ChatMessage[]>(STORAGE_KEY, []);
  const [agentType, setAgentType] = useLocalStorage<string>(AGENT_KEY, 'recruiting_copilot');
  const [agents, setAgents] = useState<Agent[]>(DEFAULT_AGENTS);
  const [showAgents, setShowAgents] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { push, ToastContainer } = useToast();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = useMemo(() => {
    if (history.length === 0) {
      return [
        {
          id: 'init',
          role: 'assistant' as const,
          content: "Hello! I'm your AI recruiting copilot. I can help you summarize candidates, explain scores, recommend next actions, and analyze your pipeline. What would you like help with?",
          agentName: 'Recruiting Copilot',
          agentType: 'recruiting_copilot',
          timestamp: new Date().toISOString(),
        },
      ];
    }
    return history;
  }, [history]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;
    api.ai
      .listAgents()
      .then((r: any) => {
        if (cancelled) return;
        const list: Agent[] = Array.isArray(r?.agents) ? r.agents : Array.isArray(r) ? r : [];
        if (list.length > 0) {
          setAgents(list);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const activeAgent = agents.find((a) => a.agent_type === agentType) || DEFAULT_AGENTS[0];
  const activeAgentName = activeAgent.name || 'Recruiting Copilot';

  const persist = useCallback(
    (next: ChatMessage[]) => setHistory(next.slice(-100)),
    [setHistory]
  );

  const send = useCallback(
    async (text?: string) => {
      const message = (text ?? input).trim();
      if (!message || loading) return;
      setInput('');

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      const pendingMsg: ChatMessage = {
        id: `p-${Date.now()}`,
        role: 'assistant',
        content: '',
        agentName: activeAgentName,
        agentType,
        timestamp: new Date().toISOString(),
        pending: true,
      };
      persist([...messages.filter((m) => m.id !== 'init'), userMsg, pendingMsg]);
      setLoading(true);

      try {
        const r: any = await api.ai.orchestrate({
          task: message,
          agents: [agentType],
          context: { source: 'dashboard_copilot', agent_type: agentType, query: message },
        });
        const result = r?.result || {};
        const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
        const drafts = Array.isArray(result.email_drafts) ? result.email_drafts : [];
        const pipelineSummary = result.pipeline_summary;

        const lines: string[] = [];
        if (typeof result === 'string') {
          lines.push(result);
        } else {
          if (pipelineSummary && typeof pipelineSummary === 'object') {
            lines.push('## Pipeline summary');
            for (const [k, v] of Object.entries(pipelineSummary)) {
              lines.push(`- **${k}**: ${v}`);
            }
            lines.push('');
          }
          if (suggestions.length) {
            lines.push('## Suggested actions');
            for (const s of suggestions) {
              const action = typeof s === 'string' ? s : s.action || JSON.stringify(s);
              const reason = typeof s === 'object' && s.reason ? ` — ${s.reason}` : '';
              const priority = typeof s === 'object' && s.priority ? ` [${s.priority}]` : '';
              lines.push(`- ${action}${priority}${reason}`);
            }
            lines.push('');
          }
          if (drafts.length) {
            lines.push('## Email drafts');
            for (const d of drafts) {
              lines.push(`- **To:** ${d.to} — "${d.subject}"`);
            }
            lines.push('');
          }
          if (lines.length === 0 && result.text) lines.push(String(result.text));
          if (lines.length === 0 && result.answer) lines.push(String(result.answer));
          if (lines.length === 0 && typeof result.message === 'string') lines.push(result.message);
          if (lines.length === 0) lines.push('I have processed your request.');
        }

        const finalContent = lines.join('\n');
        const finalMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: finalContent,
          agentName: r?.agent_name || activeAgentName,
          agentType: r?.agent_type || agentType,
          confidence: typeof r?.confidence_score === 'number' ? r.confidence_score : undefined,
          reasoning: Array.isArray(r?.reasoning_chain) ? r.reasoning_chain : undefined,
          timestamp: new Date().toISOString(),
        };
        persist([...messages.filter((m) => m.id !== 'init'), userMsg, finalMsg]);
      } catch (err: any) {
        push('error', err?.message || 'Copilot request failed. Please try again.');
        const errMsg: ChatMessage = {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: "I'm having trouble reaching the AI service right now. Please check that the backend is running, then try again.",
          agentName: activeAgentName,
          agentType,
          timestamp: new Date().toISOString(),
        };
        persist([...messages.filter((m) => m.id !== 'init'), userMsg, errMsg]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, agentType, activeAgentName, messages, persist, push]
  );

  const clearHistory = () => {
    setHistory([]);
    push('info', 'Conversation cleared');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)]">
      <ToastContainer />
      {showHistory && history.length > 0 && (
        <aside className="w-64 shrink-0 bg-white dark:bg-surface-900 border border-gray-200 dark:border-surface-700 rounded-l-xl overflow-y-auto" aria-label="Conversation history">
          <div className="p-3 border-b border-gray-100 dark:border-surface-700 sticky top-0 bg-white dark:bg-surface-900">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <History className="h-3 w-3" /> History
              </h3>
              <button onClick={clearHistory} className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 inline-flex items-center gap-1" aria-label="Clear all history">
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            </div>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {history.filter((m) => m.role === 'user').slice(-20).reverse().map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => send(m.content)}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-800 focus:outline-none focus-visible:bg-blue-50 dark:focus-visible:bg-brand-500/10"
                >
                  <p className="line-clamp-2">{m.content}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{new Date(m.timestamp).toLocaleString()}</p>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
      <div className="flex-1 flex flex-col bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 dark:border-surface-700 px-5 py-3 flex items-center gap-2 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-brand-500/10 dark:to-accent-500/10">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">{activeAgentName}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{activeAgent.description || 'Powered by GPT-4o · routed through the orchestrator'}</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowAgents((s) => !s)}
              className="text-xs px-2 py-1 rounded-md bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 hover:bg-gray-50 dark:hover:bg-surface-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 inline-flex items-center gap-1"
              aria-haspopup="listbox"
              aria-expanded={showAgents}
            >
              Switch agent <ChevronDown className={`h-3 w-3 transition-transform ${showAgents ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {showAgents && (
              <ul role="listbox" className="absolute right-0 top-full mt-1 w-64 z-10 bg-white dark:bg-surface-900 border border-gray-200 dark:border-surface-700 rounded-lg shadow-lg py-1">
                {agents.map((a) => (
                  <li key={a.agent_type}>
                    <button
                      onClick={() => { setAgentType(a.agent_type); setShowAgents(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-surface-800 focus:outline-none focus-visible:bg-blue-50 dark:focus-visible:bg-brand-500/10 ${a.agent_type === agentType ? 'font-semibold text-blue-700 dark:text-brand-300' : 'text-gray-700 dark:text-gray-200'}`}
                    >
                      <p>{a.name || a.agent_type}</p>
                      {a.description && <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{a.description}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => setShowHistory((s) => !s)}
            aria-label="Toggle history"
            aria-pressed={showHistory}
            className={`text-xs px-2 py-1 rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 inline-flex items-center gap-1 ${showHistory ? 'bg-blue-50 dark:bg-brand-500/20 text-blue-700 dark:text-brand-300 border-blue-200 dark:border-brand-500/30' : 'bg-white dark:bg-surface-800 border-gray-200 dark:border-surface-700 text-gray-700 dark:text-gray-200'}`}
          >
            <History className="h-3 w-3" /> History
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin" role="log" aria-live="polite" aria-label="Conversation">
          {messages.map((m) => (
            <article key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0" aria-hidden="true">
                  <Bot className="h-4 w-4 text-white" />
                </div>
              )}
              <div className={`max-w-[80%] ${m.role === 'user' ? 'order-2' : ''}`}>
                {m.role === 'assistant' && m.agentName && (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1.5 flex-wrap">
                    <span>{m.agentName}</span>
                    {m.agentType && <Badge variant="default" size="sm">{m.agentType}</Badge>}
                    {typeof m.confidence === 'number' && (
                      <span className="text-gray-300 normal-case font-normal">
                        confidence {Math.round(m.confidence * 100)}%
                      </span>
                    )}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white whitespace-pre-wrap'
                      : 'bg-gray-50 dark:bg-surface-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-surface-700'
                  }`}
                >
                  {m.pending ? (
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" />
                      <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  ) : m.role === 'assistant' ? (
                    <div className="prose-sm">{renderMarkdown(m.content)}</div>
                  ) : (
                    m.content
                  )}
                </div>
                {m.role === 'assistant' && m.reasoning && m.reasoning.length > 0 && (
                  <details className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">Show reasoning</summary>
                    <ol className="mt-2 space-y-1 list-decimal list-inside">
                      {m.reasoning.map((r, i) => (
                        <li key={i}>{typeof r === 'string' ? r : JSON.stringify(r)}</li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
              {m.role === 'user' && (
                <div className="h-8 w-8 rounded-lg bg-gray-200 dark:bg-surface-800 flex items-center justify-center shrink-0 order-3" aria-hidden="true">
                  <UserIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                </div>
              )}
            </article>
          ))}
          <div ref={endRef} />
        </div>

        <div className="border-t border-gray-200 dark:border-surface-700 p-4 bg-gray-50/50 dark:bg-surface-800/50">
          {history.length === 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  disabled={loading}
                  className="text-xs bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-brand-500/20 px-3 py-1.5 rounded-full disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2"
          >
            <label htmlFor="copilot-input" className="sr-only">Ask the copilot</label>
            <textarea
              id="copilot-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about candidates, evaluations, pipeline…"
              disabled={loading}
              rows={1}
              className="flex-1 border border-gray-200 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50 resize-none max-h-32"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={loading || !input.trim()}
              loading={loading}
              leftIcon={loading ? undefined : <Sparkles className="h-4 w-4" />}
            >
              {loading ? 'Sending…' : 'Send'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
