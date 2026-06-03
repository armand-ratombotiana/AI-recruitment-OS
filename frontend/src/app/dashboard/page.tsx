'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Briefcase,
  Calendar,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Bot,
  UserPlus,
  Code2,
  Activity,
  Clock,
  ChevronRight,
  ArrowUpRight,
  Target,
  Zap,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  StatsCard,
  Breadcrumb,
  Skeleton,
  SkeletonCard,
  EmptyState,
  Badge,
  useCountUp,
  useToast,
  OnboardingChecklist,
} from '@/components';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const QUICK = [
  { label: 'Add candidate', icon: UserPlus, href: '/dashboard/candidates', color: 'from-blue-500 to-blue-600' },
  { label: 'Create job', icon: Briefcase, href: '/dashboard/jobs', color: 'from-green-500 to-emerald-600' },
  { label: 'Schedule interview', icon: Calendar, href: '/dashboard/interviews', color: 'from-purple-500 to-purple-600' },
  { label: 'Ask AI Copilot', icon: Bot, href: '/dashboard/ai-copilot', color: 'from-amber-500 to-orange-600' },
];

const STATUS_COLORS: Record<string, 'info' | 'warning' | 'success' | 'purple' | 'default' | 'danger'> = {
  Interviewing: 'purple',
  Screening: 'info',
  Offer: 'success',
  PPE: 'warning',
  Applied: 'default',
  Hired: 'success',
  Rejected: 'danger',
  Active: 'info',
};

