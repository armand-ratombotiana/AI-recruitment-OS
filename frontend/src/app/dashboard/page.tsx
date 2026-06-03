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
import { api } from '@/services/api/client';
import { StatsCard, Breadcrumb, Skeleton, SkeletonCard, EmptyState, Badge, useCountUp, useToast } from '@/components';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ACTIVITY = [
  { id: 1, user: 'AI Screener', action: 'screened', target: 'Sarah Chen', meta: 'Senior Engineer', time: '2 min ago', color: 'from-blue-500 to-blue-600' },
  { id: 2, user: 'System', action: 'matched', target: '12 candidates', meta: 'to Data Scientist role', time: '8 min ago', color: 'from-green-500 to-emerald-600' },
  { id: 3, user: 'AI Interviewer', action: 'completed', target: 'Michael Park', meta: 'Score 9.2/10', time: '15 min ago', color: 'from-purple-500 to-purple-600' },
  { id: 4, user: 'Workflow', action: 'auto-emailed', target: '5 candidates', meta: 'Application received', time: '32 min ago', color: 'from-amber-500 to-orange-600' },
  { id: 5, user: 'AI Matcher', action: 'ranked', target: 'Top 10', meta: 'for Product Manager', time: '1 hour ago', color: 'from-pink-500 to-rose-600' },
];

const TODAY = [
  { time: '10:00', title: 'Interview — Sarah Chen', type: 'Engineering', color: 'border-purple-500 bg-purple-50' },
  { time: '13:30', title: 'PPE Review — David Brown', type: 'Coding', color: 'border-green-500 bg-green-50' },
  { time: '15:00', title: 'Debrief — Michael Park', type: 'Meeting', color: 'border-blue-500 bg-blue-50' },
];

const RECENT = [
  { id: 1, name: 'Sarah Chen', role: 'Senior Engineer', status: 'Interviewing', score: 96, initials: 'SC' },
  { id: 2, name: 'Marcus Rivera', role: 'Product Manager', status: 'Screening', score: 89, initials: 'MR' },
  { id: 3, name: 'Emily Nakamura', role: 'CTO Candidate', status: 'Offer', score: 94, initials: 'EN' },
  { id: 4, name: 'David Brown', role: 'Data Scientist', status: 'PPE', score: 87, initials: 'DB' },
  { id: 5, name: 'Lisa Park', role: 'Designer', status: 'Applied', score: 82, initials: 'LP' },
];

const QUICK = [
  { label: 'Add candidate', icon: UserPlus, href: '/dashboard/candidates', color: 'from-blue-500 to-blue-600' },
  { label: 'Create job', icon: Briefcase, href: '/dashboard/jobs', color: 'from-green-500 to-emerald-600' },
  { label: 'Schedule interview', icon: Calendar, href: '/dashboard/interviews', color: 'from-purple-500 to-purple-600' },
  { label: 'Ask AI Copilot', icon: Bot, href: '/dashboard/ai-copilot', color: 'from-amber-500 to-orange-600' },
];

const BAR_DATA = [
  { label: 'Mon', value: 24 },
  { label: 'Tue', value: 38 },
  { label: 'Wed', value: 31 },
  { label: 'Thu', value: 45 },
  { label: 'Fri', value: 52 },
  { label: 'Sat', value: 12 },
  { label: 'Sun', value: 8 },
];

const FUNNEL = [
  { stage: 'Applied', count: 248, color: 'from-blue-500 to-blue-600', width: 100 },
  { stage: 'Screened', count: 184, color: 'from-indigo-500 to-indigo-600', width: 78 },
  { stage: 'Interview', count: 92, color: 'from-purple-500 to-purple-600', width: 52 },
  { stage: 'Offer', count: 34, color: 'from-amber-500 to-orange-500', width: 32 },
  { stage: 'Hired', count: 18, color: 'from-green-500 to-emerald-600', width: 22 },
];

const STATUS_COLORS: Record<string, 'info' | 'warning' | 'success' | 'purple' | 'default'> = {
  Interviewing: 'purple',
  Screening: 'info',
  Offer: 'success',
  PPE: 'warning',
  Applied: 'default',
  Hired: 'success',
  Rejected: 'danger' as any,
};

