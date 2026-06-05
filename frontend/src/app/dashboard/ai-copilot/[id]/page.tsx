'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Sparkles,
  Bot,
  User as UserIcon,
  RefreshCw,
  Download,
  Copy,
  Check,
  AlertCircle,
  FileText,
  Code as CodeIcon,
  Clock,
  Hash,
  Cpu,
  Activity,
  ChevronRight,
  RotateCcw,
  Send,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  ErrorState,
  Breadcrumb,
  useToast,
} from '@/components';
import { useLocaleStore, translate, formatDate, formatRelativeTime } from '@/stores/locale-store';

function formatCodeBlocks(text: string): React.ReactNode[] {
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
      <pre
        key={key++}
        className="my-2 p-2.5 bg-gray-900 text-green-300 font-mono text-xs rounded overflow-x-auto"
        aria-label={match[1] ? `${match[1]} code` : 'Code block'}
      >
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

function extractMessagesFromTask(task: any, taskResult: any): Array<{
  role: 'user' | 'assistant';
  content: string;
  agentName?: string;
  agentType?: string;
  confidence?: number;
  reasoning?: any[];
  timestamp: string;
}> {
  const messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    agentName?: string;
    agentType?: string;
    confidence?: number;
    reasoning?: any[];
    timestamp: string;
  }> = [];

  const payload = task?.payload || {};
  const inputField = payload.input;
  const query =
    (typeof inputField === 'string' ? inputField : null) ||
    (inputField && typeof inputField === 'object' ? inputField.query || inputField.task : null) ||
    payload.task ||
    payload.query ||
    '';

  const result = taskResult?.result || task?.result || {};
  const agentName = taskResult?.agent_name || task?.agent_name;
  const agentType = taskResult?.agent_type || task?.type || payload.agent_type;
  const confidence = typeof taskResult?.confidence_score === 'number' ? taskResult.confidence_score : undefined;
  const reasoning = Array.isArray(taskResult?.reasoning_chain) ? taskResult.reasoning_chain : undefined;

  let assistantContent = '';
  if (typeof result === 'string') {
    assistantContent = result;
  } else {
    const lines: string[] = [];
    const pipelineSummary = result.pipeline_summary;
    const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
    const drafts = Array.isArray(result.email_drafts) ? result.email_drafts : [];

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
    if (lines.length === 0) {
      try {
        assistantContent = JSON.stringify(result, null, 2);
      } catch {
        assistantContent = 'I have processed your request.';
      }
    } else {
      assistantContent = lines.join('\n');
    }
  }

  if (query) {
    messages.push({
      role: 'user',
      content: query,
      timestamp: task?.created_at || new Date().toISOString(),
    });
  }

  if (assistantContent) {
    messages.push({
      role: 'assistant',
      content: assistantContent,
      agentName,
      agentType,
      confidence,
      reasoning,
      timestamp: task?.completed_at || task?.started_at || new Date().toISOString(),
    });
  }

  return messages;
}

function buildMarkdownExport(task: any, taskResult: any, messages: any[]): string {
  const lines: string[] = [];
  lines.push(`# AI Copilot conversation`);
  lines.push('');
  lines.push(`**Conversation ID:** \`${task?.id || 'unknown'}\``);
  if (task?.type) lines.push(`**Type:** \`${task.type}\``);
  if (task?.status) lines.push(`**Status:** ${task.status}`);
  if (task?.priority) lines.push(`**Priority:** ${task.priority}`);
  if (task?.created_at) lines.push(`**Created:** ${task.created_at}`);
  if (task?.completed_at) lines.push(`**Completed:** ${task.completed_at}`);
  if (typeof taskResult?.elapsed_ms === 'number') {
    lines.push(`**Elapsed:** ${taskResult.elapsed_ms}ms`);
  }
  if (Array.isArray(taskResult?.agents_used) && taskResult.agents_used.length > 0) {
    lines.push(`**Agents used:** ${taskResult.agents_used.join(', ')}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  for (const m of messages) {
    if (m.role === 'user') {
      lines.push('## User');
      lines.push('');
      lines.push(m.content);
      lines.push('');
    } else {
      lines.push(`## Assistant${m.agentName ? ` — ${m.agentName}` : ''}`);
      if (m.agentType) lines.push(`*Agent type: \`${m.agentType}\`*`);
      if (typeof m.confidence === 'number') lines.push(`*Confidence: ${Math.round(m.confidence * 100)}%*`);
      lines.push('');
      lines.push(m.content);
      lines.push('');
    }
  }
  return lines.join('\n');
}

