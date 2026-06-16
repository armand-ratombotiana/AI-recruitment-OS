'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Sparkles,
  Bot,
  User as UserIcon,
  Plus,
  ChevronDown,
  History,
  Send,
  Users,
  FileText,
  HelpCircle,
  Briefcase,
  StopCircle,
  AlertCircle,
  Cloud,
  CloudOff,
  RefreshCw as RefreshIcon,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import type { AiTypes } from '@/services/api/types';
import { useClickOutside } from '@/hooks';
import { useToast } from '@/components/ui/toast';
import { Button, HelpButton, aiCopilotTour } from '@/components';
import type { ConversationItem, MessageBubbleProps } from '@/components';
import { useLocaleStore, translate, formatRelativeTime } from '@/stores/locale-store';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/loading';

const ConversationSidebar = dynamic(() => import('@/components/ai/conversation-sidebar').then(mod => ({ default: mod.ConversationSidebar })), {
  loading: () => <Skeleton className="h-full w-64" />,
  ssr: false,
});

const MessageBubble = dynamic(() => import('@/components/ai/message-bubble').then(mod => ({ default: mod.MessageBubble })), {
  loading: () => <Skeleton className="h-20 w-2/3" />,
  ssr: false,
});

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentName?: string;
  agentType?: string;
  confidence?: number;
  reasoning?: Array<string | Record<string, unknown>>;
  feedback?: 'up' | 'down';
  pending?: boolean;
  streaming?: boolean;
  error?: boolean;
  timestamp: string;
}

interface LocalConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  agentType?: string;
  syncedAt?: string;
  lastError?: string;
}

interface Agent {
  agent_type: string;
  name?: string;
  description?: string;
  capabilities?: string[];
}

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

function deriveTitle(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
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

function apiMessageToLocal(m: AiTypes.AiConversationMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role === 'system' ? 'assistant' : m.role,
    content: m.content,
    agentName: m.agent_name || undefined,
    agentType: m.agent_type || undefined,
    confidence: typeof m.confidence === 'number' ? m.confidence : undefined,
    reasoning: Array.isArray(m.reasoning) ? m.reasoning : undefined,
    feedback: m.feedback || undefined,
    error: !!m.error,
    timestamp: m.created_at,
  };
}