function AnimatedStat({ value, suffix = '', prefix = '' }: { value: number; suffix?: string; prefix?: string }) {
  const { count, ref } = useCountUp(value);
  return <span ref={ref as any} className="count-up">{prefix}{count.toLocaleString()}{suffix}</span>;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton variant="text" width="40%" height={32} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><SkeletonCard /></div>
        <SkeletonCard />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d');

  useEffect(() => {
    setLoading(true);
    api.getDashboard(range).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [range]);

  if (loading) return <DashboardSkeleton />;

  const totalCandidates = data?.total_candidates ?? 1248;
  const activeJobs = data?.active_jobs ?? 23;
  const interviewsThisWeek = data?.interviews_this_week ?? 47;
  const passRate = data?.pass_rate ?? 68;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Welcome back, John</h1>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Candidates"
          value={<AnimatedStat value={totalCandidates} />}
          change="+12.4%"
          changeType="positive"
          icon={<Users className="h-5 w-5" />}
        />
        <StatsCard
          title="Active Jobs"
          value={<AnimatedStat value={activeJobs} />}
          change="+5.2%"
          changeType="positive"
          icon={<Briefcase className="h-5 w-5" />}
        />
        <StatsCard
          title="Interviews This Week"
          value={<AnimatedStat value={interviewsThisWeek} />}
          change="+8.1%"
          changeType="positive"
          icon={<Calendar className="h-5 w-5" />}
        />
        <StatsCard
          title="Pass Rate"
          value={<AnimatedStat value={passRate} suffix="%" />}
          change="+2.3%"
          changeType="positive"
          icon={<Target className="h-5 w-5" />}
        />
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
              <Badge variant="success" dot>+34% vs last week</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bar-chart" role="img" aria-label="Bar chart of weekly candidates">
              {BAR_DATA.map((b) => (
                <div key={b.label} className="bar-chart-col">
                  <div
                    className="bar-chart-bar"
                    style={{ height: `${(b.value / 60) * 100}%` }}
                    data-value={b.value}
                    role="presentation"
                  />
                  <span className="bar-chart-label">{b.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gradient-to-br from-blue-500 to-purple-500" />Candidates</span>
              <span>Total: <strong className="text-gray-900">210 this week</strong></span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pipeline funnel</CardTitle>
              <Badge variant="info" size="sm">5 stages</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {FUNNEL.map((f, i) => (
                <div key={f.stage} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-700">{f.stage}</span>
                    <span className="text-gray-500">{f.count}</span>
                  </div>
                  <div className={`h-6 rounded-md bg-gradient-to-r ${f.color} flex items-center px-2.5 text-white text-[10px] font-bold transition-all hover:translate-x-1`} style={{ width: `${f.width}%` }} role="progressbar" aria-valuenow={f.count} aria-valuemin={0} aria-valuemax={248} aria-label={`${f.stage}: ${f.count} candidates`}>
                    {i === 0 && f.count}
                  </div>
                </div>
              ))}
            </div>
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
            <ul className="space-y-2.5">
              {ACTIVITY.map((a) => (
                <li key={a.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition group">
                  <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${a.color} flex items-center justify-center shrink-0`}>
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-semibold">{a.user}</span> <span className="text-gray-500">{a.action}</span> <span className="font-semibold">{a.target}</span>
                    </p>
                    <p className="text-xs text-gray-500">{a.meta}</p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3" />{a.time}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-purple-600" />
                <CardTitle>Today</CardTitle>
              </div>
              <Badge variant="purple" size="sm">3 events</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {TODAY.length === 0 ? (
              <EmptyState title="Nothing scheduled" description="Your day is clear." />
            ) : (
              <ul className="space-y-2">
                {TODAY.map((e, i) => (
                  <li key={i} className={`flex items-center gap-3 p-3 rounded-lg border-l-4 ${e.color}`}>
                    <span className="text-sm font-mono font-bold text-gray-700 w-14 shrink-0">{e.time}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{e.title}</p>
                      <p className="text-xs text-gray-500">{e.type}</p>
                    </div>
                  </li>
                ))}
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
          {RECENT.length === 0 ? (
            <EmptyState title="No candidates yet" description="Add your first candidate to get started." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {RECENT.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard/candidates`}
                  className="group p-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition card-hover"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                      {c.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-500 truncate">{c.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge variant={STATUS_COLORS[c.status] || 'default'} size="sm">{c.status}</Badge>
                    <span className="text-xs font-bold text-gray-700">{c.score}%</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
