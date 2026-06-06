'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles,
  Bot,
  User as UserIcon,
  Plus,
  MessageSquare,
  Trash2,
  ChevronDown,
  History,
  Copy as CopyIcon,
  Check as CheckIcon,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Send,
  Search,
  Users,
  FileText,
  HelpCircle,
  Briefcase,
  StopCircle,
  AlertCircle,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import { useToast, useLocalStorage, useClickOutside } from '@/hooks';
import { Button, Badge, HelpButton, aiCopilotTour, Markdown } from '@/components';
import { useLocaleStore, translate, formatRelativeTime } from '@/stores/locale-store';

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
  streaming?: boolean;
  error?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  agentType?: string;
}

interface Agent {
  agent_type: string;
  name?: string;
  description?: string;
  capabilities?: string[];
}

const CONVERSATIONS_KEY = 'airos_copilot_conversations_v2';
const CURRENT_CONV_KEY = 'airos_copilot_current_conv_v2';
const AGENT_KEY = 'airos_copilot_agent';

const SUGGESTED_PROMPTS: Array<{
  key: string;
  icon: typeof Users;
  gradient: string;
  build: (t: (k: string, fb?: string) => string) => { title: string; subtitle: string; prompt: string };
}> = [
  {
    key: 'topCandidates',
    icon: Users,
    gradient: 'from-blue-500 to-indigo-600',
    build: (t) => ({
      title: t('aiCopilot.cards.topCandidates.title', 'Find me top candidates for X'),
      subtitle: t('aiCopilot.cards.topCandidates.subtitle', 'Surface the best matches from your pipeline'),
      prompt: t('aiCopilot.cards.topCandidates.prompt', 'Find me my top 5 candidates across all open roles, ranked by AI evaluation score, and explain why each one stands out.'),
    }),
  },
  {
    key: 'jobDescription',
    icon: Briefcase,
    gradient: 'from-purple-500 to-pink-600',
    build: (t) => ({
      title: t('aiCopilot.cards.jobDescription.title', 'Write a job description for Y'),
      subtitle: t('aiCopilot.cards.jobDescription.subtitle', 'Generate an inclusive, compelling JD'),
      prompt: t('aiCopilot.cards.jobDescription.prompt', 'Write a structured, inclusive job description for a Senior Full-Stack Engineer role (React, Node.js, 5+ years experience, remote-friendly). Include responsibilities, must-have and nice-to-have skills, and a short equal-opportunity statement.'),
    }),
  },
  {
    key: 'analyzeResume',
    icon: FileText,
    gradient: 'from-emerald-500 to-teal-600',
    build: (t) => ({
      title: t('aiCopilot.cards.analyzeResume.title', 'Analyze this resume'),
      subtitle: t('aiCopilot.cards.analyzeResume.subtitle', 'Score, strengths, gaps, and risks'),
      prompt: t('aiCopilot.cards.analyzeResume.prompt', 'Analyze the most recently uploaded resume. Provide an overall match score, top 3 strengths, top 3 risks/gaps, and a recommended next action (interview, hold, reject).'),
    }),
  },
  {
    key: 'interviewQuestions',
    icon: HelpCircle,
    gradient: 'from-amber-500 to-orange-600',
    build: (t) => ({
      title: t('aiCopilot.cards.interviewQuestions.title', 'Generate interview questions'),
      subtitle: t('aiCopilot.cards.interviewQuestions.subtitle', 'Behavioral + technical + role-specific'),
      prompt: t('aiCopilot.cards.interviewQuestions.prompt', 'Generate 8 interview questions for a Senior Frontend Engineer interview: 3 behavioral, 3 technical (React, TypeScript, performance), and 2 system-design. For each, include what a strong answer looks like.'),
    }),
  },
];

const WELCOME_AGENT: Agent = {
  agent_type: 'recruiting_copilot',
  name: 'Recruiting Copilot',
  description: 'Powered by GPT-4o · routed through the orchestrator',
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return 'New conversation';
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}

function findDeltaKey(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = ['delta', 'content', 'text', 'token', 'chunk', 'message'];
  for (const k of candidates) {
    if (typeof payload[k] === 'string') return k;
  }
  return null;
}