export default function AICopilotPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fb?: string) => translate(locale, key, fb),
    [locale]
  );

  const [conversations, setConversations] = useState<LocalConversation[]>([]);
  const [currentId, setCurrentId] = useState<string>('');
  const [agentType, setAgentType] = useState<string>('recruiting_copilot');
  const [apiAvailable, setApiAvailable] = useState<boolean>(true);
  const [conversationsLoading, setConversationsLoading] = useState(true);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [showAgents, setShowAgents] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [search, setSearch] = useState('');

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const { push } = useToast();

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const agentsRef = useRef<HTMLDivElement>(null);
  const streamControllerRef = useRef<{ cancelled: boolean } | null>(null);

  useClickOutside(agentsRef, () => setShowAgents(false));

  const newConversationTitle = useMemo(
    () => t('aiConversation.untitled', t('aiCopilot.newConversation', 'New conversation')),
    [t]
  );

  const upsertConversation = useCallback((conv: LocalConversation) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === conv.id);
      if (idx === -1) return [conv, ...prev].slice(0, 100);
      const next = prev.slice();
      next[idx] = conv;
      return next;
    });
  }, []);

  const removeConversationLocal = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const loadConversations = useCallback(async () => {
    setConversationsLoading(true);
    try {
      const res = await api.ai.conversations.list();
      const list = Array.isArray(res?.conversations) ? res.conversations : [];
      const mapped: LocalConversation[] = list.map((c) => ({
        id: c.id,
        title: c.title || newConversationTitle,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        agentType: c.agent_type,
        messages: [],
        syncedAt: new Date().toISOString(),
      }));
      setConversations(mapped);
      setApiAvailable(true);
    } catch {
      setApiAvailable(false);
      setConversations([]);
    } finally {
      setConversationsLoading(false);
    }
  }, [newConversationTitle]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

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

  const loadConversationMessages = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        const detail = await api.ai.conversations.get(id);
        const msgs = Array.isArray(detail?.messages) ? detail.messages : [];
        setConversations((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  title: detail.title || c.title,
                  agentType: detail.agent_type || c.agentType,
                  messages: msgs.map(apiMessageToLocal),
                  updatedAt: detail.updated_at,
                  syncedAt: new Date().toISOString(),
                }
              : c
          )
        );
        setApiAvailable(true);
      } catch {
        setApiAvailable(false);
      }
    },
    []
  );

  const ensureConversation = useCallback(
    (id?: string): LocalConversation => {
      const now = new Date().toISOString();
      if (id) {
        const existing = conversations.find((c) => c.id === id);
        if (existing) return existing;
      }
      const fresh: LocalConversation = {
        id: makeId('conv'),
        title: newConversationTitle,
        createdAt: now,
        updatedAt: now,
        messages: [],
        agentType,
      };
      upsertConversation(fresh);
      setCurrentId(fresh.id);

      if (apiAvailable) {
        api.ai.conversations
          .create({ title: newConversationTitle, agent_type: agentType })
          .then((detail) => {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === fresh.id
                  ? {
                      ...c,
                      id: detail.id,
                      title: detail.title || c.title,
                      agentType: detail.agent_type || c.agentType,
                      syncedAt: new Date().toISOString(),
                    }
                  : c
              )
            );
            setCurrentId(detail.id);
          })
          .catch((err) => {
            setApiAvailable(false);
            push('error', t('aiConversation.saveError', 'Could not save changes to the server'));
            console.warn('Conversation create failed', err);
          });
      }
      return fresh;
    },
    [conversations, agentType, apiAvailable, newConversationTitle, push, t, upsertConversation]
  );

  useEffect(() => {
    if (!currentId && conversations.length > 0) {
      setCurrentId(conversations[0].id);
    } else if (currentId && !conversations.find((c) => c.id === currentId) && conversations.length > 0) {
      setCurrentId(conversations[0].id);
    }
  }, [currentId, conversations]);

  useEffect(() => {
    if (currentId) {
      const conv = conversations.find((c) => c.id === currentId);
      if (conv && conv.messages.length === 0) {
        loadConversationMessages(currentId);
      }
    }
  }, [currentId, conversations, loadConversationMessages]);

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
    (id: string, updater: (conv: LocalConversation) => LocalConversation) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === id);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = updater(next[idx]);
        return next;
      });
    },
    []
  );

  const persistMessages = useCallback(
    (convId: string, msgs: ChatMessage[], title?: string) => {
      updateConversation(convId, (conv) => ({
        ...conv,
        messages: msgs.slice(-200),
        updatedAt: new Date().toISOString(),
        title: title && (conv.title === newConversationTitle || !conv.title) ? title : conv.title,
      }));
    },
    [updateConversation, newConversationTitle]
  );

  const persistUserMessageToApi = useCallback(
    (convId: string, content: string) => {
      if (!apiAvailable) return;
      api.ai.conversations
        .addMessage(convId, { role: 'user', content })
        .catch((err) => {
          console.warn('Failed to persist user message', err);
          setApiAvailable(false);
        });
    },
    [apiAvailable]
  );

  const persistAssistantMessageToApi = useCallback(
    (convId: string, msg: ChatMessage) => {
      if (!apiAvailable) return;
      api.ai.conversations
        .addMessage(convId, {
          role: 'assistant',
          content: msg.content,
          agent_type: msg.agentType,
          agent_name: msg.agentName,
          confidence: msg.confidence,
          reasoning: msg.reasoning,
          error: msg.error,
        })
        .catch((err) => {
          console.warn('Failed to persist assistant message', err);
          setApiAvailable(false);
        });
    },
    [apiAvailable]
  );

  const send = useCallback(
    async (text?: string, opts?: { regenerateOfMessageId?: string; userMessageOverride?: string }) => {
      const message = (opts?.userMessageOverride ?? text ?? input).trim();
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
      const titleForNew = baseMessages.length === 0 ? deriveTitle(userMsg.content, newConversationTitle) : undefined;
      persistMessages(targetConvId, nextMessages, titleForNew);

      if (!opts?.regenerateOfMessageId && apiAvailable) {
        persistUserMessageToApi(targetConvId, userMsg.content);
      }

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
        persistAssistantMessageToApi(targetConvId, finalMsg);
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
        persistAssistantMessageToApi(targetConvId, errMsg);
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
      persistUserMessageToApi,
      persistAssistantMessageToApi,
      push,
      t,
      updateConversation,
      apiAvailable,
      newConversationTitle,
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
  }, [ensureConversation, push, t]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === currentId) return;
      setCurrentId(id);
      setInput('');
    },
    [currentId]
  );

  const handleDeleteConversation = useCallback((id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setPendingDelete({ id, title: conv.title });
  }, [conversations]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    removeConversationLocal(id);
    if (currentId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      setCurrentId(remaining[0]?.id || '');
    }
    if (apiAvailable) {
      try {
        await api.ai.conversations.delete(id);
      } catch (err) {
        console.warn('Failed to delete conversation on server', err);
        push('error', t('aiConversation.saveError', 'Could not save changes to the server'));
        setApiAvailable(false);
      }
    }
    push('info', t('aiConversation.deleted', 'Conversation deleted'));
    setPendingDelete(null);
  }, [pendingDelete, removeConversationLocal, currentId, conversations, apiAvailable, push, t]);

  const handleRenameConversation = useCallback(
    (id: string, newTitle: string) => {
      updateConversation(id, (c) => ({ ...c, title: newTitle }));
      if (apiAvailable) {
        api.ai.conversations
          .update(id, { title: newTitle })
          .catch((err) => {
            console.warn('Failed to rename on server', err);
            setApiAvailable(false);
            push('error', t('aiConversation.saveError', 'Could not save changes to the server'));
          });
      } else {
        push('info', t('aiConversation.renamed', 'Conversation renamed'));
      }
    },
    [apiAvailable, push, t, updateConversation]
  );

  const handleMessageCopy = useCallback(
    async (id: string, content: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(content);
        } else {
          const ta = document.createElement('textarea');
          ta.value = content;
          ta.style.position = 'absolute';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        push('success', t('aiConversation.copiedMessage', 'Copied to clipboard'));
        return true;
      } catch {
        push('error', t('aiConversation.failedCopy', 'Could not copy message'));
        return false;
      }
    },
    [push, t]
  );

  const handleMessageFeedback = useCallback(
    (messageId: string, value: 'up' | 'down' | null) => {
      if (!currentConversation) return;
      updateConversation(currentConversation.id, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === messageId ? { ...m, feedback: value || undefined } : m)),
      }));
      if (value === 'up') {
        push('success', t('aiCopilot.feedbackThanks', 'Thanks for the feedback!'));
      } else if (value === 'down') {
        push('success', t('aiCopilot.feedbackRecorded', 'Feedback recorded — we will learn from this.'));
      }
    },
    [currentConversation, updateConversation, push, t]
  );

  const handleMessageRegenerate = useCallback(
    (messageId: string) => {
      if (!currentConversation) return;
      const idx = currentConversation.messages.findIndex((m) => m.id === messageId);
      if (idx <= 0) return;
      const userMsg = currentConversation.messages[idx - 1];
      if (userMsg.role !== 'user') return;
      send(userMsg.content, { regenerateOfMessageId: messageId });
    },
    [currentConversation, send]
  );

  const handleMessageEdit = useCallback(
    (messageId: string, newContent: string) => {
      if (!currentConversation) return;
      updateConversation(currentConversation.id, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === messageId ? { ...m, content: newContent } : m)),
      }));
      const idx = currentConversation.messages.findIndex((m) => m.id === messageId);
      if (idx <= 0) return;
      const next = currentConversation.messages
        .slice(0, idx)
        .map((m) => (m.id === messageId ? { ...m, content: newContent } : m));
      updateConversation(currentConversation.id, (c) => ({
        ...c,
        messages: next,
        updatedAt: new Date().toISOString(),
      }));
      const userMsg = next[idx - 1];
      if (userMsg?.role === 'user') {
        send(userMsg.content, { userMessageOverride: userMsg.content });
      }
    },
    [currentConversation, send, updateConversation]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const sidebarConversations: ConversationItem[] = useMemo(
    () =>
      conversations.map((c) => ({
        id: c.id,
        title: c.title || newConversationTitle,
        agentType: c.agentType,
        messageCount: c.messages.length,
        lastActivityAt: c.updatedAt,
        createdAt: c.createdAt,
        lastMessagePreview: c.messages[c.messages.length - 1]?.content.slice(0, 80) || null,
      })),
    [conversations, newConversationTitle]
  );

  const agentTypes = useMemo(
    () => allAgents.map((a) => ({ value: a.agent_type, label: a.name || a.agent_type })),
    [allAgents]
  );

  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && !messages[i].pending && !messages[i].error) {
        return messages[i];
      }
    }
    return null;
  }, [messages]);

  return (
    <div className="flex h-[calc(100vh-160px)] flex-col"><div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <Sparkles className="h-6 w-6 text-purple-500" aria-hidden="true" />
            {t('aiCopilot.title', 'AI Copilot')}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>{t('aiCopilot.subtitleLong', 'Ask questions about your pipeline, candidates, and evaluations.')}</span>
            {apiAvailable ? (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-success-500"
                title={t('aiCopilot.subtitle', 'Powered by GPT-4o · routed through the orchestrator')}
              >
                <Cloud className="h-3 w-3" aria-hidden="true" />
                {t('aiConversation.synced', 'Synced')}
              </span>
            ) : (
              <button
                type="button"
                onClick={loadConversations}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-warning-500"
                aria-label={t('aiConversation.loadError', 'Could not load conversations — showing local copy')}
              >
                <CloudOff className="h-3 w-3" aria-hidden="true" />
                {t('aiConversation.localMode', 'Local only · retry')}
              </button>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={newConversation}
            aria-label={t('aiConversation.newConversationAria', 'Start new conversation')}
          >
            {t('aiConversation.newConversation', 'New conversation')}
          </Button>
          <HelpButton tour={aiCopilotTour} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {showSidebar && (
          <ConversationSidebar
            conversations={sidebarConversations}
            activeId={currentId || null}
            loading={conversationsLoading}
            agentTypes={agentTypes}
            onSelect={handleSelectConversation}
            onNew={newConversation}
            onDelete={handleDeleteConversation}
            onRename={handleRenameConversation}
            className="hidden md:flex"
          />
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
              <button
                type="button"
                onClick={loadConversations}
                aria-label={t('aiConversation.refreshAria', 'Refresh conversations')}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
              >
                <RefreshIcon className="h-3 w-3" aria-hidden="true" />
              </button>
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

            {messages.map((m) => {
              const bubbleProps: MessageBubbleProps = {
                id: m.id,
                role: m.role,
                content: m.content,
                agentName: m.agentName,
                agentType: m.agentType,
                confidence: m.confidence,
                reasoning: m.reasoning,
                feedback: m.feedback,
                pending: m.pending,
                streaming: m.streaming,
                error: m.error,
                timestamp: m.timestamp,
                showRegenerate:
                  m.role === 'assistant' && lastAssistant?.id === m.id && (currentConversation?.messages.length || 0) > 1,
                onCopy: handleMessageCopy,
                onRegenerate: handleMessageRegenerate,
                onEdit: handleMessageEdit,
                onFeedback: handleMessageFeedback,
              };
              return <MessageBubble key={m.id} {...bubbleProps} />;
            })}
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

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={t('aiConversation.deleteConfirm.title', 'Delete this conversation?')}
        description={t(
          'aiConversation.deleteConfirm.description',
          'All messages in this conversation will be removed. This action cannot be undone.'
        )}
        confirmLabel={t('aiConversation.deleteConfirm.confirm', 'Delete conversation')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        destructive
      />

      {conversations.length > 0 && !apiAvailable && (
        <p
          className="mt-2 inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-warning-500"
          role="status"
        >
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {t('aiConversation.loadError', 'Could not load conversations — showing local copy')}
        </p>
      )}

      <span className="sr-only" aria-live="polite">
        {currentConversation
          ? `${currentConversation.title} · ${currentConversation.messages.length} ${formatRelativeTime(currentConversation.updatedAt, locale)}`
          : ''}
      </span>
    </div>
  );
}