function AnimatedStat({ value, suffix = '', prefix = '' }: { value: number; suffix?: string; prefix?: string }) {
  const { count, ref } = useCountUp(value);
  return (
    <span ref={ref as any} className="count-up">
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton variant="text" width="40%" height={32} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SkeletonCard />
        </div>
        <SkeletonCard />
      </div>
    </div>
  );
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function BarChart({ data, max }: { data: { label: string; value: number }[]; max: number }) {
  return (
    <div className="bar-chart" role="img" aria-label="Bar chart of weekly candidates">
      {data.map((b) => (
        <div key={b.label} className="bar-chart-col">
          <div
            className="bar-chart-bar"
            style={{ height: `${max > 0 ? (b.value / max) * 100 : 0}%` }}
            data-value={b.value}
            role="presentation"
          />
          <span className="bar-chart-label">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

function FunnelChart({ data }: { data: { stage: string; count: number; color: string; width: number }[] }) {
  if (data.length === 0) return null;
  const max = data[0].count || 1;
  return (
    <div className="space-y-2.5">
      {data.map((f, i) => {
        const widthPct = Math.max(8, (f.count / max) * 100);
        return (
          <div key={f.stage} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-gray-700">{f.stage}</span>
              <span className="text-gray-500">{f.count}</span>
            </div>
            <div
              className={`h-6 rounded-md bg-gradient-to-r ${f.color} flex items-center px-2.5 text-white text-[10px] font-bold transition-all hover:translate-x-1`}
              style={{ width: `${widthPct}%` }}
              role="progressbar"
              aria-valuenow={f.count}
              aria-valuemin={0}
              aria-valuemax={max}
              aria-label={`${f.stage}: ${f.count} candidates`}
            >
              {i === 0 && f.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function relTime(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function colorForAction(action: string): string {
  const a = (action || '').toLowerCase();
  if (a.includes('screen')) return 'from-blue-500 to-blue-600';
  if (a.includes('match')) return 'from-green-500 to-emerald-600';
  if (a.includes('interview') || a.includes('assess')) return 'from-purple-500 to-purple-600';
  if (a.includes('workflow') || a.includes('email')) return 'from-amber-500 to-orange-600';
  if (a.includes('rank')) return 'from-pink-500 to-rose-600';
  return 'from-slate-500 to-slate-600';
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      api.getDashboard(range),
      api.getPipelineAnalytics(),
      api.listCandidates({ limit: '5', sort: '-created_at' }),
      api.listInterviews({ upcoming: 'true', limit: '5' }),
      api.getAIPerformance().catch(() => null),
    ])
      .then(([dash, pipe, cands, ints, _ai]) => {
        if (cancelled) return;
        setData({
          dashboard: dash.status === 'fulfilled' ? dash.value : {},
          pipeline: pipe.status === 'fulfilled' ? pipe.value : {},
        });
        setRecent(cands.status === 'fulfilled' ? cands.value?.data || [] : []);
        setUpcoming(ints.status === 'fulfilled' ? ints.value?.data || [] : []);
        const fromDash = dash.status === 'fulfilled' ? (dash.value?.recent_activity || []) : [];
        setActivity(Array.isArray(fromDash) ? fromDash : []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  if (loading) return <DashboardSkeleton />;

  const dash = data?.dashboard || {};
  const totalCandidates = Number(dash.total_candidates ?? 0);
  const activeJobs = Number(dash.active_jobs ?? 0);
  const interviewsThisWeek = Number(dash.interviews_this_week ?? 0);
  const passRate = Number(dash.pass_rate ?? 0);

  const pipeline = data?.pipeline || {};
  const stages: any[] = Array.isArray(pipeline.stages) ? pipeline.stages : [];
  const funnelColors = [
    'from-blue-500 to-blue-600',
    'from-indigo-500 to-indigo-600',
    'from-purple-500 to-purple-600',
    'from-amber-500 to-orange-500',
    'from-green-500 to-emerald-600',
  ];
  const funnel = stages.length > 0
    ? stages.map((s, i) => ({
        stage: s.stage || s.name || `Stage ${i + 1}`,
        count: Number(s.count ?? 0),
        color: funnelColors[i % funnelColors.length],
        width: 100 - i * 15,
      }))
    : [];

  const rawWeekly: any[] = Array.isArray(dash.weekly_data) ? dash.weekly_data : [];
  const weekly = rawWeekly.length > 0
    ? rawWeekly.map((w, i) => ({ label: w.label || DAY_LABELS[i % 7], value: Number(w.value ?? 0) }))
    : [];
  const weeklyMax = weekly.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const weeklyTotal = weekly.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-sm text-gray-500 mt-1">Here&apos;s what&apos;s happening with your hiring today.</p>
        </div>
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
          {(['7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                range === r ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              aria-pressed={range === r}
            >
              {r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}
            </button>
          ))}
        </div>
      </div>

      <Breadcrumb />

      <OnboardingChecklist />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Candidates" value={<AnimatedStat value={totalCandidates} />} icon={<Users className="h-5 w-5" />} />
        <StatsCard title="Active Jobs" value={<AnimatedStat value={activeJobs} />} icon={<Briefcase className="h-5 w-5" />} />
        <StatsCard title="Interviews This Week" value={<AnimatedStat value={interviewsThisWeek} />} icon={<Calendar className="h-5 w-5" />} />
        <StatsCard title="Pass Rate" value={<AnimatedStat value={passRate} suffix="%" />} icon={<Target className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {QUICK.map((q) => {
          const Icon = q.icon;
          return (
            <Link
              key={q.label}
              href={q.href}
              className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-md transition-all"
            >
              <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${q.color} flex items-center justify-center mb-3 group-hover:scale-110 transition`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <p className="text-sm font-semibold text-gray-900">{q.label}</p>
              <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Weekly activity</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Candidates processed per day</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {weekly.length === 0 ? (
              <EmptyState
                icon={<TrendingUp className="h-10 w-10" />}
                title="No activity data yet"
                description="Charts will populate once candidates start flowing through the pipeline."
              />
            ) : (
              <>
                <BarChart data={weekly} max={weeklyMax} />
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-gradient-to-br from-blue-500 to-purple-500" />
                    Candidates
                  </span>
                  <span>
                    Total: <strong className="text-gray-900">{weeklyTotal.toLocaleString()} this period</strong>
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pipeline funnel</CardTitle>
              {funnel.length > 0 && <Badge variant="info" size="sm">{funnel.length} stages</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {funnel.length === 0 ? (
              <EmptyState
                icon={<Activity className="h-10 w-10" />}
                title="No funnel data"
                description="Add candidates and start screening to see your funnel."
              />
            ) : (
              <FunnelChart data={funnel} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600" />
                <CardTitle>Recent activity</CardTitle>
              </div>
              <Link href="/dashboard/analytics" className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="h-10 w-10" />}
                title="No activity yet"
                description="AI actions, screening runs, and workflow events will show up here."
              />
            ) : (
              <ul className="space-y-2.5">
                {activity.slice(0, 6).map((a: any, i: number) => (
                  <li key={a.id || i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition group">
                    <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${a.color || colorForAction(a.action)} flex items-center justify-center shrink-0`}>
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">
                        <span className="font-semibold">{a.user || a.actor || 'System'}</span>{' '}
                        <span className="text-gray-500">{a.action}</span>{' '}
                        <span className="font-semibold">{a.target}</span>
                      </p>
                      {a.meta && <p className="text-xs text-gray-500">{a.meta}</p>}
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3" />
                      {relTime(a.created_at || a.time)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-purple-600" />
                <CardTitle>Upcoming</CardTitle>
              </div>
              {upcoming.length > 0 && <Badge variant="purple" size="sm">{upcoming.length} events</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<Calendar className="h-10 w-10" />}
                title="Nothing scheduled"
                description="Your day is clear."
                action={
                  <Link href="/dashboard/interviews?action=schedule" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    Schedule an interview
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-2">
                {upcoming.map((e: any, i: number) => {
                  const t = new Date(e.scheduled_at);
                  const time = isNaN(t.getTime()) ? '—' : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <li key={e.id || i} className="flex items-center gap-3 p-3 rounded-lg border-l-4 border-purple-500 bg-purple-50/50">
                      <span className="text-sm font-mono font-bold text-gray-700 w-14 shrink-0">{time}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {e.candidate_name || e.candidate?.full_name || 'Candidate'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{e.job_title || e.job?.title || e.type || 'Interview'}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <CardTitle>Recent candidates</CardTitle>
            </div>
            <Link href="/dashboard/candidates" className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-10 w-10" />}
              title="No candidates yet"
              description="Add your first candidate to get started."
              action={
                <Link href="/dashboard/candidates?action=add" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Add candidate →
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {recent.map((c: any) => {
                const name = c.full_name || c.name || 'Unknown';
                const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                const status = (c.status || 'active').replace(/_/g, ' ');
                const statusKey = Object.keys(STATUS_COLORS).find((k) => k.toLowerCase() === status.toLowerCase()) || 'Active';
                return (
                  <Link
                    key={c.id}
                    href={`/dashboard/candidates`}
                    className="group p-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition card-hover"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                        <p className="text-[10px] text-gray-500 truncate">
                          {c.experience_years ? `${c.experience_years}y exp` : c.email || ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant={STATUS_COLORS[statusKey] || 'default'} size="sm">{status}</Badge>
                      {c.score ? <span className="text-xs font-bold text-gray-700">{Math.round(c.score)}%</span> : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
