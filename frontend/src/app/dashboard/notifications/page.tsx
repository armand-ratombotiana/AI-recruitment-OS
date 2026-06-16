'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ComponentType,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AtSign,
  Bell,
  Briefcase,
  Calendar,
  Check,
  CheckCheck,
  ChevronDown,
  Filter,
  Inbox,
  MessageSquare,
  RefreshCw,
  Search as SearchIcon,
  Settings,
  Trash2,
  Users,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { api } from '@/services/api/client';
import { getWebSocketClient } from '@/services/websocket/client';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  useToast,
} from '@/components';
import { useWebSocket } from '@/hooks';
import {
  useLocaleStore,
  translate,
  formatRelativeTime,
  type Locale,
} from '@/stores/locale-store';
import { cn } from '@/lib/utils';

type NotificationCategory = 'interview' | 'candidate' | 'job' | 'system' | 'mention';

type FilterKey = 'all' | 'unread' | 'mentions' | 'system';

type DateGroup = 'today' | 'yesterday' | 'thisWeek' | 'older';

interface UINotification {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  typeRaw: string;
  createdAt: string;
  read: boolean;
  link: string | null;
  isFresh?: boolean;
}

const CATEGORY_KEYWORDS: Record<NotificationCategory, RegExp> = {
  interview: /(interview|schedule|meeting|panel|onsite|phone screen|calendar)/i,
  candidate: /(candidate|applicant|resume|cv|new (?:profile|application)|talent)/i,
  job: /(job|role|position|requisition|hiring|opening|posting)/i,
  mention: /(mention|@|tagged|comment|message|reply)/i,
  system: /(system|security|alert|billing|workflow|automation|integration|update)/i,
};

const CATEGORY_ICON: Record<NotificationCategory, typeof Calendar> = {
  interview: Calendar,
  candidate: Users,
  job: Briefcase,
  system: Settings,
  mention: MessageSquare,
};

const CATEGORY_COLOR: Record<
  NotificationCategory,
  { ring: string; bg: string; text: string }
> = {
  interview: {
    ring: 'ring-purple-200 dark:ring-purple-500/30',
    bg: 'bg-purple-100 dark:bg-purple-500/20',
    text: 'text-purple-600 dark:text-purple-400',
  },
  candidate: {
    ring: 'ring-blue-200 dark:ring-blue-500/30',
    bg: 'bg-blue-100 dark:bg-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
  },
  job: {
    ring: 'ring-emerald-200 dark:ring-emerald-500/30',
    bg: 'bg-emerald-100 dark:bg-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  system: {
    ring: 'ring-amber-200 dark:ring-amber-500/30',
    bg: 'bg-amber-100 dark:bg-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
  },
  mention: {
    ring: 'ring-pink-200 dark:ring-pink-500/30',
    bg: 'bg-pink-100 dark:bg-pink-500/20',
    text: 'text-pink-600 dark:text-pink-400',
  },
};

function detectCategory(item: {
  type?: string;
  title?: string;
  body?: string;
}): NotificationCategory {
  const haystack = `${item.type || ''} ${item.title || ''} ${item.body || ''}`.toLowerCase();
  for (const key of ['interview', 'candidate', 'job', 'mention', 'system'] as NotificationCategory[]) {
    if (CATEGORY_KEYWORDS[key].test(haystack)) return key;
  }
  return 'system';
}

