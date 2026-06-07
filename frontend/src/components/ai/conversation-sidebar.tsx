'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Edit3,
  Check,
  X as XIcon,
  MoreVertical,
  Bot,
  Filter,
} from 'lucide-react';
import { useLocaleStore, translate, formatRelativeTime } from '@/stores/locale-store';
import { useClickOutside } from '@/hooks';
import { cn } from '@/lib/utils';

export interface ConversationItem {
  id: string;
  title: string;
  agentType?: string;
  messageCount?: number;
  lastActivityAt: string;
  createdAt: string;
  lastMessagePreview?: string | null;
}

export interface ConversationSidebarProps {
  conversations: ConversationItem[];
  activeId: string | null;
  loading?: boolean;
  agentTypes?: Array<{ value: string; label: string }>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  className?: string;
  emptyState?: React.ReactNode;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  conversationId: string | null;
}

export function ConversationSidebar({
  conversations,
  activeId,
  loading = false,
  agentTypes,
  onSelect,
  onNew,
  onDelete,
  onRename,
  className,
  emptyState,
}: ConversationSidebarProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fb?: string) => translate(locale, key, fb),
    [locale]
  );

  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    conversationId: null,
  });

  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => {
    setContextMenu((m) => ({ ...m, visible: false }));
  });
  useClickOutside(filterRef, () => {
    /* allow open while filter is interacted with */
  });

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (!contextMenu.visible) return;
    const onScroll = () => setContextMenu((m) => ({ ...m, visible: false }));
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [contextMenu.visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations
      .filter((c) => (agentFilter ? c.agentType === agentFilter : true))
      .filter(
        (c) =>
          !q ||
          c.title.toLowerCase().includes(q) ||
          (c.lastMessagePreview || '').toLowerCase().includes(q)
      )
      .sort(
        (a, b) =>
          new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
      );
  }, [conversations, search, agentFilter]);

  const startEditing = useCallback((c: ConversationItem) => {
    setEditingId(c.id);
    setEditingValue(c.title);
    setContextMenu((m) => ({ ...m, visible: false }));
  }, []);

  const commitEdit = useCallback(() => {
    if (editingId) {
      const trimmed = editingValue.trim();
      if (trimmed && trimmed.length > 0) {
        onRename(editingId, trimmed.slice(0, 120));
      }
      setEditingId(null);
      setEditingValue('');
    }
  }, [editingId, editingValue, onRename]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingValue('');
  }, []);

  const openContextMenu = useCallback(
    (e: React.MouseEvent, conversationId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const x = Math.min(e.clientX, window.innerWidth - 200);
      const y = Math.min(e.clientY, window.innerHeight - 120);
      setContextMenu({ visible: true, x, y, conversationId });
    },
    []
  );

  const handleContextAction = useCallback(
    (action: 'rename' | 'delete') => {
      if (!contextMenu.conversationId) return;
      if (action === 'rename') {
        const c = conversations.find((cc) => cc.id === contextMenu.conversationId);
        if (c) startEditing(c);
      } else if (action === 'delete') {
        onDelete(contextMenu.conversationId);
      }
      setContextMenu({ visible: false, x: 0, y: 0, conversationId: null });
    },
    [contextMenu, conversations, onDelete, startEditing]
  );

  const onKeyDownEdit = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit]
  );

  return (
    <aside
      className={cn(
        'flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900',
        className
      )}
      aria-label={t('aiCopilot.sidebarAria', 'Conversations sidebar')}
    >
      <div className="border-b border-gray-200 p-3 dark:border-surface-700">
        <button
          type="button"
          onClick={onNew}
          className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-brand-500 dark:hover:bg-brand-400"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t('aiCopilot.newConversation', 'New conversation')}
        </button>

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

        {agentTypes && agentTypes.length > 0 && (
          <div className="relative mt-2" ref={filterRef}>
            <label className="sr-only" htmlFor="agent-filter">
              {t('aiConversation.filterByAgent', 'Filter by agent')}
            </label>
            <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
              <Filter className="h-3 w-3" aria-hidden="true" />
            </div>
            <select
              id="agent-filter"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full appearance-none rounded-md border border-gray-200 bg-white py-1.5 pl-7 pr-7 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
            >
              <option value="">{t('aiConversation.allAgents', 'All agents')}</option>
              {agentTypes.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2" role="list">
        {loading ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-surface-800"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
            {conversations.length === 0
              ? emptyState || t('aiCopilot.noConversations', 'No conversations yet')
              : t('aiCopilot.noMatches', 'No conversations match your search')}
          </div>
        ) : (
          <ul className="space-y-1" role="list">
            {filtered.map((c) => {
              const isActive = c.id === activeId;
              const count = c.messageCount ?? 0;
              const isEditing = editingId === c.id;

              return (
                <li key={c.id} role="listitem">
                  {isEditing ? (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border px-2.5 py-2',
                        'border-blue-300 bg-blue-50 dark:border-brand-500/40 dark:bg-brand-500/10'
                      )}
                    >
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={onKeyDownEdit}
                        onBlur={commitEdit}
                        maxLength={120}
                        aria-label={t('aiConversation.renameAria', 'Rename conversation')}
                        className="flex-1 rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-900 dark:text-gray-100"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          commitEdit();
                        }}
                        className="rounded p-1 text-green-600 hover:bg-green-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 dark:hover:bg-success-500/20"
                        aria-label={t('aiConversation.saveRename', 'Save name')}
                      >
                        <Check className="h-3 w-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          cancelEdit();
                        }}
                        className="rounded p-1 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 dark:hover:bg-surface-700"
                        aria-label={t('aiConversation.cancelRename', 'Cancel rename')}
                      >
                        <XIcon className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelect(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect(c.id);
                        }
                      }}
                      onContextMenu={(e) => openContextMenu(e, c.id)}
                      aria-current={isActive ? 'true' : undefined}
                      className={cn(
                        'group flex w-full cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                        isActive
                          ? 'border-blue-200 bg-blue-50 dark:border-brand-500/30 dark:bg-brand-500/10'
                          : 'border-transparent hover:bg-gray-50 dark:hover:bg-surface-800'
                      )}
                    >
                      <MessageSquare
                        className={cn(
                          'mt-0.5 h-3.5 w-3.5 shrink-0',
                          isActive ? 'text-blue-600 dark:text-brand-400' : 'text-gray-400'
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'truncate text-xs font-medium',
                            isActive
                              ? 'text-blue-900 dark:text-brand-200'
                              : 'text-gray-900 dark:text-gray-100'
                          )}
                          title={c.title}
                        >
                          {c.title}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                          {c.agentType && (
                            <>
                              <Bot className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{c.agentType}</span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span>{formatRelativeTime(c.lastActivityAt, locale)}</span>
                          {count > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                {count}{' '}
                                {count === 1
                                  ? t('aiCopilot.messageSingular', 'message')
                                  : t('aiCopilot.messagePlural', 'messages')}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openContextMenu(e, c.id);
                        }}
                        className="rounded p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-surface-700 dark:hover:text-gray-200"
                        aria-label={t('aiConversation.moreActions', 'More actions')}
                      >
                        <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {contextMenu.visible && (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handleContextAction('rename')}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:text-gray-200 dark:hover:bg-surface-700 dark:focus:bg-surface-700"
          >
            <Edit3 className="h-3 w-3" aria-hidden="true" />
            {t('aiConversation.rename', 'Rename')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleContextAction('delete')}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none dark:text-danger-500 dark:hover:bg-danger-500/10 dark:focus:bg-danger-500/10"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            {t('common.delete', 'Delete')}
          </button>
        </div>
      )}
    </aside>
  );
}

export default ConversationSidebar;
