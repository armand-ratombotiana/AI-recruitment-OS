'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Calendar,
  Clock,
  Video,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  MapPin,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react';
import { api } from '@/services/api/client';
import { DataTable, EmptyState, Badge, Button, Skeleton, Modal, useToast, Breadcrumb } from '@/components';
import type { Column } from '@/components/ui/data-table';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'danger' | 'purple' | 'default'> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
  no_show: 'default',
};

const STATUSES = [
  { value: 'all', label: 'All statuses' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPES = [
  { value: 'all', label: 'All types' },
  { value: 'phone', label: 'Phone screen', icon: '📞' },
  { value: 'technical', label: 'Technical', icon: '💻' },
  { value: 'panel', label: 'Panel', icon: '👥' },
  { value: 'onsite', label: 'Onsite', icon: '🏢' },
];

const TYPE_ICON: Record<string, string> = { phone: '📞', technical: '💻', panel: '👥', onsite: '🏢' };
const TYPE_COLOR: Record<string, string> = { phone: 'bg-blue-100 text-blue-700', technical: 'bg-purple-100 text-purple-700', panel: 'bg-amber-100 text-amber-700', onsite: 'bg-green-100 text-green-700' };

const formatDateTime = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isToday = d.toDateString() === today.toDateString();
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  if (isTomorrow) return `Tomorrow, ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;
};

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { push, ToastContainer } = useToast();

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const d: any = await api.interviews.list();
      setInterviews(d?.data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load interviews');
      if (!isBackground) setInterviews([]);
    } finally {
      if (!isBackground) setLoading(false);
    }
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
      push('success', 'Interview started');
      await load();
    } catch (err: any) {
      push('error', err?.message || 'Failed to start interview');
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await api.completeInterview(id);
      push('success', 'Interview marked complete');
      await load();
    } catch (err: any) {
      push('error', err?.message || 'Failed to complete interview');
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
      push('success', `Interview scheduled with ${data.candidate_name}`);
      await load();
    } catch (err: any) {
      push('error', err?.message || 'Failed to schedule interview');
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

  const upcoming = filtered.filter((i) => new Date(i.scheduled_at) >= new Date() && i.status === 'scheduled').slice(0, 5);

  const columns: Column<any>[] = [
    {
      key: 'candidate_name',
      label: 'Candidate',
      render: (i) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
            {i.candidate_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <p className="font-medium text-gray-900">{i.candidate_name}</p>
            <p className="text-xs text-gray-500">{i.job_title}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'scheduled_at',
      label: 'When',
      render: (i) => (
        <div>
          <p className="text-sm font-medium text-gray-900">{formatDateTime(i.scheduled_at)}</p>
          <p className="text-xs text-gray-500">{i.duration_min || 60} min · {i.location || 'Remote'}</p>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (i) => (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLOR[i.type] || 'bg-gray-100 text-gray-700'}`}>
          <span>{TYPE_ICON[i.type]}</span> {i.type}
        </span>
      ),
    },
    {
      key: 'panel',
      label: 'Panel',
      render: (i) => (
        <div className="flex -space-x-1.5">
          {i.panel?.slice(0, 3).map((p: string, idx: number) => (
            <div key={idx} className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 border-2 border-white text-white text-[10px] font-bold flex items-center justify-center">{p}</div>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (i) => <Badge variant={STATUS_VARIANT[i.status] || 'default'} size="sm" dot>{i.status?.replace('_', ' ')}</Badge>,
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      render: (i) => i.status === 'scheduled' ? (
        <Button size="sm" variant="primary" leftIcon={<Play className="h-3 w-3" />} onClick={(e) => { e.stopPropagation(); handleStart(i.id); }}>Start</Button>
      ) : i.status === 'in_progress' ? (
        <Button size="sm" variant="success" leftIcon={<CheckCircle2 className="h-3 w-3" />} onClick={(e) => { e.stopPropagation(); handleComplete(i.id); }}>Complete</Button>
      ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <ToastContainer />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Interviews</h1>
          <p className="text-sm text-gray-500 mt-1">{interviews.length} total · {upcoming.length} upcoming</p>
        </div>
        <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setScheduleOpen(true)}>
          Schedule interview
        </Button>
      </div>

      <Breadcrumb />

      {upcoming.length > 0 && (
        <div className="bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 border border-purple-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-600" /> Upcoming this week
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
            {upcoming.map((i) => (
              <div key={i.id} className="bg-white rounded-lg p-3 border border-purple-100 hover:border-purple-300 transition">
                <p className="text-xs font-bold text-purple-700">{formatDateTime(i.scheduled_at)}</p>
                <p className="text-sm font-semibold text-gray-900 mt-1 truncate">{i.candidate_name}</p>
                <p className="text-xs text-gray-500 truncate">{i.job_title}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_COLOR[i.type] || 'bg-gray-100'}`}>{TYPE_ICON[i.type]} {i.type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search interviews..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-label="Search interviews"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white" aria-label="Filter by status">
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white" aria-label="Filter by type">
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            <button onClick={() => setView('list')} className={`p-1.5 rounded ${view === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`} aria-label="List view" aria-pressed={view === 'list'}>
              <ListIcon className="h-4 w-4" />
            </button>
            <button onClick={() => setView('calendar')} className={`p-1.5 rounded ${view === 'calendar' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`} aria-label="Calendar view" aria-pressed={view === 'calendar'}>
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} height={56} />)}</div>
      ) : error ? (
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title="Couldn't load interviews"
          description={error}
          action={<Button variant="primary" onClick={() => load(false)}>Retry</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title={interviews.length === 0 ? "No interviews yet" : "No interviews found"}
          description={interviews.length === 0 ? "Schedule your first interview to get started." : "Try adjusting your filters."}
          action={<Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setScheduleOpen(true)}>Schedule interview</Button>}
        />
      ) : view === 'list' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <DataTable columns={columns} data={filtered} searchable={false} pageSize={10} rowKey={(i) => i.id} />
        </div>
      ) : (
        <CalendarView interviews={filtered} />
      )}

      <Modal isOpen={scheduleOpen} onClose={() => !submitting && setScheduleOpen(false)} title="Schedule interview" description="Set up a new interview with a candidate." size="lg">
        <ScheduleForm
          onCancel={() => !submitting && setScheduleOpen(false)}
          onSubmit={handleCreate}
          submitting={submitting}
        />
      </Modal>
    </div>
  );
}

function CalendarView({ interviews }: { interviews: any[] }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200">
        {weekDays.map((d, i) => {
          const isToday = d.toDateString() === today.toDateString();
          return (
            <div key={i} className={`p-3 text-center border-r border-gray-200 last:border-r-0 ${isToday ? 'bg-blue-50' : ''}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase">{days[i]}</p>
              <p className={`text-lg font-bold mt-0.5 ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>{d.getDate()}</p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[400px]">
        {weekDays.map((d, i) => {
          const dayInterviews = interviews.filter((iv) => new Date(iv.scheduled_at).toDateString() === d.toDateString());
          const isToday = d.toDateString() === today.toDateString();
          return (
            <div key={i} className={`p-2 border-r border-gray-200 last:border-r-0 space-y-1.5 min-h-[400px] ${isToday ? 'bg-blue-50/30' : ''}`}>
              {dayInterviews.length === 0 ? (
                <p className="text-xs text-gray-300 text-center mt-8">—</p>
              ) : (
                dayInterviews.map((iv) => (
                  <div key={iv.id} className={`p-2 rounded text-xs border-l-2 ${TYPE_COLOR[iv.type] || 'bg-gray-50'}`}>
                    <p className="font-semibold text-gray-900 truncate">{iv.candidate_name}</p>
                    <p className="text-gray-600 truncate">{iv.job_title}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{new Date(iv.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleForm({ onCancel, onSubmit, submitting }: { onCancel: () => void; onSubmit: (data: any) => void; submitting?: boolean }) {
  const [form, setForm] = useState({ candidate_name: '', job_title: '', date: '', time: '', duration_min: 60, type: 'technical', panel: '', location: 'Remote' });

  const update = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.candidate_name || !form.date || !form.time) return;
    const scheduled_at = new Date(`${form.date}T${form.time}`).toISOString();
    onSubmit({
      ...form,
      scheduled_at,
      panel: form.panel.split(',').map((p: string) => p.trim()).filter(Boolean),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Candidate name *</label>
          <input value={form.candidate_name} onChange={(e) => update('candidate_name', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Job position *</label>
          <input value={form.job_title} onChange={(e) => update('job_title', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Date *</label>
          <input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Time *</label>
          <input type="time" value={form.time} onChange={(e) => update('time', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Duration (min)</label>
          <select value={form.duration_min} onChange={(e) => update('duration_min', Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
            {[30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} minutes</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
          <select value={form.type} onChange={(e) => update('type', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
            {TYPES.filter((t) => t.value !== 'all').map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
          <input value={form.location} onChange={(e) => update('location', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Panel (initials, comma separated)</label>
          <input value={form.panel} onChange={(e) => update('panel', e.target.value)} placeholder="JD, MJ" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button variant="primary" type="submit" loading={submitting} leftIcon={<Calendar className="h-4 w-4" />}>Schedule</Button>
      </div>
    </form>
  );
}