interface StreamHandle {
  cancel: () => void;
}

function buildAssistantContent(result: any, t: (k: string, fb?: string) => string): string {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';

  const lines: string[] = [];
  const pipelineSummary = result.pipeline_summary;
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
  const drafts = Array.isArray(result.email_drafts) ? result.email_drafts : [];

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
  return lines.join('\n');
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function simulateStreamText(text: string, onDelta: (chunk: string) => void, signal?: { cancelled: boolean }) {
  const tokens = text.match(/\S+\s*|\s+/g) || [text];
  for (const tok of tokens) {
    if (signal?.cancelled) return;
    onDelta(tok);
    if (/\s/.test(tok)) {
      await delay(8);
    } else {
      await delay(6 + Math.min(tok.length, 12));
    }
  }
}

interface StreamResult {
  content: string;
  final: any;
  streamed: boolean;
}

async function streamOrchestrate(
  payload: any,
  onDelta: (chunk: string) => void,
  token: string | null,
  signal: { cancelled: boolean }
): Promise<StreamResult> {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + '/api/v1';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream, application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${apiBase}/ai/orchestrate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, stream: true }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new APIError(e instanceof Error ? e.message : 'Network error', 0);
  }

  if (response.status === 401) {
    throw new APIError('Unauthorized', 401);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.detail || body?.message || '';
    } catch {
      /* noop */
    }
    throw new APIError(detail || `API error: ${response.status}`, response.status);
  }

  if (contentType.includes('text/event-stream')) {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new APIError('No response body', 0);
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let finalPayload: any = null;
    let receivedAnyChunk = false;

    while (!signal.cancelled) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split(/\n\n/);
      buffer = events.pop() || '';

      for (const ev of events) {
        const lines = ev.split(/\n/);
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const parsed = JSON.parse(raw);
            const key = findDeltaKey(parsed);
            if (key && typeof parsed[key] === 'string') {
              accumulated += parsed[key];
              onDelta(parsed[key]);
              receivedAnyChunk = true;
            }
            if (parsed.result !== undefined || parsed.task_id !== undefined || parsed.done === true) {
              finalPayload = parsed;
            }
          } catch {
            accumulated += raw;
            onDelta(raw);
            receivedAnyChunk = true;
          }
        }
      }
    }

    if (!receivedAnyChunk && finalPayload) {
      const finalContent = buildAssistantContent(finalPayload.result || finalPayload, () => '');
      await simulateStreamText(finalContent, onDelta, signal);
      return { content: finalContent, final: finalPayload, streamed: false };
    }

    return { content: accumulated, final: finalPayload, streamed: receivedAnyChunk };
  }

  const json = await response.json();
  const finalContent = buildAssistantContent(json.result || json, () => '');
  await simulateStreamText(finalContent, onDelta, signal);
  return { content: finalContent, final: json, streamed: false };
}

