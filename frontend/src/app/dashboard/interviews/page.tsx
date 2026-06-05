'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import {
  Plus,
  Calendar,
  Clock,
  Video,
  Users,
  Phone,
  Code2,
  Building2,
  Search,
  CheckCircle2,
  Play,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/services/api/client';
import { DataTable, EmptyState, Badge, Button, Skeleton, Modal, useToast, Breadcrumb } from '@/components';
import type { Column } from '@/components/ui/data-table';
import { useLocaleStore, translate, interpolate, formatDate } from '@/stores/locale-store';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'danger' | 'purple' | 'default'> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
  no_show: 'default',
};

const TYPE_META: Record<string, { icon: typeof Phone; classes: string; dark: string }> = {
  phone: {
    icon: Phone,
    classes: 'bg-blue-100 text-blue-700',
    dark: 'dark:bg-blue-500/20 dark:text-blue-300',
  },
  technical: {
    icon: Code2,
    classes: 'bg-purple-100 text-purple-700',
    dark: 'dark:bg-purple-500/20 dark:text-purple-300',
  },
  panel: {
    icon: Users,
    classes: 'bg-amber-100 text-amber-700',
    dark: 'dark:bg-amber-500/20 dark:text-amber-300',
  },
  onsite: {
    icon: Building2,
    classes: 'bg-green-100 text-green-700',
    dark: 'dark:bg-green-500/20 dark:text-green-300',
  },
};

const DAY_LABELS_KEY = ['days.mon', 'days.tue', 'days.wed', 'days.thu', 'days.fri', 'days.sat', 'days.sun'] as const;