function mapNotification(raw: any): UINotification {
  const createdAt = raw.created_at || raw.timestamp || raw.createdAt || '';
  const body = raw.body || raw.message || '';
  return {
    id: String(raw.id),
    title: raw.title || 'Notification',
    body,
    category: detectCategory({ type: raw.type, title: raw.title, body }),
    typeRaw: raw.type || '',
    createdAt,
    read: !!raw.read,
    link: raw.link || null,
  };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function bucketDate(iso: string, now: Date = new Date()): DateGroup {
  if (!iso) return 'older';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'older';
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const itemDay = startOfDay(d);
  if (itemDay.getTime() === today.getTime()) return 'today';
  if (itemDay.getTime() === yesterday.getTime()) return 'yesterday';
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  if (itemDay.getTime() > weekAgo.getTime()) return 'thisWeek';
  return 'older';
}

function dateBucketComparator(a: DateGroup, b: DateGroup): number {
  const order: Record<DateGroup, number> = {
    today: 0,
    yesterday: 1,
    thisWeek: 2,
    older: 3,
  };
  return order[a] - order[b];
}

function sortByDateDesc(a: UINotification, b: UINotification): number {
  const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return bt - at;
}

export default function NotificationsPage() {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fallback?: string) => translate(locale, `notifications.${key}`, fallback),
    [locale]
  );
  const pageT = useCallback(
    (key: string, fallback?: string) =>
      translate(locale, `notifications.page.${key}`, fallback),
    [locale]
  );
  const commonT = useCallback(
    (key: string, fallback?: string) => translate(locale, `common.${key}`, fallback),
    [locale]
  );
  const { push } = useToast();

  const [notifications, setNotifications] = useState<UINotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Real-time updates via WebSocket — this hook manages the connection refcount
  const { isConnected, isReconnecting, subscribe } = useWebSocket<Record<string, unknown>>({
    autoConnect: true,
  });

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const res = await api.notifications.list({ page_size: '200' });
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setNotifications(list.map((raw: any) => mapNotification(raw)));
      } catch (err: any) {
        setError(err?.message || pageT('error.title', "Couldn't load notifications"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [pageT]
  );

  useEffect(() => {
    load('initial');
  }, [load]);

  // Subscribe to real-time notification events
  useEffect(() => {
    const handleNew = (data: Record<string, unknown>) => {
      if (!data) return;
      const payload =
        (data.notification as Record<string, unknown>) ||
        (data.payload as Record<string, unknown>) ||
        data;
      if (!payload || !payload.id) return;
      const incoming: UINotification = { ...mapNotification(payload), isFresh: true };
      setNotifications((prev) => {
        const next = prev.filter((n) => n.id !== incoming.id);
        return [incoming, ...next];
      });
      if (!incoming.read) {
        push('info', incoming.title || t('page.newItem', 'New notification'));
      }
    };
    const handleUpdate = (data: Record<string, unknown>) => {
      if (!data) return;
      const payload =
        (data.notification as Record<string, unknown>) ||
        (data.payload as Record<string, unknown>) ||
        data;
      const id = payload.id ? String(payload.id) : null;
      if (!id) return;
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...mapNotification(payload) } : n))
      );
    };
    const handleDelete = (data: Record<string, unknown>) => {
      if (!data) return;
      const id = data.id ? String(data.id) : null;
      if (!id) return;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    };

    const u1 = subscribe('notification', handleNew);
    const u2 = subscribe('notification.updated', handleUpdate);
    const u3 = subscribe('notification.deleted', handleDelete);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [subscribe, push, t]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );
  const readCount = notifications.length - unreadCount;

  const counts = useMemo(() => {
    const acc: Record<FilterKey, number> = {
      all: notifications.length,
      unread: unreadCount,
      mentions: 0,
      system: 0,
    };
    for (const n of notifications) {
      if (n.category === 'mention') acc.mentions += 1;
      else if (n.category === 'system') acc.system += 1;
    }
    return acc;
  }, [notifications, unreadCount]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((n) => {
      if (filter === 'unread' && n.read) return false;
      if (filter === 'mentions' && n.category !== 'mention') return false;
      if (filter === 'system' && n.category !== 'system') return false;
      if (q) {
        const haystack = `${n.title} ${n.body} ${n.typeRaw}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [notifications, filter, search]);

  const grouped = useMemo(() => {
    const buckets: Record<DateGroup, UINotification[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };
    const sorted = [...filtered].sort(sortByDateDesc);
    for (const n of sorted) {
      const b = bucketDate(n.createdAt);
      buckets[b].push(n);
    }
    return (['today', 'yesterday', 'thisWeek', 'older'] as DateGroup[])
      .map((g) => ({ key: g, items: buckets[g] }))
      .filter((g) => g.items.length > 0)
      .sort((a, b) => dateBucketComparator(a.key, b.key));
  }, [filtered]);

  const visibleIds = useMemo(() => filtered.map((n) => n.id), [filtered]);
  const allVisibleSelected = useMemo(
    () => visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id)),
    [visibleIds, selectedIds]
  );

  const handleItemClick = useCallback(
    async (n: UINotification) => {
      if (!n.read) {
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
        );
        try {
          await api.notifications.markRead(n.id);
        } catch {
          /* ignore */
        }
      }
      if (n.link) {
        try {
          router.push(n.link);
        } catch {
          /* ignore */
        }
      }
    },
    [router]
  );

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  }, [allVisibleSelected, visibleIds]);

  const handleClearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleMarkAllRead = useCallback(async () => {
    if (unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await api.notifications.markAllRead();
      push('success', t('markAllRead', 'Mark all read'));
    } catch (err: any) {
      push('error', err?.message || t('markAllRead', 'Mark all read'));
      load('refresh');
    }
  }, [unreadCount, t, push, load]);

  const handleClearRead = useCallback(() => {
    if (readCount === 0) return;
    setNotifications((prev) => prev.filter((n) => !n.read));
    setSelectedIds(new Set());
    push('info', pageT('clearRead', 'Clear read'));
  }, [readCount, push, pageT]);

  const handleDeleteOne = useCallback(
    async (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      try {
        await api.notifications.delete(id);
        push(
          'success',
          pageT('bulk.deleted', 'Deleted {count} notification(s)').replace('{count}', '1')
        );
      } catch (err: any) {
        push(
          'error',
          err?.message || pageT('bulk.deleteFailed', 'Some notifications could not be deleted')
        );
        load('refresh');
      }
    },
    [push, pageT, load]
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    setNotifications((prev) => prev.filter((n) => !selectedIds.has(n.id)));
    setSelectedIds(new Set());
    let removed = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await api.notifications.delete(id);
        removed += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkDeleting(false);
    setConfirmBulkDelete(false);
    if (failed > 0) {
      push(
        'error',
        pageT('bulk.deleteFailed', 'Some notifications could not be deleted')
      );
      load('refresh');
    } else {
      push(
        'success',
        pageT('bulk.deleted', 'Deleted {count} notification(s)').replace(
          '{count}',
          String(removed)
        )
      );
    }
  }, [selectedIds, push, pageT, load]);

  const tabs: { key: FilterKey; label: string; icon: typeof Calendar }[] = [
    { key: 'all', label: pageT('filters.all', 'All'), icon: Inbox },
    { key: 'unread', label: pageT('filters.unread', 'Unread'), icon: Bell },
    { key: 'mentions', label: pageT('filters.mentions', 'Mentions'), icon: AtSign },
    { key: 'system', label: pageT('filters.system', 'System'), icon: Settings },
  ];

  const groupLabels: Record<DateGroup, string> = {
    today: pageT('groups.today', 'Today'),
    yesterday: pageT('groups.yesterday', 'Yesterday'),
    thisWeek: pageT('groups.thisWeek', 'This Week'),
    older: pageT('groups.older', 'Older'),
  };

  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;
  const realtimeLabel = isConnected
    ? pageT('realtime', 'Live')
    : isReconnecting
      ? pageT('reconnecting', 'Reconnecting…')
      : pageT('realtime', 'Live');

  // Suppress unused warnings for vars kept for clarity / future use
  void getWebSocketClient;
  void commonT;

  return (
    <div className="space-y-6"><Breadcrumb />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex flex-wrap items-center gap-2">
            <Bell className="h-6 w-6 text-blue-600" aria-hidden="true" />
            <span>{t('title', 'Notifications')}</span>
            {unreadCount > 0 && (
              <Badge
                variant="danger"
                size="sm"
                aria-label={`${unreadCount} ${t('unread', 'unread')}`}
              >
                {unreadCount}
              </Badge>
            )}
            <span
              data-testid="ws-status"
              className={cn(
                'ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                isConnected
                  ? 'bg-green-100 text-green-700 dark:bg-success-500/20 dark:text-success-500'
                  : isReconnecting
                    ? 'bg-amber-100 text-amber-700 dark:bg-warning-500/20 dark:text-warning-500'
                    : 'bg-gray-100 text-gray-600 dark:bg-surface-800 dark:text-gray-400'
              )}
              aria-live="polite"
              title={realtimeLabel}
            >
              {isConnected ? (
                <Wifi className="h-3 w-3" aria-hidden="true" />
              ) : (
                <WifiOff className="h-3 w-3" aria-hidden="true" />
              )}
              {realtimeLabel}
            </span>
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {pageT('subtitle', "Stay on top of interviews, candidates, and system activity.")}
          </p>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          role="toolbar"
          aria-label={pageT('actions.aria', 'Bulk notification actions')}
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => load('refresh')}
            loading={refreshing}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            aria-label={pageT('refresh', 'Refresh')}
          >
            {refreshing
              ? pageT('refreshing', 'Refreshing…')
              : pageT('refresh', 'Refresh')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClearRead}
            disabled={readCount === 0}
            leftIcon={<X className="h-4 w-4" />}
          >
            {pageT('clearRead', 'Clear read')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            leftIcon={<CheckCheck className="h-4 w-4" />}
          >
            {t('markAllRead', 'Mark all read')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
              <Inbox className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {pageT('counts.total', 'Total')}
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {notifications.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
              <Bell className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {pageT('counts.unread', 'Unread')}
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {unreadCount}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-500/20 flex items-center justify-center">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {pageT('counts.read', 'Read')}
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {readCount}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800 overflow-x-auto scrollbar-thin"
          role="tablist"
          aria-label={pageT('tabs.aria', 'Filter notifications by category')}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = filter === tab.key;
            const count = counts[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="notifications-list"
                onClick={() => setFilter(tab.key)}
                className={cn(
                  'relative inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-t',
                  active
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                )}
              >
                {Icon && <Icon className="h-4 w-4" aria-hidden={true} />}
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold',
                    active
                      ? 'bg-blue-600 text-white dark:bg-blue-400 dark:text-gray-900'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                  )}
                  aria-hidden="true"
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-80">
          <SearchIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            aria-hidden="true"
          />
          <input
            type="search"
            role="searchbox"
            aria-label={pageT('search.label', 'Search notifications')}
            placeholder={pageT('search.placeholder', 'Search notifications…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-9 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100 dark:placeholder-gray-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={pageT('search.clear', 'Clear search')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-gray-200"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {hasSelection && (
        <div
          role="region"
          aria-label={pageT('bulk.selectAll', 'Select all visible')}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-brand-500/40 dark:bg-brand-500/10"
        >
          <div className="flex items-center gap-2 text-blue-900 dark:text-brand-200">
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            <span>
              {pageT('bulk.selected', '{count} selected').replace(
                '{count}',
                String(selectedCount)
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAllVisible}
              leftIcon={<Check className="h-4 w-4" />}
            >
              {allVisibleSelected
                ? pageT('bulk.clearSelection', 'Clear selection')
                : pageT('bulk.selectAll', 'Select all visible')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              leftIcon={<X className="h-4 w-4" />}
            >
              {pageT('bulk.clearSelection', 'Clear selection')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmBulkDelete(true)}
              leftIcon={<Trash2 className="h-4 w-4" />}
            >
              {pageT('bulk.delete', 'Delete selected')}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton variant="circular" width={40} height={40} />
                  <div className="flex-1 space-y-2">
                    <Skeleton variant="text" width="40%" />
                    <Skeleton variant="text" width="80%" />
                    <Skeleton variant="text" width="20%" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<AlertCircle className="h-12 w-12" />}
              title={pageT('error.title', "Couldn't load notifications")}
              description={error}
              action={
                <Button variant="primary" onClick={() => load('initial')}>
                  {pageT('error.retry', 'Try again')}
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={
                search.trim() ? (
                  <SearchIcon className="h-12 w-12" />
                ) : (
                  <Bell className="h-12 w-12" />
                )
              }
              title={
                search.trim()
                  ? pageT('search.noResults', 'No notifications match your search.')
                  : pageT('empty.title', "You're all caught up")
              }
              description={
                search.trim()
                  ? undefined
                  : pageT(
                      'empty.description',
                      "No notifications match the current filter. We'll let you know when something new comes in."
                    )
              }
            />
          </CardContent>
        </Card>
      ) : (
        <ul
          id="notifications-list"
          role="tabpanel"
          aria-label={pageT('list.aria', 'Notifications list')}
          className="space-y-6"
        >
          {grouped.map((group) => (
            <li key={group.key} className="space-y-2">
              <div className="sticky top-16 z-10 -mx-1 flex items-center gap-2 bg-gray-50/90 px-1 py-1 backdrop-blur supports-[backdrop-filter]:bg-gray-50/70 dark:bg-surface-900/90 dark:supports-[backdrop-filter]:bg-surface-900/70">
                <ChevronDown
                  className="h-3.5 w-3.5 text-gray-400"
                  aria-hidden="true"
                />
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {groupLabels[group.key]}
                </h2>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  ({group.items.length})
                </span>
              </div>
              <ul
                className="space-y-2"
                aria-label={`${groupLabels[group.key]} ${pageT('list.aria', 'Notifications list')}`}
              >
                {group.items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    item={n}
                    locale={locale}
                    palette={CATEGORY_COLOR[n.category]}
                    Icon={CATEGORY_ICON[n.category]}
                    selected={selectedIds.has(n.id)}
                    onSelect={handleToggleSelect}
                    onOpen={handleItemClick}
                    onDelete={handleDeleteOne}
                    labels={{
                      select: pageT('select', 'Select notification'),
                      new: pageT('new', 'New'),
                      markAsRead: pageT('markAsRead', 'Mark as read'),
                      dismiss: pageT('dismiss', 'Dismiss notification'),
                    }}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        onClose={() => !bulkDeleting && setConfirmBulkDelete(false)}
        onConfirm={handleBulkDelete}
        title={pageT('bulk.deleteConfirmTitle', 'Delete {count} notification(s)?').replace(
          '{count}',
          String(selectedCount)
        )}
        description={pageT(
          'bulk.deleteConfirmDescription',
          'This action cannot be undone. The selected notifications will be permanently removed.'
        )}
        confirmLabel={pageT('bulk.delete', 'Delete selected')}
        cancelLabel={pageT('cancel', 'Cancel')}
        destructive
        loading={bulkDeleting}
      />
    </div>
  );
}

interface NotificationRowProps {
  item: UINotification;
  locale: Locale;
  palette: { ring: string; bg: string; text: string };
  Icon: typeof Calendar;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpen: (n: UINotification) => void;
  onDelete: (id: string) => void;
  labels: {
    select: string;
    new: string;
    markAsRead: string;
    dismiss: string;
  };
}

function NotificationRow({
  item,
  locale,
  palette,
  Icon,
  selected,
  onSelect,
  onOpen,
  onDelete,
  labels,
}: NotificationRowProps) {
  const rel = item.createdAt ? formatRelativeTime(item.createdAt, locale) : '';
  return (
    <Card
      className={cn(
        'transition hover:shadow-md hover:border-blue-300 dark:hover:border-blue-500/40 group',
        !item.read
          ? 'ring-1 ring-blue-200 dark:ring-blue-500/30 bg-blue-50/30 dark:bg-blue-500/5'
          : '',
        selected
          ? 'border-blue-400 ring-2 ring-blue-300 dark:border-brand-400 dark:ring-brand-500/40'
          : '',
        item.isFresh ? 'animate-fade-in' : ''
      )}
    >
      <div className="flex items-stretch gap-3 p-4">
        <div className="flex items-center pt-2">
          <input
            type="checkbox"
            role="checkbox"
            aria-checked={selected}
            aria-label={labels.select}
            checked={selected}
            onChange={() => onSelect(item.id)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800"
          />
        </div>
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="flex flex-1 items-start gap-3 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={`${item.title} — ${labels.markAsRead}`}
        >
          <span
            className={cn(
              'h-10 w-10 shrink-0 rounded-full flex items-center justify-center ring-1',
              palette.bg,
              palette.ring
            )}
            aria-hidden="true"
          >
            <Icon className={cn('h-5 w-5', palette.text)} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p
                className={cn(
                  'text-sm leading-snug truncate',
                  !item.read
                    ? 'font-semibold text-gray-900 dark:text-white'
                    : 'font-medium text-gray-800 dark:text-gray-200'
                )}
              >
                {item.title}
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                {item.isFresh && (
                  <Badge variant="solid-primary" size="sm" dot>
                    {labels.new}
                  </Badge>
                )}
                {!item.read && !item.isFresh && (
                  <Badge variant="info" size="sm" dot>
                    {labels.new}
                  </Badge>
                )}
                {rel && (
                  <span
                    className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap"
                    title={item.createdAt}
                  >
                    {rel}
                  </span>
                )}
              </div>
            </div>
            {item.body && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {item.body}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <Badge variant="outline" size="sm">
                {item.category}
              </Badge>
              {item.typeRaw && item.typeRaw !== item.category && (
                <span className="text-gray-500 dark:text-gray-400">
                  {item.typeRaw}
                </span>
              )}
              {item.link && (
                <span className="text-blue-600 dark:text-blue-400 font-medium inline-flex items-center gap-1">
                  <Filter className="h-3 w-3" aria-hidden="true" />
                  {item.link}
                </span>
              )}
            </div>
          </div>
          {!item.read && (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 mt-2 rounded-full bg-blue-600 dark:bg-blue-400 shrink-0"
            />
          )}
        </button>
        <div className="flex items-start pt-1">
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            aria-label={labels.dismiss}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 transition"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Card>
  );
}
