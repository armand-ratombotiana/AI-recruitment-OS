'use client';

import { useState, useEffect } from 'react';
import { Calendar, Plus, Phone, Code2, Users, Building2, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '@/services/api/client';
import { EmptyState, Button, Skeleton } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';

const TYPE_COLOR: Record<string, string> = {
  phone: 'border-blue-500 bg-blue-50 dark:bg-blue-500/10',
  technical: 'border-purple-500 bg-purple-50 dark:bg-purple-500/10',
  panel: 'border-amber-500 bg-amber-50 dark:bg-amber-500/10',
  onsite: 'border-green-500 bg-green-50 dark:bg-green-500/10',
};

const TYPE_ICON: Record<string, any> = {
  phone: Phone,
  technical: Code2,
  panel: Users,
  onsite: Building2,
};

type Range = 'today' | 'week' | 'month';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d: Date) {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfMonth(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return x;
}

function endOfMonth(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return x;
}

export default function SchedulePage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [range, setRange] = useState<Range>('today');
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const localeBcp = locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : 'en-US';

  const load = async (r: Range) => {
    setLoading(true);
    setError(null);
    const now = new Date();
    let from: Date;
    let to: Date;
    if (r === 'today') { from = startOfDay(now); to = endOfDay(now); }
    else if (r === 'week') { from = startOfWeek(now); to = endOfWeek(now); }
    else { from = startOfMonth(now); to = endOfMonth(now); }
    try {
      const d = await api.listInterviews({
        scheduled_after: from.toISOString(),
        scheduled_before: to.toISOString(),
        limit: '200',
      });
      const items = (d?.data || []).slice().sort((a: any, b: any) => {
        const ta = new Date(a.scheduled_at).getTime();
        const tb = new Date(b.scheduled_at).getTime();
        return ta - tb;
      });
      setEvents(items);
    } catch (err: any) {
      setError(err?.message || t('schedule.couldntLoad', "Couldn't load schedule"));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(range);
  }, [range]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
          <Calendar className="h-6 w-6 text-purple-600 dark:text-purple-400" aria-hidden="true" />
          {t('schedule.title', 'Schedule')}
        </h1>
        <div
          role="group"
          aria-label={t('schedule.rangeLabel', 'Date range')}
          className="flex gap-1 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg p-1 shadow-sm"
        >
          {(['today', 'week', 'month'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                range === r
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-surface-700 dark:hover:text-white'
              }`}
            >
              {r === 'today' ? t('schedule.today', 'Today') : r === 'week' ? t('schedule.week', 'This Week') : t('schedule.month', 'This Month')}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6">
        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={72} />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="space-y-3">
            <EmptyState
              icon={<AlertCircle className="h-10 w-10 text-red-500" />}
              title={t('schedule.couldntLoad', "Couldn't load schedule")}
              description={error}
              action={<Button variant="primary" onClick={() => load(range)}>{t('common.retry', 'Retry')}</Button>}
            />
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-10 w-10" />}
            title={t('schedule.nothing', 'Nothing scheduled')}
            description={range === 'today' ? t('schedule.nothingToday', 'Your day is clear.') : t('schedule.nothingPeriod', 'No events in this period.')}
            action={
              <a
                href="/dashboard/interviews?action=schedule"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-brand-400 dark:hover:text-brand-300 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t('schedule.scheduleCta', 'Schedule an interview →')}
              </a>
            }
          />
        ) : (
          <ul className="space-y-3" aria-label={t('schedule.listLabel', 'Scheduled events')}>
            {events.map((e) => {
              const t1 = new Date(e.scheduled_at);
              const time = isNaN(t1.getTime()) ? '—' : t1.toLocaleTimeString(localeBcp, { hour: '2-digit', minute: '2-digit' });
              const date = isNaN(t1.getTime()) ? '' : t1.toLocaleDateString(localeBcp, { weekday: 'short', month: 'short', day: 'numeric' });
              const Icon = TYPE_ICON[e.type];
              const colorCls = TYPE_COLOR[e.type] || 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800';
              const typeLabel = t(`interviews.types.${e.type}`, e.type || 'event');
              return (
                <li
                  key={e.id}
                  className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border-l-4 ${colorCls}`}
                  aria-label={`${time} — ${e.candidate_name || e.candidate?.full_name || 'Candidate'} (${typeLabel})`}
                >
                  <div className="text-center w-14 sm:w-16 shrink-0">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">{date.split(',')[0]}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{t1.getDate()}</p>
                  </div>
                  <span className="text-sm font-mono font-medium text-gray-500 dark:text-gray-400 w-14 shrink-0 hidden sm:inline">{time}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate flex items-center gap-1.5">
                      {Icon ? <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 shrink-0" aria-hidden="true" /> : <Calendar className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 shrink-0" aria-hidden="true" />}
                      <span className="truncate">{e.candidate_name || e.candidate?.full_name || 'Candidate'} — {e.job_title || e.job?.title || e.type}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      <span className="sm:hidden font-mono mr-2">{time}</span>
                      {e.duration_min || 60} {t('interviews.minutes', 'min')} · {e.location || t('jobs.remote', 'Remote')} · {t(`interviews.statuses.${e.status}`, e.status || 'scheduled')}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
