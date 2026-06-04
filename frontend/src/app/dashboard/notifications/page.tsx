'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  X,
  Calendar,
  Users,
  Briefcase,
  Settings,
  AlertCircle,
  MessageSquare,
  Filter,
  CheckCheck,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import { api } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  Breadcrumb,
  useToast,
} from '@/components';
import { useLocaleStore, translate, formatRelativeTime } from '@/stores/locale-store';

type NotificationCategory = 'interview' | 'candidate' | 'job' | 'system' | 'mention';

type FilterKey = 'all' | 'unread' | 'interviews' | 'candidates' | 'system';

interface UINotification {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  typeRaw: string;
  createdAt: string;
  read: boolean;
  link: string | null;
}

const CATEGORY_KEYWORDS: Record<NotificationCategory, RegExp> = {
  interview: /(interview|schedule|meeting|panel|onsite|phone screen|calendar)/i,
  candidate: /(candidate|applicant|resume|cv|new (?:profile|application)|talent)/i,
  job: /(job|role|position|requisition|hiring|opening|posting)/i,
  mention: /(mention|@|tagged|comment|message|reply)/i,
  system: /(system|security|alert|billing|workflow|automation|integration|update)/i,
};

const CATEGORY_ICON: Record<NotificationCategory, typeof Bell> = {
  interview: Calendar,
  candidate: Users,
  job: Briefcase,
  system: Settings,
  mention: MessageSquare,
};