export default function AICopilotConversationDetailPage({ params }: { params: { id: string } }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [task, setTask] = useState<any | null>(null);
  const [taskResult, setTaskResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rerunLoading, setRerunLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { push, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const t1: any = await api.ai.getTask(params.id);
      const taskData = t1?.data || t1;
      if (!taskData || !taskData.id) {
        setNotFound(true);
        setTask(null);
        return;
      }
      setTask(taskData);

      try {
        const t2: any = await api.ai.getTaskResult(params.id);
        const resultData = t2?.data || t2;
        setTaskResult(resultData && Object.keys(resultData).length > 0 ? resultData : null);
      } catch {
        setTaskResult(null);
      }
    } catch (err) {
      const e = err as APIError;
      if (e?.status === 404) {
        setNotFound(true);
        setTask(null);
      } else {
        setError(e?.message || t('aiCopilotDetail.couldntLoad', "Couldn't load conversation"));
        setTask(null);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [task, taskResult]);

  const messages = useMemo(
    () => extractMessagesFromTask(task, taskResult),
    [task, taskResult]
  );

  const conversationTitle = useMemo(() => {
    const userMsg = messages.find((m) => m.role === 'user');
    const content = userMsg?.content || task?.type || '';
    const trimmed = content.trim();
    if (!trimmed) return t('aiCopilotDetail.untitled', 'Untitled conversation');
    return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  }, [messages, task, t]);

  const agentName = useMemo(() => {
    const a = messages.find((m) => m.role === 'assistant');
    return a?.agentName || task?.type || t('aiCopilotDetail.defaultAgent', 'AI Copilot');
  }, [messages, task, t]);

  const agentType = useMemo(() => {
    const a = messages.find((m) => m.role === 'assistant');
    return a?.agentType || task?.type || null;
  }, [messages, task]);

  const userMessage = useMemo(() => messages.find((m) => m.role === 'user'), [messages]);

  const handleRerun = async () => {
    if (!userMessage?.content) {
      push('info', t('aiCopilotDetail.noRerun', 'No original query to re-run.'));
      return;
    }
    setRerunLoading(true);
    try {
      const payload = {
        agent_type: agentType || task?.type || 'recruiting_copilot',
        input: { query: userMessage.content, task: userMessage.content },
        context: { source: 'conversation_detail_rerun', original_task_id: task?.id, query: userMessage.content },
      };
      const r: any = await api.ai.orchestrate(payload);
      const result = r?.data || r;
      setTaskResult((prev: any) => ({ ...(prev || {}), ...result, agents_used: result?.agents_used || prev?.agents_used }));
      if (result?.agent_name) {
        setTask((prev: any) => ({ ...(prev || {}), agent_name: result.agent_name }));
      }
      push('success', t('aiCopilotDetail.rerunSuccess', 'Conversation re-run completed'));
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('aiCopilotDetail.rerunFailed', 'Re-run failed'));
    } finally {
      setRerunLoading(false);
    }
  };

  const handleExport = () => {
    if (typeof window === 'undefined' || messages.length === 0) return;
    const md = buildMarkdownExport(task, taskResult, messages);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-copilot-${task?.id?.slice(0, 8) || params.id.slice(0, 8)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    push('success', t('aiCopilotDetail.exported', 'Exported as markdown'));
  };

  const handleCopy = async () => {
    if (typeof window === 'undefined' || messages.length === 0) return;
    const md = buildMarkdownExport(task, taskResult, messages);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(md);
      } else {
        const ta = document.createElement('textarea');
        ta.value = md;
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      push('success', t('aiCopilotDetail.copied', 'Copied to clipboard'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      push('error', t('aiCopilotDetail.copyFailed', 'Could not copy'));
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <ToastContainer />
        <Skeleton height={20} width={200} />
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-5">
              <Skeleton variant="rounded" width={64} height={64} />
              <div className="flex-1 space-y-3">
                <Skeleton height={28} width="60%" />
                <Skeleton height={16} width="40%" />
                <div className="flex gap-2">
                  <Skeleton height={24} width={80} />
                  <Skeleton height={24} width={120} />
                </div>
              </div>
              <div className="space-y-2 w-full sm:w-44">
                <Skeleton height={36} />
                <Skeleton height={36} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Skeleton height={420} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Breadcrumb />
        <Link
          href="/dashboard/ai-copilot"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          aria-label={t('aiCopilotDetail.backToCopilot', 'Back to AI Copilot')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('aiCopilotDetail.backToCopilot', 'Back to AI Copilot')}
        </Link>
        <EmptyState
          icon={<Sparkles className="h-12 w-12" />}
          title={t('aiCopilotDetail.notFound', 'Conversation not found')}
          description={t('aiCopilotDetail.notFoundDesc', "The conversation you're looking for doesn't exist or has been removed.")}
          action={
            <Link href="/dashboard/ai-copilot">
              <Button variant="primary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                {t('aiCopilotDetail.backToCopilot', 'Back to AI Copilot')}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (error && !task) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Breadcrumb />
        <Link
          href="/dashboard/ai-copilot"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          aria-label={t('aiCopilotDetail.backToCopilot', 'Back to AI Copilot')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('aiCopilotDetail.backToCopilot', 'Back to AI Copilot')}
        </Link>
        <Card>
          <CardContent className="p-0">
            <ErrorState
              title={t('aiCopilotDetail.couldntLoad', "Couldn't load conversation")}
              description={error}
              onRetry={load}
              retryLabel={t('common.retry', 'Retry')}
              fullHeight
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!task) return null;

  const status = (task.status || 'unknown').toLowerCase();
  const elapsedMs = typeof taskResult?.elapsed_ms === 'number' ? taskResult.elapsed_ms : null;
  const agentsUsed = Array.isArray(taskResult?.agents_used) ? taskResult.agents_used : [];

  return (
    <div className="space-y-6">
      <ToastContainer />

      <Breadcrumb />

      <Link
        href="/dashboard/ai-copilot"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        aria-label={t('aiCopilotDetail.backToCopilot', 'Back to AI Copilot')}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('aiCopilotDetail.backToCopilot', 'Back to AI Copilot')}
      </Link>

      <Card>
        <CardContent className="p-6">
          <header className="flex flex-col lg:flex-row gap-5 items-start lg:items-center">
            <div
              className="h-16 w-16 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 ring-4 ring-blue-100 dark:ring-blue-500/20"
              aria-hidden="true"
            >
              <Sparkles className="h-7 w-7" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words">
                {conversationTitle}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="font-mono text-xs">{task.id?.slice(0, 12)}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                  {agentName}
                </span>
                {task.created_at && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <time dateTime={task.created_at}>
                      {formatRelativeTime(task.created_at, locale)}
                    </time>
                  </span>
                )}
                {elapsedMs !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                    {elapsedMs}ms
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    status === 'completed'
                      ? 'success'
                      : status === 'running' || status === 'in_progress'
                        ? 'warning'
                        : status === 'failed'
                          ? 'danger'
                          : 'default'
                  }
                  dot
                >
                  {status}
                </Badge>
                {agentType && (
                  <Badge variant="purple" size="sm">
                    <Cpu className="h-3 w-3 mr-0.5" aria-hidden="true" />
                    {agentType}
                  </Badge>
                )}
                {task.priority && (
                  <Badge variant="outline" size="sm">
                    {task.priority}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 w-full lg:w-auto lg:flex-col lg:items-stretch">
              <Button
                variant="primary"
                size="sm"
                leftIcon={rerunLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                onClick={handleRerun}
                loading={rerunLoading}
                disabled={!userMessage?.content}
                aria-label={t('aiCopilotDetail.rerun', 'Re-run conversation')}
              >
                {t('aiCopilotDetail.rerun', 'Re-run')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Download className="h-4 w-4" />}
                onClick={handleExport}
                disabled={messages.length === 0}
                aria-label={t('aiCopilotDetail.export', 'Export as markdown')}
              >
                {t('aiCopilotDetail.export', 'Export')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                onClick={handleCopy}
                disabled={messages.length === 0}
                aria-label={t('aiCopilotDetail.copyMd', 'Copy as markdown')}
              >
                {copied ? t('aiCopilotDetail.copied', 'Copied!') : t('aiCopilotDetail.copy', 'Copy')}
              </Button>
            </div>
          </header>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <section aria-labelledby="messages-section-title">
            <Card>
              <CardContent className="p-0">
                <div className="border-b border-gray-200 dark:border-surface-700 px-4 sm:px-5 py-3 bg-gray-50/50 dark:bg-surface-800/50">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2
                      id="messages-section-title"
                      className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      {t('aiCopilotDetail.messages', 'Message history')}
                    </h2>
                    <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                      {messages.length} {t('aiCopilotDetail.messageCount', 'messages')}
                    </span>
                  </div>
                </div>
                {messages.length === 0 ? (
                  <div className="p-8 text-center">
                    <AlertCircle className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto" aria-hidden="true" />
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                      {t('aiCopilotDetail.emptyMessages', 'No messages found for this conversation.')}
                    </p>
                  </div>
                ) : (
                  <div
                    className="p-4 sm:p-5 space-y-4 max-h-[640px] overflow-y-auto"
                    role="log"
                    aria-live="polite"
                    aria-label={t('aiCopilotDetail.conversationAria', 'Conversation messages')}
                  >
                    {messages.map((m, i) => (
                      <article
                        key={i}
                        className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {m.role === 'assistant' && (
                          <div
                            className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0"
                            aria-hidden="true"
                          >
                            <Bot className="h-4 w-4 text-white" />
                          </div>
                        )}
                        <div className={`max-w-[85%] sm:max-w-[80%] ${m.role === 'user' ? 'order-2' : ''}`}>
                          {m.role === 'assistant' && (
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1.5 flex-wrap">
                              <span>{m.agentName || agentName}</span>
                              {m.agentType && <Badge variant="default" size="sm">{m.agentType}</Badge>}
                              {typeof m.confidence === 'number' && (
                                <span className="text-gray-300 dark:text-gray-500 normal-case font-normal">
                                  {Math.round(m.confidence * 100)}%
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
                            {m.role === 'assistant' ? (
                              <div className="prose-sm">{renderMarkdown(m.content)}</div>
                            ) : (
                              m.content
                            )}
                          </div>
                          {m.role === 'assistant' && m.reasoning && m.reasoning.length > 0 && (
                            <details className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                              <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                                {t('aiCopilotDetail.reasoning', 'Show reasoning')}
                              </summary>
                              <ol className="mt-2 space-y-1 list-decimal list-inside">
                                {m.reasoning.map((r, idx) => (
                                  <li key={idx}>{typeof r === 'string' ? r : JSON.stringify(r)}</li>
                                ))}
                              </ol>
                            </details>
                          )}
                        </div>
                        {m.role === 'user' && (
                          <div
                            className="h-8 w-8 rounded-lg bg-gray-200 dark:bg-surface-800 flex items-center justify-center shrink-0 order-3"
                            aria-hidden="true"
                          >
                            <UserIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                          </div>
                        )}
                      </article>
                    ))}
                    <div ref={endRef} />
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="agent-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Bot className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2
                    id="agent-section-title"
                    className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    {t('aiCopilotDetail.agent', 'Agent')}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <Bot className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {agentName}
                    </p>
                    {agentType && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
                        {agentType}
                      </p>
                    )}
                  </div>
                </div>
                {agentsUsed.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-surface-700">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                      {t('aiCopilotDetail.agentsUsed', 'Agents used')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {agentsUsed.map((a: string) => (
                        <span
                          key={a}
                          className="px-2 py-0.5 rounded-md text-xs bg-purple-50 text-purple-700 font-medium border border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardContent className="p-6 space-y-3 text-sm">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 uppercase text-xs font-bold tracking-wider">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                {t('aiCopilotDetail.metadata', 'Metadata')}
              </div>
              {task.created_at && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 dark:text-gray-400">{t('aiCopilotDetail.created', 'Created')}</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">
                    {formatDate(task.created_at, locale, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
              )}
              {task.started_at && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 dark:text-gray-400">{t('aiCopilotDetail.started', 'Started')}</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">
                    {formatDate(task.started_at, locale, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
              )}
              {task.completed_at && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 dark:text-gray-400">{t('aiCopilotDetail.completed', 'Completed')}</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">
                    {formatDate(task.completed_at, locale, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
              )}
              {elapsedMs !== null && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 dark:text-gray-400">{t('aiCopilotDetail.elapsed', 'Elapsed')}</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right tabular-nums">
                    {elapsedMs}ms
                  </span>
                </div>
              )}
              {task.priority && (
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 dark:text-gray-400">{t('aiCopilotDetail.priority', 'Priority')}</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right capitalize">
                    {task.priority}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