export default function AICopilotPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fb?: string) => translate(locale, key, fb),
    [locale]
  );

  const [conversations, setConversations] = useLocalStorage<Conversation[]>(CONVERSATIONS_KEY, []);
  const [currentId, setCurrentId] = useLocalStorage<string>(CURRENT_CONV_KEY, '');
  const [agentType, setAgentType] = useLocalStorage<string>(AGENT_KEY, 'recruiting_copilot');

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [showAgents, setShowAgents] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [search, setSearch] = useState('');

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { push, ToastContainer } = useToast();

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const agentsRef = useRef<HTMLDivElement>(null);
  const streamControllerRef = useRef<{ cancelled: boolean } | null>(null);

  useClickOutside(agentsRef, () => setShowAgents(false));

  const ensureConversation = useCallback(
    (id?: string): Conversation => {
      const now = new Date().toISOString();
      if (id) {
        const existing = conversations.find((c) => c.id === id);
        if (existing) return existing;
      }
      const fresh: Conversation = {
        id: makeId('conv'),
        title: t('aiCopilot.newConversation', 'New conversation'),
        createdAt: now,
        updatedAt: now,
        messages: [],
        agentType,
      };
      setConversations((prev) => [fresh, ...prev].slice(0, 50));
      setCurrentId(fresh.id);
      return fresh;
    },
    [conversations, agentType, setConversations, setCurrentId, t]
  );

  useEffect(() => {
    if (!currentId && conversations.length === 0) {
      ensureConversation();
    } else if (currentId && !conversations.find((c) => c.id === currentId)) {
      setCurrentId(conversations[0]?.id || '');
    }
  }, [currentId, conversations, ensureConversation, setCurrentId]);

  useEffect(() => {
    let cancelled = false;
    setAgentsLoading(true);
    api.ai
      .listAgents()
      .then((r: any) => {
        if (cancelled) return;
        const list: Agent[] = Array.isArray(r?.agents) ? r.agents : Array.isArray(r) ? r : [];
        setAgents(list.length > 0 ? list : [WELCOME_AGENT]);
      })
      .catch(() => {
        if (!cancelled) setAgents([WELCOME_AGENT]);
      })
      .finally(() => {
        if (!cancelled) setAgentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentConversation = useMemo(
    () => conversations.find((c) => c.id === currentId) || null,
    [conversations, currentId]
  );

  const messages = useMemo<ChatMessage[]>(() => {
    if (!currentConversation || currentConversation.messages.length === 0) {
      return [
        {
          id: 'welcome',
          role: 'assistant',
          content: t(
            'aiCopilot.welcome',
            "Hello! I'm your AI recruiting copilot. I can help you summarize candidates, explain AI evaluation scores, compare applicants, recommend hiring decisions, and generate interview questions. Pick a suggestion below or type your own question to get started."
          ),
          agentName: t('aiCopilot.agentName', 'Recruiting Copilot'),
          agentType: 'recruiting_copilot',
          timestamp: new Date().toISOString(),
        },
      ];
    }
    return currentConversation.messages;
  }, [currentConversation, t]);

  const allAgents = useMemo(
    () => (agents.length > 0 ? agents : [WELCOME_AGENT]),
    [agents]
  );
  const activeAgent = useMemo(
    () => allAgents.find((a) => a.agent_type === agentType) || allAgents[0],
    [allAgents, agentType]
  );
  const activeAgentName = activeAgent.name || t('aiCopilot.agentName', 'Recruiting Copilot');
  const activeAgentDescription =
    activeAgent.description || t('aiCopilot.subtitle', 'Powered by GPT-4o · routed through the orchestrator');

  const suggested = useMemo(
    () => SUGGESTED_PROMPTS.map((s) => ({ ...s.build(t), icon: s.icon, gradient: s.gradient })),
    [t]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const updateConversation = useCallback(
    (id: string, updater: (conv: Conversation) => Conversation) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === id);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = updater(next[idx]);
        return next;
      });
    },
    [setConversations]
  );

  const persistMessages = useCallback(
    (convId: string, msgs: ChatMessage[], title?: string) => {
      updateConversation(convId, (conv) => ({
        ...conv,
        messages: msgs.slice(-200),
        updatedAt: new Date().toISOString(),
        title: title && conv.title === t('aiCopilot.newConversation', 'New conversation') ? title : conv.title,
      }));
    },
    [updateConversation, t]
  );

  const send = useCallback(
    async (text?: string, opts?: { regenerateOfMessageId?: string }) => {
      const message = (text ?? input).trim();
      const targetConvId = currentId || ensureConversation().id;
      const conv = conversations.find((c) => c.id === targetConvId) || ensureConversation(targetConvId);
      if (!message || loading) return;
      setInput('');

      const previousMessages = conv.messages;
      let userMsg: ChatMessage;
      let baseMessages: ChatMessage[];

      if (opts?.regenerateOfMessageId) {
        const regenIdx = previousMessages.findIndex((m) => m.id === opts.regenerateOfMessageId);
        if (regenIdx <= 0) {
          push('error', t('aiCopilot.regenNotFound', 'Could not find the original message to regenerate.'));
          return;
        }
        userMsg = previousMessages[regenIdx - 1];
        baseMessages = previousMessages.slice(0, regenIdx);
      } else {
        userMsg = {
          id: makeId('u'),
          role: 'user',
          content: message,
          timestamp: new Date().toISOString(),
        };
        baseMessages = previousMessages;
      }

      const pendingMsg: ChatMessage = {
        id: makeId('p'),
        role: 'assistant',
        content: '',
        agentName: activeAgentName,
        agentType,
        timestamp: new Date().toISOString(),
        pending: true,
        streaming: true,
      };
      const nextMessages = [...baseMessages, userMsg, pendingMsg];
      const titleForNew = baseMessages.length === 0 ? deriveTitle(userMsg.content) : undefined;
      persistMessages(targetConvId, nextMessages, titleForNew);

      setLoading(true);
      setStreamingId(pendingMsg.id);

      const signal = { cancelled: false };
      streamControllerRef.current = signal;

      const onDelta = (chunk: string) => {
        if (signal.cancelled) return;
        updateConversation(targetConvId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === pendingMsg.id ? { ...m, content: m.content + chunk } : m
          ),
        }));
      };

      try {
        const r = await streamOrchestrate(
          {
            agent_type: agentType,
            input: { query: userMsg.content, task: userMsg.content },
            context: { source: 'dashboard_copilot', query: userMsg.content },
          },
          onDelta,
          api.getToken(),
          signal
        );

        const final = r.final || {};
        const finalContent = r.content || buildAssistantContent(final.result || final, t);
        const finalMsg: ChatMessage = {
          id: pendingMsg.id,
          role: 'assistant',
          content: finalContent,
          agentName: final.agent_name || activeAgentName,
          agentType: final.agent_type || agentType,
          confidence:
            typeof final.confidence_score === 'number' ? final.confidence_score : undefined,
          reasoning: Array.isArray(final.reasoning_chain) ? final.reasoning_chain : undefined,
          timestamp: new Date().toISOString(),
          streaming: false,
        };
        if (signal.cancelled) return;
        updateConversation(targetConvId, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === pendingMsg.id ? finalMsg : m)),
          updatedAt: new Date().toISOString(),
        }));
      } catch (err: any) {
        if (signal.cancelled) return;
        push('error', err?.message || t('aiCopilot.requestFailed', 'Copilot request failed. Please try again.'));
        const errMsg: ChatMessage = {
          id: pendingMsg.id,
          role: 'assistant',
          content: t(
            'aiCopilot.requestFailedDesc',
            "I'm having trouble reaching the AI service right now. Please check that the backend is running, then try again."
          ),
          agentName: activeAgentName,
          agentType,
          timestamp: new Date().toISOString(),
          error: true,
        };
        updateConversation(targetConvId, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === pendingMsg.id ? errMsg : m)),
        }));
      } finally {
        streamControllerRef.current = null;
        setLoading(false);
        setStreamingId(null);
      }
    },
    [
      input,
      loading,
      agentType,
      activeAgentName,
      currentId,
      conversations,
      ensureConversation,
      persistMessages,
      push,
      t,
      updateConversation,
    ]
  );

  const stopStreaming = useCallback(() => {
    if (streamControllerRef.current) {
      streamControllerRef.current.cancelled = true;
    }
    if (streamingId) {
      const conv = conversations.find((c) => c.messages.some((m) => m.id === streamingId));
      if (conv) {
        updateConversation(conv.id, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === streamingId ? { ...m, streaming: false, pending: false } : m
          ),
        }));
      }
    }
    setLoading(false);
    setStreamingId(null);
  }, [streamingId, conversations, updateConversation]);

  const newConversation = useCallback(() => {
    const fresh = ensureConversation();
    setCurrentId(fresh.id);
    setInput('');
    push('info', t('aiCopilot.startedNew', 'Started a new conversation'));
  }, [ensureConversation, setCurrentId, push, t]);

  const deleteConversation = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentId === id) {
        const remaining = conversations.filter((c) => c.id !== id);
        setCurrentId(remaining[0]?.id || '');
      }
      push('info', t('aiCopilot.conversationDeleted', 'Conversation deleted'));
    },
    [currentId, conversations, setConversations, setCurrentId, push, t]
  );

  const clearAll = useCallback(() => {
    if (conversations.length === 0) return;
    if (!window.confirm(t('aiCopilot.confirmClearAll', 'Delete all conversations? This cannot be undone.'))) {
      return;
    }
    setConversations([]);
    setCurrentId('');
    push('info', t('aiCopilot.clearedAll', 'All conversations cleared'));
  }, [conversations.length, setConversations, setCurrentId, push, t]);

  const copyMessage = useCallback(
    async (msg: ChatMessage) => {
      if (typeof window === 'undefined' || !msg.content) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(msg.content);
        } else {
          const ta = document.createElement('textarea');
          ta.value = msg.content;
          ta.style.position = 'absolute';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        setCopiedId(msg.id);
        setTimeout(() => setCopiedId(null), 1500);
        push('success', t('aiCopilot.copied', 'Copied to clipboard'));
      } catch {
        push('error', t('aiCopilot.copyFailed', 'Could not copy'));
      }
    },
    [push, t]
  );

  const setFeedback = useCallback(
    (msg: ChatMessage, feedback: 'up' | 'down') => {
      if (!currentConversation) return;
      const next = feedback === msg.feedback ? undefined : feedback;
      updateConversation(currentConversation.id, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === msg.id ? { ...m, feedback: next } : m)),
      }));
      if (next) {
        push('success', feedback === 'up'
          ? t('aiCopilot.feedbackThanks', 'Thanks for the feedback!')
          : t('aiCopilot.feedbackRecorded', 'Feedback recorded — we will learn from this.')
        );
      }
    },
    [currentConversation, updateConversation, push, t]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, search]);

  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && !messages[i].pending && !messages[i].error) {
        return messages[i];
      }
    }
    return null;
  }, [messages]);

  return (
    <div className="flex h-[calc(100vh-160px)] flex-col">
      <ToastContainer />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <Sparkles className="h-6 w-6 text-purple-500" aria-hidden="true" />
            {t('aiCopilot.title', 'AI Copilot')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('aiCopilot.subtitleLong', 'Ask questions about your pipeline, candidates, and evaluations.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={newConversation}
            aria-label={t('aiCopilot.newConversationAria', 'Start new conversation')}
          >
            {t('aiCopilot.newConversation', 'New conversation')}
          </Button>
          <HelpButton tour={aiCopilotTour} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {showSidebar && (
          <aside
            className="hidden w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900 md:flex"
            aria-label={t('aiCopilot.sidebarAria', 'Conversations sidebar')}
          >
            <div className="border-b border-gray-200 p-3 dark:border-surface-700">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('aiCopilot.searchConversations', 'Search conversations…')}
                  aria-label={t('aiCopilot.searchConversationsAria', 'Search conversations')}
                  className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredConversations.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                  {conversations.length === 0
                    ? t('aiCopilot.noConversations', 'No conversations yet')
                    : t('aiCopilot.noMatches', 'No conversations match your search')}
                </div>
              ) : (
                <ul className="space-y-1" role="list">
                  {filteredConversations.map((c) => {
                    const isActive = c.id === currentId;
                    const userCount = c.messages.filter((m) => m.role === 'user').length;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setCurrentId(c.id)}
                          aria-current={isActive ? 'true' : undefined}
                          className={`group w-full rounded-lg border px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            isActive
                              ? 'border-blue-200 bg-blue-50 dark:border-brand-500/30 dark:bg-brand-500/10'
                              : 'border-transparent hover:bg-gray-50 dark:hover:bg-surface-800'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <MessageSquare
                              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                                isActive ? 'text-blue-600 dark:text-brand-400' : 'text-gray-400'
                              }`}
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className={`truncate text-xs font-medium ${
                                  isActive
                                    ? 'text-blue-900 dark:text-brand-200'
                                    : 'text-gray-900 dark:text-gray-100'
                                }`}
                              >
                                {c.title}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                                <span>{formatRelativeTime(c.updatedAt, locale)}</span>
                                {userCount > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {userCount}{' '}
                                      {userCount === 1
                                        ? t('aiCopilot.messageSingular', 'message')
                                        : t('aiCopilot.messagePlural', 'messages')}
                                    </span>
                                  </>
                                )}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => deleteConversation(c.id, e)}
                              className="rounded p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-danger-500/20 dark:hover:text-danger-500"
                              aria-label={t('aiCopilot.deleteAria', 'Delete conversation')}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-gray-200 p-2 dark:border-surface-700">
              <button
                type="button"
                onClick={clearAll}
                disabled={conversations.length === 0}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-gray-400 dark:hover:bg-danger-500/20 dark:hover:text-danger-500"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('aiCopilot.clearAll', 'Clear all conversations')}
              </button>
            </div>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/50 p-3 dark:border-surface-700 dark:bg-surface-800/50 sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600"
                aria-hidden="true"
              >
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {activeAgentName}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {activeAgentDescription}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative" ref={agentsRef}>
                <button
                  type="button"
                  data-tour="copilot-agents"
                  onClick={() => setShowAgents((s) => !s)}
                  aria-haspopup="listbox"
                  aria-expanded={showAgents}
                  disabled={agentsLoading}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
                >
                  {t('aiCopilot.switchAgent', 'Switch agent')}{' '}
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                </button>
                {showAgents && (
                  <ul
                    role="listbox"
                    className="absolute right-0 z-20 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-surface-700 dark:bg-surface-800"
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
                            push(
                              'info',
                              `${t('aiCopilot.switchedTo', 'Switched to')} ${a.name || a.agent_type}`
                            );
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-surface-700 ${
                            a.agent_type === agentType
                              ? 'bg-blue-50 dark:bg-brand-500/20'
                              : ''
                          }`}
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {a.name || a.agent_type}
                          </p>
                          {a.description && (
                            <p className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                              {a.description}
                            </p>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowSidebar((s) => !s)}
                aria-label={t('aiCopilot.toggleSidebarAria', 'Toggle conversations sidebar')}
                aria-pressed={showSidebar}
                className="hidden items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700 md:inline-flex"
              >
                <History className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"
            role="log"
            aria-live="polite"
            aria-label={t('aiCopilot.conversationAria', 'Conversation')}
            data-tour="copilot-response"
          >
            <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2" data-tour="copilot-prompts">
              {suggested.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => send(s.prompt)}
                    disabled={loading}
                    className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-blue-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-surface-700 dark:bg-surface-800 dark:hover:border-brand-500/50"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${s.gradient} text-white`}
                      aria-hidden="true"
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {s.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                        {s.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {messages.map((m) => (
              <article
                key={m.id}
                className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600"
                    aria-hidden="true"
                  >
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                )}
                <div className={`max-w-[85%] sm:max-w-[80%] ${m.role === 'user' ? 'order-2' : ''}`}>
                  {m.role === 'assistant' && m.agentName && !m.pending && (
                    <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      <span>{m.agentName}</span>
                      {m.agentType && (
                        <Badge variant="default" size="sm">
                          {m.agentType}
                        </Badge>
                      )}
                      {typeof m.confidence === 'number' && (
                        <span className="font-normal normal-case text-gray-300 dark:text-gray-500">
                          {t('aiCopilot.confidence', 'confidence')} {Math.round(m.confidence * 100)}%
                        </span>
                      )}
                    </p>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      m.role === 'user'
                        ? 'whitespace-pre-wrap bg-blue-600 text-white'
                        : m.error
                          ? 'border border-red-200 bg-red-50 text-red-900 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-red-200'
                          : 'border border-gray-200 bg-gray-50 text-gray-900 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100'
                    }`}
                  >
                    {m.pending ? (
                      <span
                        className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400"
                        aria-label={t('aiCopilot.thinking', 'AI is thinking…')}
                      >
                        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                        <span
                          className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                          style={{ animationDelay: '150ms' }}
                        />
                        <span
                          className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                          style={{ animationDelay: '300ms' }}
                        />
                      </span>
                    ) : m.role === 'assistant' ? (
                      <>
                        <Markdown>{m.content}</Markdown>
                        {m.streaming && m.content.length === 0 && null}
                        {m.streaming && m.content.length > 0 && (
                          <span
                            className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-blue-500"
                            aria-hidden="true"
                          />
                        )}
                      </>
                    ) : (
                      m.content
                    )}
                  </div>
                  {m.role === 'assistant' && !m.pending && !m.error && (
                    <div className="mt-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => copyMessage(m)}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-surface-700 dark:hover:text-white"
                        aria-label={
                          copiedId === m.id
                            ? t('aiCopilot.copiedAria', 'Copied')
                            : t('aiCopilot.copyAria', 'Copy message')
                        }
                      >
                        {copiedId === m.id ? (
                          <CheckIcon className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <CopyIcon className="h-3 w-3" aria-hidden="true" />
                        )}
                        {copiedId === m.id
                          ? t('aiCopilot.copied', 'Copied')
                          : t('aiCopilot.copy', 'Copy')}
                      </button>
                      {lastAssistant?.id === m.id && currentConversation && currentConversation.messages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const userMsg = [...currentConversation.messages]
                              .reverse()
                              .find((mm) => mm.role === 'user' && mm.id !== m.id);
                            if (userMsg) send(userMsg.content, { regenerateOfMessageId: m.id });
                          }}
                          disabled={loading}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-surface-700 dark:hover:text-white"
                          aria-label={t('aiCopilot.regenerateAria', 'Regenerate response')}
                        >
                          <RefreshCw className="h-3 w-3" aria-hidden="true" />
                          {t('aiCopilot.regenerate', 'Regenerate')}
                        </button>
                      )}
                      <div className="ml-auto flex items-center gap-0.5" role="group" aria-label={t('aiCopilot.feedbackAria', 'Rate response')}>
                        <button
                          type="button"
                          onClick={() => setFeedback(m, 'up')}
                          aria-pressed={m.feedback === 'up'}
                          aria-label={t('aiCopilot.thumbUpAria', 'Thumbs up')}
                          className={`rounded p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            m.feedback === 'up'
                              ? 'bg-green-100 text-green-700 dark:bg-success-500/20 dark:text-success-500'
                              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-surface-700 dark:hover:text-gray-200'
                          }`}
                        >
                          <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeedback(m, 'down')}
                          aria-pressed={m.feedback === 'down'}
                          aria-label={t('aiCopilot.thumbDownAria', 'Thumbs down')}
                          className={`rounded p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            m.feedback === 'down'
                              ? 'bg-red-100 text-red-700 dark:bg-danger-500/20 dark:text-danger-500'
                              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-surface-700 dark:hover:text-gray-200'
                          }`}
                        >
                          <ThumbsDown className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                  {m.role === 'assistant' && m.reasoning && m.reasoning.length > 0 && !m.pending && (
                    <details className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <summary className="cursor-pointer rounded font-medium hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-gray-200">
                        {t('aiCopilot.reasoning', 'Show reasoning')}
                      </summary>
                      <ol className="mt-2 list-decimal space-y-1 pl-5">
                        {m.reasoning.map((r, i) => (
                          <li key={i}>{typeof r === 'string' ? r : JSON.stringify(r)}</li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {m.error && (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-300">
                      <AlertCircle className="h-3 w-3" aria-hidden="true" />
                      {t('aiCopilot.error', 'AI service error')}
                    </p>
                  )}
                </div>
                {m.role === 'user' && (
                  <div
                    className="order-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-200 dark:bg-surface-800"
                    aria-hidden="true"
                  >
                    <UserIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                  </div>
                )}
              </article>
            ))}
            <div ref={endRef} />
          </div>

          <div className="border-t border-gray-200 bg-gray-50/50 p-3 dark:border-surface-700 dark:bg-surface-800/50 sm:p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor="copilot-input" className="sr-only">
                {t('aiCopilot.inputAria', 'Ask the copilot')}
              </label>
              <textarea
                id="copilot-input"
                data-tour="copilot-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t(
                  'aiCopilot.placeholder',
                  'Ask about candidates, evaluations, pipeline…'
                )}
                disabled={loading}
                rows={1}
                aria-label={t('aiCopilot.inputAria', 'Ask the copilot')}
                className="flex-1 resize-none rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
                style={{ maxHeight: '8rem' }}
              />
              {loading ? (
                <Button
                  type="button"
                  variant="danger"
                  size="md"
                  onClick={stopStreaming}
                  leftIcon={<StopCircle className="h-4 w-4" aria-hidden="true" />}
                  aria-label={t('aiCopilot.stopAria', 'Stop generating')}
                >
                  {t('aiCopilot.stop', 'Stop')}
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={!input.trim()}
                  leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
                  aria-label={t('aiCopilot.sendAria', 'Send message')}
                >
                  {t('aiCopilot.send', 'Send')}
                </Button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