const CATEGORY_COLOR: Record<NotificationCategory, { ring: string; bg: string; text: string }> = {
  interview: { ring: 'ring-purple-200 dark:ring-purple-500/30', bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400' },
  candidate: { ring: 'ring-blue-200 dark:ring-blue-500/30', bg: 'bg-blue-100 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  job: { ring: 'ring-emerald-200 dark:ring-emerald-500/30', bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  system: { ring: 'ring-amber-200 dark:ring-amber-500/30', bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  mention: { ring: 'ring-pink-200 dark:ring-pink-500/30', bg: 'bg-pink-100 dark:bg-pink-500/20', text: 'text-pink-600 dark:text-pink-400' },
};

function detectCategory(item: { type?: string; title?: string; body?: string }): NotificationCategory {
  const haystack = `${item.type || ''} ${item.title || ''} ${item.body || ''}`.toLowerCase();
  for (const key of ['interview', 'candidate', 'job', 'mention', 'system'] as NotificationCategory[]) {
    if (CATEGORY_KEYWORDS[key].test(haystack)) return key;
  }
  return 'system';
}

function mapNotification(raw: any): UINotification {
  const createdAt = raw.created_at || raw.timestamp || raw.createdAt || '';
  return {
    id: String(raw.id),
    title: raw.title || 'Notification',
    body: raw.body || raw.message || '',
    category: detectCategory({ type: raw.type, title: raw.title, body: raw.body || raw.message }),
    typeRaw: raw.type || '',
    createdAt,
    read: !!raw.read,
    link: raw.link || null,
  };
}

export default function NotificationsPage() {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fallback?: string) => translate(locale, `notifications.${key}`, fallback),
    [locale]
  );
  const pageT = useCallback(
    (key: string, fallback?: string) => translate(locale, `notifications.page.${key}`, fallback),
    [locale]
  );
  const { push, ToastContainer } = useToast();

  const [notifications, setNotifications] = useState<UINotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const res = await api.listNotifications();
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setNotifications(list.map(mapNotification));
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

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const readCount = notifications.length - unreadCount;

  const counts = useMemo(() => {
    const acc: Record<FilterKey, number> = {
      all: notifications.length,
      unread: unreadCount,
      interviews: 0,
      candidates: 0,
      system: 0,
    };
    for (const n of notifications) {
      if (n.category === 'interview') acc.interviews += 1;
      else if (n.category === 'candidate') acc.candidates += 1;
      else if (n.category === 'system') acc.system += 1;
    }
    return acc;
  }, [notifications, unreadCount]);

  const filtered = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'unread') return notifications.filter((n) => !n.read);
    if (filter === 'interviews') return notifications.filter((n) => n.category === 'interview');
    if (filter === 'candidates') return notifications.filter((n) => n.category === 'candidate');
    if (filter === 'system') return notifications.filter((n) => n.category === 'system');
    return notifications;
  }, [notifications, filter]);

  const handleItemClick = useCallback(
    async (n: UINotification) => {
      if (!n.read) {
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        try {
          await api.markNotificationRead(n.id);
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

  const handleMarkAllRead = useCallback(async () => {
    if (unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await api.markAllNotificationsRead();
      push('success', t('markAllRead', 'Mark all read'));
    } catch (err: any) {
      push('error', err?.message || t('markAllRead', 'Mark all read'));
      load('refresh');
    }
  }, [unreadCount, t, push, load]);

  const handleClearRead = useCallback(() => {
    if (readCount === 0) return;
    setNotifications((prev) => prev.filter((n) => !n.read));
    push('info', pageT('clearRead', 'Clear read'));
  }, [readCount, push, pageT]);

  const tabs: { key: FilterKey; label: string; icon?: typeof Bell }[] = [
    { key: 'all', label: pageT('filters.all', 'All'), icon: Inbox },
    { key: 'unread', label: pageT('filters.unread', 'Unread'), icon: Bell },
    { key: 'interviews', label: pageT('filters.interviews', 'Interviews'), icon: Calendar },
    { key: 'candidates', label: pageT('filters.candidates', 'Candidates'), icon: Users },
    { key: 'system', label: pageT('filters.system', 'System'), icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <ToastContainer />
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="h-6 w-6 text-blue-600" aria-hidden="true" />
            {t('title', 'Notifications')}
            {unreadCount > 0 && (
              <Badge variant="danger" size="sm" aria-label={`${unreadCount} ${t('unread', 'unread')}`}>
                {unreadCount}
              </Badge>
            )}
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
            {refreshing ? pageT('refreshing', 'Refreshing…') : pageT('refresh', 'Refresh')}
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
              <Inbox className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{pageT('counts.total', 'Total')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{notifications.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
              <Bell className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{pageT('counts.unread', 'Unread')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{unreadCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-500/20 flex items-center justify-center">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('markAllRead', 'Mark all read')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{readCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
              className={`relative inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-t ${
                active
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
              <span>{tab.label}</span>
              <span
                className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold ${
                  active
                    ? 'bg-blue-600 text-white dark:bg-blue-400 dark:text-gray-900'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                }`}
                aria-hidden="true"
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

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
              icon={<Bell className="h-12 w-12" />}
              title={pageT('empty.title', "You're all caught up")}
              description={pageT(
                'empty.description',
                "No notifications match the current filter. We'll let you know when something new comes in."
              )}
            />
          </CardContent>
        </Card>
      ) : (
        <ul
          id="notifications-list"
          role="tabpanel"
          aria-label={pageT('list.aria', 'Notifications list')}
          className="space-y-2"
        >
          {filtered.map((n) => {
            const Icon = CATEGORY_ICON[n.category];
            const palette = CATEGORY_COLOR[n.category];
            const rel = n.createdAt ? formatRelativeTime(n.createdAt, locale) : '';
            return (
              <li key={n.id}>
                <Card
                  className={`transition hover:shadow-md hover:border-blue-300 dark:hover:border-blue-500/40 group ${
                    !n.read
                      ? 'ring-1 ring-blue-200 dark:ring-blue-500/30 bg-blue-50/30 dark:bg-blue-500/5'
                      : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className="w-full text-left flex items-start gap-3 p-4 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label={`${n.title} — ${pageT('open', 'Open notification')}`}
                  >
                    <span
                      className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ring-1 ${palette.bg} ${palette.ring}`}
                      aria-hidden="true"
                    >
                      <Icon className={`h-5 w-5 ${palette.text}`} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm leading-snug truncate ${
                            !n.read
                              ? 'font-semibold text-gray-900 dark:text-white'
                              : 'font-medium text-gray-800 dark:text-gray-200'
                          }`}
                        >
                          {n.title}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!n.read && (
                            <Badge variant="info" size="sm" dot>
                              {pageT('new', 'New')}
                            </Badge>
                          )}
                          {rel && (
                            <span
                              className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap"
                              title={n.createdAt}
                            >
                              {rel}
                            </span>
                          )}
                        </div>
                      </div>
                      {n.body && (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2 text-[11px]">
                        <Badge variant="outline" size="sm">
                          {n.category}
                        </Badge>
                        {n.link && (
                          <span className="text-blue-600 dark:text-blue-400 font-medium inline-flex items-center gap-1">
                            <Filter className="h-3 w-3" aria-hidden="true" />
                            {n.link}
                          </span>
                        )}
                      </div>
                    </div>
                    {!n.read && (
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 mt-2 rounded-full bg-blue-600 dark:bg-blue-400 shrink-0"
                      />
                    )}
                  </button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
