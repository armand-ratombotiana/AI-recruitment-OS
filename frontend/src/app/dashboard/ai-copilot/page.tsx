'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, Bot, User as UserIcon, Trash2, ChevronDown, History, Code as CodeIcon, AlertCircle } from 'lucide-react';
import { api } from '@/services/api/client';
import { useToast, useLocalStorage } from '@/hooks';
import { Button, Badge, Skeleton, HelpButton, aiCopilotTour } from '@/components';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';

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
    if (/^-\s+/.test(line)) return <div key={i} className="flex gap-1.5 ml-1"><span className="text-gray-400 dark:text-gray-500">•</span><span>{line.slice(2)}</span></div>;
    if (/^\d+\.\s+/.test(line)) {
      const m = /^(\d+)\.\s+(.*)/.exec(line)!;
      return <div key={i} className="flex gap-1.5 ml-1"><span className="text-gray-400 dark:text-gray-500 font-mono">{m[1]}.</span><span>{m[2]}</span></div>;
    }
    if (line.trim() === '') return <div key={i} className="h-2" />;
    return <div key={i}>{formatCodeBlocks(line)}</div>;
  });
}

export default function AICopilotPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [history, setHistory] = useLocalStorage<ChatMessage[]>(STORAGE_KEY, []);
  const [agentType, setAgentType] = useLocalStorage<string>(AGENT_KEY, 'recruiting_copilot');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAgents, setShowAgents] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const { push, ToastContainer } = useToast();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const defaultAgent: Agent = { agent_type: 'recruiting_copilot', name: t('aiCopilot.agentName', 'Recruiting Copilot'), description: t('aiCopilot.subtitle', 'Powered by GPT-4o · routed through the orchestrator') };

  const suggested = useMemo(
    () => [
      t('aiCopilot.suggested.0', 'Summarize my top candidates'),
      t('aiCopilot.suggested.1', 'Who should I move to interview next?'),
      t('aiCopilot.suggested.2', 'Explain the score for Sarah Chen'),
      t('aiCopilot.suggested.3', 'Where is the pipeline bottlenecked?'),
    ],
    [t]
  );

  const messages = useMemo(() => {
    if (history.length === 0) {
      return [
        {
          id: 'init',
          role: 'assistant' as const,
          content: t('aiCopilot.welcome', "Hello! I'm your AI recruiting copilot."),
          agentName: t('aiCopilot.agentName', 'Recruiting Copilot'),
          agentType: 'recruiting_copilot',
          timestamp: new Date().toISOString(),
        },
      ];
    }
    return history;
  }, [history, t]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;
    setAgentsLoading(true);
    api.ai
      .listAgents()
      .then((r: any) => {
        if (cancelled) return;
        const list: Agent[] = Array.isArray(r?.agents) ? r.agents : Array.isArray(r) ? r : [];
        if (list.length > 0) {
          setAgents(list);
        } else {
          setAgents([defaultAgent]);
        }
      })
      .catch(() => {
        if (!cancelled) setAgents([defaultAgent]);
      })
      .finally(() => { if (!cancelled) setAgentsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const allAgents = agents.length > 0 ? agents : [defaultAgent];
  const activeAgent = allAgents.find((a) => a.agent_type === agentType) || allAgents[0];
  const activeAgentName = activeAgent.name || t('aiCopilot.agentName', 'Recruiting Copilot');
  const activeAgentDescription = activeAgent.description || t('aiCopilot.subtitle', 'Powered by GPT-4o · routed through the orchestrator');

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
          agent_type: agentType,
          input: { query: message, task: message },
          context: { source: 'dashboard_copilot', query: message },
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
            lines.push(`## ${t('aiCopilot.pipelineSummary', 'Pipeline summary')}`);
            for (const [k, v] of Object.entries(pipelineSummary)) {
              lines.push(`- **${k}**: ${v}`);
            }
            lines.push('');
          }
          if (suggestions.length) {
            lines.push(`## ${t('aiCopilot.suggestedActions', 'Suggested actions')}`);
            for (const s of suggestions) {
              const action = typeof s === 'string' ? s : s.action || JSON.stringify(s);
              const reason = typeof s === 'object' && s.reason ? ` — ${s.reason}` : '';
              const priority = typeof s === 'object' && s.priority ? ` [${s.priority}]` : '';
              lines.push(`- ${action}${priority}${reason}`);
            }
            lines.push('');
          }
          if (drafts.length) {
            lines.push(`## ${t('aiCopilot.emailDrafts', 'Email drafts')}`);
            for (const d of drafts) {
              lines.push(`- **To:** ${d.to} — "${d.subject}"`);
            }
            lines.push('');
          }
          if (lines.length === 0 && result.text) lines.push(String(result.text));
          if (lines.length === 0 && result.answer) lines.push(String(result.answer));
          if (lines.length === 0 && typeof result.message === 'string') lines.push(result.message);
          if (lines.length === 0) lines.push(t('aiCopilot.processed', 'I have processed your request.'));
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
        push('error', err?.message || t('aiCopilot.requestFailed', 'Copilot request failed. Please try again.'));
        const errMsg: ChatMessage = {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: t('aiCopilot.requestFailedDesc', "I'm having trouble reaching the AI service right now. Please check that the backend is running, then try again."),
          agentName: activeAgentName,
          agentType,
          timestamp: new Date().toISOString(),
        };
        persist([...messages.filter((m) => m.id !== 'init'), userMsg, errMsg]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, agentType, activeAgentName, messages, persist, push, t]
  );

  const clearHistory = () => {
    setHistory([]);
    push('info', t('aiCopilot.cleared', 'Conversation cleared'));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-500" aria-hidden="true" />
            {t('aiCopilot.title', 'AI Copilot')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('aiCopilot.subtitleLong', 'Ask questions about your pipeline, candidates, and evaluations.')}</p>
        </div>
        <HelpButton tour={aiCopilotTour} />
      </div>
      <div className="flex h-[calc(100vh-220px)]">
      <ToastContainer />
      {showHistory && history.length > 0 && (
        <aside
          className="w-64 shrink-0 bg-white dark:bg-surface-900 border border-gray-200 dark:border-surface-700 rounded-l-xl overflow-y-auto hidden md:block"
          aria-label={t('aiCopilot.historyAria', 'Conversation history')}
        >
          <div className="p-3 border-b border-gray-100 dark:border-surface-700 sticky top-0 bg-white dark:bg-surface-900">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <History className="h-3 w-3" aria-hidden="true" /> {t('aiCopilot.history', 'History')}
              </h3>
              <button
                type="button"
                onClick={clearHistory}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1.5 py-1 inline-flex items-center gap-1"
                aria-label={t('aiCopilot.clearHistoryAria', 'Clear conversation history')}
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" /> {t('aiCopilot.clear', 'Clear')}
              </button>
            </div>
          </div>
          <ul className="p-2 space-y-1">
            {history
              .filter((h) => h.id !== 'init')
              .slice(-50)
              .reverse()
              .map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setInput(h.content)}
                    className="w-full text-left text-xs px-2 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 line-clamp-2"
                  >
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${h.role === 'user' ? 'bg-blue-500' : 'bg-purple-500'}`} aria-hidden="true" />
                    {h.content.slice(0, 80)}
                  </button>
                </li>
              ))}
          </ul>
        </aside>
      )}
      <div className="flex-1 flex flex-col bg-white dark:bg-surface-900 border border-gray-200 dark:border-surface-700 rounded-xl overflow-hidden">
        <div className="border-b border-gray-200 dark:border-surface-700 p-3 sm:p-4 flex items-center justify-between gap-3 bg-gray-50/50 dark:bg-surface-800/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0" aria-hidden="true">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{activeAgentName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{activeAgentDescription}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                data-tour="copilot-agents"
                onClick={() => setShowAgents((s) => !s)}
                aria-haspopup="listbox"
                aria-expanded={showAgents}
                disabled={agentsLoading}
                className="text-xs px-3 py-1.5 rounded-md border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:bg-gray-50 dark:hover:bg-surface-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 inline-flex items-center gap-1 disabled:opacity-50"
              >
                {t('aiCopilot.switchAgent', 'Switch agent')} <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </button>
              {showAgents && (
                <ul
                  role="listbox"
                  className="absolute right-0 mt-1 w-72 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto"
                >
                  {allAgents.map((a) => (
                    <li key={a.agent_type}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={a.agent_type === agentType}
                        onClick={() => {
                          setAgentType(a.agent_type);
                          setShowAgents(false);
                          push('info', `${t('aiCopilot.switchedTo', 'Switched to')} ${a.name || a.agent_type}`);
                        }}
                        className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-surface-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${a.agent_type === agentType ? 'bg-blue-50 dark:bg-brand-500/20' : ''}`}
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.name || a.agent_type}</p>
                        {a.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{a.description}</p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              data-tour="copilot-history"
              onClick={() => setShowHistory((s) => !s)}
              aria-label={t('aiCopilot.toggleHistoryAria', 'Toggle history')}
              aria-pressed={showHistory}
              className={`text-xs px-2 py-1.5 rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 inline-flex items-center gap-1 ${showHistory ? 'bg-blue-50 dark:bg-brand-500/20 text-blue-700 dark:text-brand-300 border-blue-200 dark:border-brand-500/30' : 'bg-white dark:bg-surface-800 border-gray-200 dark:border-surface-700 text-gray-700 dark:text-gray-200'}`}
            >
              <History className="h-3 w-3" aria-hidden="true" /> {t('aiCopilot.history', 'History')}
            </button>
          </div>
        </div>
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 scrollbar-thin"
          role="log"
          aria-live="polite"
          aria-label={t('aiCopilot.conversationAria', 'Conversation')}
          data-tour="copilot-response"
        >
          {messages.map((m) => (
            <article key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0" aria-hidden="true">
                  <Bot className="h-4 w-4 text-white" />
                </div>
              )}
              <div className={`max-w-[85%] sm:max-w-[80%] ${m.role === 'user' ? 'order-2' : ''}`}>
                {m.role === 'assistant' && m.agentName && (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1.5 flex-wrap">
                    <span>{m.agentName}</span>
                    {m.agentType && <Badge variant="default" size="sm">{m.agentType}</Badge>}
                    {typeof m.confidence === 'number' && (
                      <span className="text-gray-300 dark:text-gray-500 normal-case font-normal">
                        {t('aiCopilot.confidence', 'confidence')} {Math.round(m.confidence * 100)}%
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
                    <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400" aria-label={t('aiCopilot.thinking', 'AI is thinking…')}>
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
                    <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">{t('aiCopilot.reasoning', 'Show reasoning')}</summary>
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
        <div className="border-t border-gray-200 dark:border-surface-700 p-3 sm:p-4 bg-gray-50/50 dark:bg-surface-800/50">
          {history.length === 0 && (
            <div className="flex flex-wrap gap-2 mb-3" data-tour="copilot-prompts">
              {suggested.map((q) => (
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
            <label htmlFor="copilot-input" className="sr-only">{t('aiCopilot.inputAria', 'Ask the copilot')}</label>
            <textarea
              id="copilot-input"
              data-tour="copilot-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('aiCopilot.placeholder', 'Ask about candidates, evaluations, pipeline…')}
              disabled={loading}
              rows={1}
              aria-label={t('aiCopilot.inputAria', 'Ask the copilot')}
              className="flex-1 border border-gray-200 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50 resize-none max-h-32"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={loading || !input.trim()}
              loading={loading}
              leftIcon={loading ? undefined : <Sparkles className="h-4 w-4" />}
              aria-label={t('aiCopilot.sendAria', 'Send message')}
            >
              {loading ? t('aiCopilot.sending', 'Sending…') : t('aiCopilot.send', 'Send')}
            </Button>
          </form>
        </div>
      </div>
    </div>
    </>
  );
}
