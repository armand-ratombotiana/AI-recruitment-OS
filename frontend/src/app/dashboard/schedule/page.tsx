'use client';

import { useState, useEffect } from 'react';
import { Calendar, Plus } from 'lucide-react';
import { api } from '@/services/api/client';
import { EmptyState, Button } from '@/components';

const TYPE_COLOR: Record<string, string> = {
  phone: 'border-blue-500 bg-blue-50',
  technical: 'border-purple-500 bg-purple-50',
  panel: 'border-amber-500 bg-amber-50',
  onsite: 'border-green-500 bg-green-50',
};

const TYPE_ICON: Record<string, string> = { phone: '📞', technical: '💻', panel: '👥', onsite: '🏢' };

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
  const [range, setRange] = useState<Range>('today');
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(err?.message || 'Failed to load schedule');
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6 text-purple-600" />
          Schedule
        </h1>
        <div className="flex gap-2">
          {(['today', 'week', 'month'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${
                range === r ? 'bg-blue-600 text-white' : 'border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}
          </div>
        ) : error ? (
          <EmptyState
            icon={<Calendar className="h-10 w-10" />}
            title="Couldn’t load schedule"
            description={error}
            action={<Button variant="primary" onClick={() => load(range)}>Retry</Button>}
          />
        ) : events.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-10 w-10" />}
            title="Nothing scheduled"
            description={range === 'today' ? 'Your day is clear.' : 'No events in this period.'}
            action={
              <a href="/dashboard/interviews?action=schedule" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                Schedule an interview →
              </a>
            }
          />
        ) : (
          <div className="space-y-3">
            {events.map((e) => {
              const t = new Date(e.scheduled_at);
              const time = isNaN(t.getTime()) ? '—' : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const date = isNaN(t.getTime()) ? '' : t.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
              return (
                <div key={e.id} className={`flex items-center gap-4 p-4 rounded-lg border-l-4 ${TYPE_COLOR[e.type] || 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}>
                  <div className="text-center w-16 shrink-0">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">{date.split(',')[0]}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{t.getDate()}</p>
                  </div>
                  <span className="text-sm font-mono font-medium text-gray-500 dark:text-gray-400 w-14 shrink-0">{time}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                      {TYPE_ICON[e.type] || '📅'}{' '}
                      {e.candidate_name || e.candidate?.full_name || 'Candidate'} — {e.job_title || e.job?.title || e.type}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {e.duration_min || 60} min · {e.location || 'Remote'} · {e.status}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