const formatDateTime = (iso: string, locale: string, todayLabel: string, tomorrowLabel: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isToday = d.toDateString() === today.toDateString();
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `${todayLabel}, ${time}`;
  if (isTomorrow) return `${tomorrowLabel}, ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
};

const startOfMonday = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

export default function InterviewsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfMonday(new Date()));
  const { push, ToastContainer } = useToast();

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const d: any = await api.interviews.list();
      setInterviews(d?.data || []);
    } catch (err: any) {
      setError(err?.message || t('interviews.couldntLoad', "Couldn't load interviews"));
      if (!isBackground) setInterviews([]);
    } finally {
      if (!isBackground) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load(true), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const handleStart = async (id: string) => {
    try {
      await api.startInterview(id);
      push('success', t('interviews.started', 'Interview started'));
      await load();
    } catch (err: any) {
      push('error', err?.message || t('interviews.startFailed', 'Failed to start interview'));
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await api.completeInterview(id);
      push('success', t('interviews.completed', 'Interview marked complete'));
      await load();
    } catch (err: any) {
      push('error', err?.message || t('interviews.completeFailed', 'Failed to complete interview'));
    }
  };

  const handleCreate = async (data: any) => {
    setSubmitting(true);
    try {
      await api.createInterview({
        candidate_id: data.candidate_id || data.candidate_name,
        job_id: data.job_id || data.job_title,
        scheduled_at: data.scheduled_at,
        duration_min: data.duration_min,
        type: data.type,
        panel: data.panel,
        location: data.location,
        status: 'scheduled',
      });
      setScheduleOpen(false);
      push('success', interpolate(t('interviews.scheduledWith', 'Interview scheduled with {name}'), { name: data.candidate_name }));
      await load();
    } catch (err: any) {
      push('error', err?.message || t('interviews.createFailed', 'Failed to schedule interview'));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = interviews.filter((i) => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (typeFilter !== 'all' && i.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.candidate_name?.toLowerCase().includes(q) && !i.job_title?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const upcoming = filtered
    .filter((i) => new Date(i.scheduled_at) >= new Date() && i.status === 'scheduled')
    .slice(0, 5);

  const STATUS_OPTIONS = [
    { value: 'all', label: t('candidates.allStatuses', 'All statuses') },
    ...Object.keys(STATUS_VARIANT).map((v) => ({ value: v, label: t(`interviews.statuses.${v}`, v.replace('_', ' ')) })),
  ];

  const TYPE_OPTIONS = [
    { value: 'all', label: t('interviews.types.all', 'All types') },
    { value: 'phone', label: t('interviews.types.phone', 'Phone screen') },
    { value: 'technical', label: t('interviews.types.technical', 'Technical') },
    { value: 'panel', label: t('interviews.types.panel', 'Panel') },
    { value: 'onsite', label: t('interviews.types.onsite', 'Onsite') },
  ];

  const columns: Column<any>[] = [
    {
      key: 'candidate_name',
      label: t('interviews.table.candidate', 'Candidate'),
      render: (i) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
            {i.candidate_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{i.candidate_name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{i.job_title}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'scheduled_at',
      label: t('interviews.table.when', 'When'),
      render: (i) => (
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDateTime(i.scheduled_at, locale, t('common.today', 'Today'), t('common.tomorrow', 'Tomorrow'))}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {i.duration_min || 60} {t('interviews.minutes', 'min')} · {i.location || t('jobs.remote', 'Remote')}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      label: t('interviews.table.type', 'Type'),
      render: (i) => {
        const meta = TYPE_META[i.type];
        const Icon = meta?.icon || Video;
        return (
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${meta?.classes || 'bg-gray-100 text-gray-700'} ${meta?.dark || 'dark:bg-gray-500/20 dark:text-gray-300'}`}>
            <Icon className="h-3 w-3" aria-hidden="true" /> {t(`interviews.types.${i.type}`, i.type)}
          </span>
        );
      },
    },
    {
      key: 'panel',
      label: t('interviews.table.panel', 'Panel'),
      render: (i) => (
        <div className="flex -space-x-1.5">
          {i.panel?.slice(0, 3).map((p: string, idx: number) => (
            <div
              key={idx}
              title={p}
              className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 border-2 border-white dark:border-surface-900 text-white text-[10px] font-bold flex items-center justify-center"
            >
              {p}
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      label: t('interviews.table.status', 'Status'),
      render: (i) => (
        <Badge variant={STATUS_VARIANT[i.status] || 'default'} size="sm" dot>
          {t(`interviews.statuses.${i.status}`, i.status?.replace('_', ' '))}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      render: (i) =>
        i.status === 'scheduled' ? (
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Play className="h-3 w-3" />}
            onClick={(e) => {
              e.stopPropagation();
              handleStart(i.id);
            }}
            aria-label={t('interviews.actions.startAria', 'Start interview with {name}').replace('{name}', i.candidate_name)}
          >
            {t('interviews.actions.start', 'Start')}
          </Button>
        ) : i.status === 'in_progress' ? (
          <Button
            size="sm"
            variant="success"
            leftIcon={<CheckCircle2 className="h-3 w-3" />}
            onClick={(e) => {
              e.stopPropagation();
              handleComplete(i.id);
            }}
            aria-label={t('interviews.actions.completeAria', 'Mark interview with {name} complete').replace('{name}', i.candidate_name)}
          >
            {t('interviews.actions.complete', 'Complete')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <ToastContainer />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('interviews.title', 'Interviews')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {interpolate(t('interviews.totalUpcoming', '{total} total · {upcoming} upcoming'), {
              total: String(interviews.length),
              upcoming: String(upcoming.length),
            })}
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setScheduleOpen(true)}
          aria-haspopup="dialog"
        >
          {t('interviews.schedule', 'Schedule interview')}
        </Button>
      </div>

      <Breadcrumb />

      {upcoming.length > 0 && (
        <div
          aria-live="polite"
          className="bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-purple-500/10 dark:via-blue-500/10 dark:to-indigo-500/10 border border-purple-200 dark:border-purple-500/30 rounded-xl p-5"
        >
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" /> {t('interviews.upcomingThisWeek', 'Upcoming this week')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
            {upcoming.map((i) => {
              const meta = TYPE_META[i.type];
              const Icon = meta?.icon || Video;
              return (
                <div
                  key={i.id}
                  className="bg-white dark:bg-surface-900 rounded-lg p-3 border border-purple-100 dark:border-purple-500/20 hover:border-purple-300 dark:hover:border-purple-500/50 transition"
                >
                  <p className="text-xs font-bold text-purple-700 dark:text-purple-300">
                    {formatDateTime(i.scheduled_at, locale, t('common.today', 'Today'), t('common.tomorrow', 'Tomorrow'))}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1 truncate">{i.candidate_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{i.job_title}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${meta?.classes || 'bg-gray-100 text-gray-700'} ${meta?.dark || 'dark:bg-gray-500/20 dark:text-gray-300'}`}
                    >
                      <Icon className="h-2.5 w-2.5" aria-hidden="true" /> {t(`interviews.types.${i.type}`, i.type)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('interviews.search', 'Search interviews...')}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 dark:placeholder-gray-500"
              aria-label={t('interviews.searchAria', 'Search interviews')}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
            aria-label={t('interviews.filterByStatus', 'Filter by status')}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
            aria-label={t('interviews.filterByType', 'Filter by type')}
          >
            {TYPE_OPTIONS.map((tt) => (
              <option key={tt.value} value={tt.value}>
                {tt.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg p-1">
            <button
              onClick={() => setView('list')}
              className={`p-1.5 rounded ${view === 'list' ? 'bg-blue-50 text-blue-600 dark:bg-brand-500/20 dark:text-brand-300' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-surface-700'}`}
              aria-label={t('interviews.viewList', 'List view')}
              aria-pressed={view === 'list'}
            >
              <Calendar className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`p-1.5 rounded ${view === 'calendar' ? 'bg-blue-50 text-blue-600 dark:bg-brand-500/20 dark:text-brand-300' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-surface-700'}`}
              aria-label={t('interviews.viewCalendar', 'Calendar view')}
              aria-pressed={view === 'calendar'}
            >
              <Video className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title={t('interviews.couldntLoad', "Couldn't load interviews")}
          description={error}
          action={
            <Button variant="primary" onClick={() => load(false)}>
              {t('common.retry', 'Retry')}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title={interviews.length === 0 ? t('interviews.noInterviewsYet', 'No interviews yet') : t('interviews.noInterviewsFound', 'No interviews found')}
          description={interviews.length === 0 ? t('interviews.noInterviewsDesc', 'Schedule your first interview to get started.') : t('interviews.tryAdjusting', 'Try adjusting your filters.')}
          action={
            <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setScheduleOpen(true)}>
              {t('interviews.schedule', 'Schedule interview')}
            </Button>
          }
        />
      ) : view === 'list' ? (
        <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 overflow-hidden">
          <DataTable columns={columns} data={filtered} searchable={false} pageSize={10} rowKey={(i) => i.id} />
        </div>
      ) : (
        <CalendarView
          interviews={filtered}
          weekStart={weekStart}
          onPrevWeek={() => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() - 7);
            setWeekStart(d);
          }}
          onNextWeek={() => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + 7);
            setWeekStart(d);
          }}
          onToday={() => setWeekStart(startOfMonday(new Date()))}
          locale={locale}
          t={t}
        />
      )}

      <Modal
        isOpen={scheduleOpen}
        onClose={() => !submitting && setScheduleOpen(false)}
        title={t('interviews.modal.title', 'Schedule interview')}
        description={t('interviews.modal.description', 'Set up a new interview with a candidate.')}
        size="lg"
      >
        <ScheduleForm onCancel={() => !submitting && setScheduleOpen(false)} onSubmit={handleCreate} submitting={submitting} locale={locale} t={t} />
      </Modal>
    </div>
  );
}

function CalendarView({
  interviews,
  weekStart,
  onPrevWeek,
  onNextWeek,
  onToday,
  locale,
  t,
}: {
  interviews: any[];
  weekStart: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  locale: string;
  t: (k: string, fb?: string) => string;
}) {
  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  return (
    <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-surface-700">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onPrevWeek} aria-label={t('interviews.calendar.prev', 'Previous week')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onToday}>
            {t('interviews.calendar.today', 'Today')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onNextWeek} aria-label={t('interviews.calendar.next', 'Next week')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {interpolate(t('interviews.calendar.weekOf', 'Week of {date}'), { date: formatDate(weekStart, locale as any, { month: 'short', day: 'numeric', year: 'numeric' }) })}
        </p>
      </div>
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-surface-700">
        {weekDays.map((d, i) => {
          const isToday = d.toDateString() === today.toDateString();
          return (
            <div
              key={i}
              className={`p-2 sm:p-3 text-center border-r border-gray-200 dark:border-surface-700 last:border-r-0 ${isToday ? 'bg-blue-50 dark:bg-brand-500/10' : ''}`}
              role="columnheader"
              aria-label={formatDate(d, locale as any, { weekday: 'long', month: 'long', day: 'numeric' })}
            >
              <p className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t(DAY_LABELS_KEY[i], DAY_LABELS_KEY[i].split('.')[1])}</p>
              <p className={`text-base sm:text-lg font-bold mt-0.5 ${isToday ? 'text-blue-600 dark:text-brand-400' : 'text-gray-900 dark:text-gray-100'}`}>{d.getDate()}</p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[280px] sm:min-h-[400px]">
        {weekDays.map((d, i) => {
          const dayInterviews = interviews.filter((iv) => new Date(iv.scheduled_at).toDateString() === d.toDateString());
          const isToday = d.toDateString() === today.toDateString();
          return (
            <div
              key={i}
              className={`p-1.5 sm:p-2 border-r border-gray-200 dark:border-surface-700 last:border-r-0 space-y-1.5 min-h-[280px] sm:min-h-[400px] ${isToday ? 'bg-blue-50/30 dark:bg-brand-500/5' : ''}`}
              role="gridcell"
              aria-label={formatDate(d, locale as any, { weekday: 'long', month: 'long', day: 'numeric' })}
            >
              {dayInterviews.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-8">—</p>
              ) : (
                dayInterviews.map((iv) => {
                  const meta = TYPE_META[iv.type];
                  return (
                    <div
                      key={iv.id}
                      className={`p-2 rounded text-xs border-l-2 ${meta?.classes || 'bg-gray-50 text-gray-700'} ${meta?.dark || 'dark:bg-gray-500/10 dark:text-gray-300'}`}
                    >
                      <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{iv.candidate_name}</p>
                      <p className="text-gray-600 dark:text-gray-300 truncate">{iv.job_title}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {new Date(iv.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleForm({
  onCancel,
  onSubmit,
  submitting,
  locale,
  t,
}: {
  onCancel: () => void;
  onSubmit: (data: any) => void;
  submitting?: boolean;
  locale: string;
  t: (k: string, fb?: string) => string;
}) {
  const candidateId = useId();
  const jobId = useId();
  const dateId = useId();
  const timeId = useId();
  const durationId = useId();
  const typeId = useId();
  const locationId = useId();
  const panelId = useId();
  const [form, setForm] = useState({ candidate_name: '', job_title: '', date: '', time: '', duration_min: 60, type: 'technical', panel: '', location: 'Remote' });
  const [error, setError] = useState('');

  const update = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.candidate_name || !form.date || !form.time) {
      setError(t('interviews.formErrorRequired', 'Candidate name, date and time are required'));
      return;
    }
    setError('');
    const scheduled_at = new Date(`${form.date}T${form.time}`).toISOString();
    onSubmit({
      ...form,
      scheduled_at,
      panel: form.panel.split(',').map((p: string) => p.trim()).filter(Boolean),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={candidateId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('interviews.fields.candidateName', 'Candidate name *')}
          </label>
          <input
            id={candidateId}
            value={form.candidate_name}
            onChange={(e) => update('candidate_name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100"
            required
            aria-required="true"
          />
        </div>
        <div>
          <label htmlFor={jobId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('interviews.fields.jobPosition', 'Job position *')}
          </label>
          <input
            id={jobId}
            value={form.job_title}
            onChange={(e) => update('job_title', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100"
            required
            aria-required="true"
          />
        </div>
        <div>
          <label htmlFor={dateId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('interviews.fields.date', 'Date *')}
          </label>
          <input
            id={dateId}
            type="date"
            value={form.date}
            onChange={(e) => update('date', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100"
            required
            aria-required="true"
          />
        </div>
        <div>
          <label htmlFor={timeId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('interviews.fields.time', 'Time *')}
          </label>
          <input
            id={timeId}
            type="time"
            value={form.time}
            onChange={(e) => update('time', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100"
            required
            aria-required="true"
          />
        </div>
        <div>
          <label htmlFor={durationId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('interviews.fields.duration', 'Duration (min)')}
          </label>
          <select
            id={durationId}
            value={form.duration_min}
            onChange={(e) => update('duration_min', Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100"
          >
            {[30, 45, 60, 90, 120].map((d) => (
              <option key={d} value={d}>
                {t(`interviews.durations.${d}`, `${d} minutes`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={typeId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('interviews.fields.type', 'Type')}
          </label>
          <select
            id={typeId}
            value={form.type}
            onChange={(e) => update('type', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100"
          >
            {Object.entries(TYPE_META).map(([k, m]) => {
              const Icon = m.icon;
              return (
                <option key={k} value={k}>
                  {t(`interviews.types.${k}`, k)}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label htmlFor={locationId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('interviews.fields.location', 'Location')}
          </label>
          <input
            id={locationId}
            value={form.location}
            onChange={(e) => update('location', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label htmlFor={panelId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t('interviews.fields.panel', 'Panel (initials, comma separated)')}
          </label>
          <input
            id={panelId}
            value={form.panel}
            onChange={(e) => update('panel', e.target.value)}
            placeholder="JD, MJ"
            className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 dark:border-surface-700">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button variant="primary" type="submit" loading={submitting} leftIcon={<Calendar className="h-4 w-4" />}>
          {t('interviews.modal.title', 'Schedule')}
        </Button>
      </div>
    </form>
  );
}
