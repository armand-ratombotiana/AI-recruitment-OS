'use client';

import { Users, Briefcase, Calendar, Target, TrendingUp, TrendingDown } from 'lucide-react';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { useCountUp } from '@/hooks';

interface StatsWidgetProps {
  data: {
    totalCandidates: number;
    activeJobs: number;
    interviewsThisWeek: number;
    passRate: number;
    candidatesChangePct?: number;
    jobsChangePct?: number;
    interviewsChangePct?: number;
  };
}

function AnimatedStat({ value, suffix = '' }: { value: number; suffix?: string }) {
  const { count, ref } = useCountUp(value);
  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>} className="count-up">
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

function ChangePill({ pct, label }: { pct?: number; label: string }) {
  if (pct === undefined || pct === null || Number.isNaN(pct)) return null;
  const positive = pct >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <p
      className={`text-[10px] mt-1 flex items-center gap-1 ${
        positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
      }`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {positive ? '+' : ''}
      {pct.toFixed(1)}% {label}
    </p>
  );
}

export function StatsWidget({ data }: StatsWidgetProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const cards = [
    {
      key: 'candidates',
      title: t('dashboard.totalCandidates', 'Total Candidates'),
      value: <AnimatedStat value={data.totalCandidates} />,
      icon: <Users className="h-5 w-5" />,
      change: data.candidatesChangePct,
      label: t('dashboard.vsLastPeriod', 'vs last period'),
    },
    {
      key: 'jobs',
      title: t('dashboard.activeJobs', 'Active Jobs'),
      value: <AnimatedStat value={data.activeJobs} />,
      icon: <Briefcase className="h-5 w-5" />,
      change: data.jobsChangePct,
      label: t('dashboard.vsLastPeriod', 'vs last period'),
    },
    {
      key: 'interviews',
      title: t('dashboard.interviewsThisWeek', 'Interviews This Week'),
      value: <AnimatedStat value={data.interviewsThisWeek} />,
      icon: <Calendar className="h-5 w-5" />,
      change: data.interviewsChangePct,
      label: t('dashboard.vsLastPeriod', 'vs last period'),
    },
    {
      key: 'pass-rate',
      title: t('dashboard.passRate', 'Pass Rate'),
      value: <AnimatedStat value={data.passRate} suffix="%" />,
      icon: <Target className="h-5 w-5" />,
      change: undefined,
      label: t('dashboard.vsLastPeriod', 'vs last period'),
    },
  ];

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      role="region"
      aria-label={t('dashboard.widgets.stats.region', 'Key metrics')}
    >
      {cards.map((c) => (
        <div
          key={c.key}
          className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-6 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{c.title}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{c.value}</p>
              <ChangePill pct={c.change} label={c.label} />
            </div>
            <div className="rounded-xl bg-blue-50 dark:bg-brand-500/10 p-3 text-blue-600 dark:text-brand-400">
              {c.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
