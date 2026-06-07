'use client';

import { useState, useCallback } from 'react';
import {
  Bot,
  User as UserIcon,
  Copy as CopyIcon,
  Check as CheckIcon,
  RefreshCw,
  Edit3,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
} from 'lucide-react';
import { Markdown, Badge } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';

export interface MessageBubbleProps {
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
  timestamp?: string;
  showRegenerate?: boolean;
  onCopy?: (id: string, content: string) => Promise<boolean> | boolean;
  onRegenerate?: (id: string) => void;
  onEdit?: (id: string, content: string) => void;
  onFeedback?: (id: string, value: 'up' | 'down' | null) => void;
  className?: string;
}

function formatBubbleTimestamp(iso: string | undefined, locale: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const bcp = locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : 'en-US';
    return new Intl.DateTimeFormat(bcp, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}

export function MessageBubble({
  id,
  role,
  content,
  agentName,
  agentType,
  confidence,
  reasoning,
  feedback,
  pending = false,
  streaming = false,
  error = false,
  timestamp,
  showRegenerate = false,
  onCopy,
  onRegenerate,
  onEdit,
  onFeedback,
  className,
}: MessageBubbleProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fb?: string) => translate(locale, key, fb),
    [locale]
  );

  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        ok = true;
      } else {
        const ta = document.createElement('textarea');
        ta.value = content;
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (onCopy) {
      const result = await onCopy(id, content);
      if (typeof result === 'boolean') ok = result;
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [content, id, onCopy]);

  const handleEditSave = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || !onEdit) {
      setEditing(false);
      setDraft(content);
      return;
    }
    onEdit(id, trimmed);
    setEditing(false);
  }, [draft, id, content, onEdit]);

  const handleEditKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleEditSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditing(false);
        setDraft(content);
      }
    },
    [handleEditSave, content]
  );

  const isUser = role === 'user';

  return (
    <article
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} ${className || ''}`}
      data-role={role}
      data-message-id={id}
    >
      {!isUser && (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600"
          aria-hidden="true"
        >
          <Bot className="h-4 w-4 text-white" />
        </div>
      )}

      <div className={`max-w-[85%] sm:max-w-[80%] ${isUser ? 'order-2' : ''}`}>
        {!isUser && agentName && !pending && (
          <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            <span>{agentName}</span>
            {agentType && (
              <Badge variant="default" size="sm">
                {agentType}
              </Badge>
            )}
            {typeof confidence === 'number' && (
              <span className="font-normal normal-case text-gray-300 dark:text-gray-500">
                {t('aiCopilot.confidence', 'confidence')} {Math.round(confidence * 100)}%
              </span>
            )}
          </p>
        )}

        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            isUser
              ? 'whitespace-pre-wrap bg-blue-600 text-white'
              : error
                ? 'border border-red-200 bg-red-50 text-red-900 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-red-200'
                : 'border border-gray-200 bg-gray-50 text-gray-900 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100'
          }`}
        >
          {pending ? (
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
          ) : editing && isUser ? (
            <div>
              <label htmlFor={`edit-${id}`} className="sr-only">
                {t('aiConversation.editMessage', 'Edit message')}
              </label>
              <textarea
                id={`edit-${id}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleEditKey}
                rows={Math.max(2, Math.min(8, draft.split('\n').length))}
                className="w-full resize-none rounded-md border border-white/30 bg-white/10 px-2 py-1.5 text-sm text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/40"
                autoFocus
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft(content);
                  }}
                  className="rounded px-2 py-1 text-[10px] font-medium text-white/80 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleEditSave}
                  className="rounded bg-white px-2 py-1 text-[10px] font-semibold text-blue-600 hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  {t('aiConversation.saveAndResend', 'Save & resend')}
                </button>
              </div>
            </div>
          ) : isUser ? (
            content
          ) : (
            <>
              <Markdown>{content}</Markdown>
              {streaming && content.length > 0 && (
                <span
                  className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-blue-500"
                  aria-hidden="true"
                />
              )}
            </>
          )}
        </div>

        {timestamp && !pending && (
          <p
            className={`mt-1 text-[10px] text-gray-400 dark:text-gray-500 ${
              isUser ? 'text-right' : 'text-left'
            }`}
            aria-label={t('aiConversation.timestamp', 'Sent at {time}').replace(
              '{time}',
              formatBubbleTimestamp(timestamp, locale)
            )}
          >
            {formatBubbleTimestamp(timestamp, locale)}
          </p>
        )}

        {error && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            {t('aiCopilot.error', 'AI service error')}
          </p>
        )}

        {!pending && !error && (
          <div
            className={`mt-1.5 flex items-center gap-1 ${
              isUser ? 'justify-end' : 'justify-start'
            }`}
          >
            <button
              type="button"
              onClick={handleCopy}
              disabled={!content}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-surface-700 dark:hover:text-white"
              aria-label={
                copied
                  ? t('aiCopilot.copiedAria', 'Copied')
                  : t('aiCopilot.copyAria', 'Copy message')
              }
            >
              {copied ? (
                <CheckIcon className="h-3 w-3" aria-hidden="true" />
              ) : (
                <CopyIcon className="h-3 w-3" aria-hidden="true" />
              )}
              {copied ? t('aiCopilot.copied', 'Copied') : t('aiCopilot.copy', 'Copy')}
            </button>

            {isUser && onEdit && (
              <button
                type="button"
                onClick={() => {
                  setDraft(content);
                  setEditing(true);
                }}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-surface-700 dark:hover:text-white"
                aria-label={t('aiConversation.editAria', 'Edit message')}
              >
                <Edit3 className="h-3 w-3" aria-hidden="true" />
                {t('common.edit', 'Edit')}
              </button>
            )}

            {!isUser && showRegenerate && onRegenerate && (
              <button
                type="button"
                onClick={() => onRegenerate(id)}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-surface-700 dark:hover:text-white"
                aria-label={t('aiCopilot.regenerateAria', 'Regenerate response')}
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                {t('aiCopilot.regenerate', 'Regenerate')}
              </button>
            )}

            {!isUser && onFeedback && (
              <div
                className={`flex items-center gap-0.5 ${isUser ? '' : 'ml-auto'}`}
                role="group"
                aria-label={t('aiCopilot.feedbackAria', 'Rate response')}
              >
                <button
                  type="button"
                  onClick={() => onFeedback(id, feedback === 'up' ? null : 'up')}
                  aria-pressed={feedback === 'up'}
                  aria-label={t('aiCopilot.thumbUpAria', 'Thumbs up')}
                  className={`rounded p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    feedback === 'up'
                      ? 'bg-green-100 text-green-700 dark:bg-success-500/20 dark:text-success-500'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-surface-700 dark:hover:text-gray-200'
                  }`}
                >
                  <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onFeedback(id, feedback === 'down' ? null : 'down')}
                  aria-pressed={feedback === 'down'}
                  aria-label={t('aiCopilot.thumbDownAria', 'Thumbs down')}
                  className={`rounded p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    feedback === 'down'
                      ? 'bg-red-100 text-red-700 dark:bg-danger-500/20 dark:text-danger-500'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-surface-700 dark:hover:text-gray-200'
                  }`}
                >
                  <ThumbsDown className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}

        {!isUser && reasoning && reasoning.length > 0 && !pending && (
          <details className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            <summary className="cursor-pointer rounded font-medium hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-gray-200">
              {t('aiCopilot.reasoning', 'Show reasoning')}
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {reasoning.map((r, i) => (
                <li key={i}>{typeof r === 'string' ? r : JSON.stringify(r)}</li>
              ))}
            </ol>
          </details>
        )}
      </div>

      {isUser && (
        <div
          className="order-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-200 dark:bg-surface-800"
          aria-hidden="true"
        >
          <UserIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </div>
      )}
    </article>
  );
}

export default MessageBubble;
