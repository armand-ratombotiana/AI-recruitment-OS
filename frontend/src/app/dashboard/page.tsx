'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  Briefcase,
  Calendar,
  TrendingUp,
  Sparkles,
  UserPlus,
  ChevronRight,
  SlidersHorizontal,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/services/api/client';
import {
  Breadcrumb,
  Skeleton,
  SkeletonCard,
  EmptyState,
  Badge,
  useToast,
  OnboardingChecklist,
  Button,
} from '@/components';
import { AiTypes } from '@/services/api/types';
import { useLocaleStore, translate, formatRelativeTime } from '@/stores/locale-store';
import { useLocalStorage } from '@/hooks';
import { DashboardCustomizer } from '@/components/dashboard/customizer';
import { StatsWidget } from '@/components/dashboard/widgets/StatsWidget';
import { RecentActivityWidget, ActivityItem } from '@/components/dashboard/widgets/RecentActivityWidget';
import { UpcomingInterviewsWidget, InterviewItem } from '@/components/dashboard/widgets/UpcomingInterviewsWidget';
import { PipelineWidget, PipelineStage } from '@/components/dashboard/widgets/PipelineWidget';
import { AITasksWidget } from '@/components/dashboard/widgets/AITasksWidget';
import { QuickActionsWidget } from '@/components/dashboard/widgets/QuickActionsWidget';
import {
  DashboardWidgetConfig,
  DEFAULT_WIDGET_CONFIG,
  STORAGE_KEY,
  WidgetId,
  WIDGET_META,
} from '@/components/dashboard/widgets/config';

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

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function BarChart({ data, max, ariaLabel }: { data: { label: string; value: number }[]; max: number; ariaLabel: string }) {
  return (
    <div className="bar-chart" role="img" aria-label={ariaLabel}>
      {data.map((b) => (
        <div key={b.label} className="bar-chart-col">
          <div
            className="bar-chart-bar"
            style={{ height: `${max > 0 ? (b.value / max) * 100 : 0}%` }}
            data-value={b.value}
            role="presentation"
            aria-label={`${b.label}: ${b.value}`}
          />
          <span className="bar-chart-label dark:text-gray-400" aria-hidden="true">{b.label}</span>
        </div>
      ))}
    </div>
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

export default function DashboardPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { push, ToastContainer } = useToast();

  const [storedConfig, setStoredConfig, configHydrated] = useLocalStorage<DashboardWidgetConfig>(
    STORAGE_KEY,
    DEFAULT_WIDGET_CONFIG
  );
  const config: DashboardWidgetConfig = useMemo(
    () => ({
      order: Array.isArray(storedConfig?.order) && storedConfig.order.length > 0
        ? storedConfig.order
        : DEFAULT_WIDGET_CONFIG.order,
      hidden: Array.isArray(storedConfig?.hidden) ? storedConfig.hidden : [],
    }),
    [storedConfig]
  );

  const [data, setData] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<InterviewItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [agents, setAgents] = useState<AiTypes.Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [customizerOpen, setCustomizerOpen] = useState(false);

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const [dash, pipe, cands, ints, agentList] = await Promise.allSettled([
        api.analytics.getDashboard(range),
        api.analytics.getPipeline(),
        api.candidates.list({ limit: '5', sort: '-created_at' }),
        api.interviews.list({ upcoming: 'true', limit: '5' }),
        api.ai.listAgents(),
      ]);
      setData({
        dashboard: dash.status === 'fulfilled' ? dash.value : {},
        pipeline: pipe.status === 'fulfilled' ? pipe.value : {},
      });
      setRecent(cands.status === 'fulfilled' ? cands.value?.data || [] : []);
      setUpcoming(ints.status === 'fulfilled' ? ints.value?.data || [] : []);
      const fromDash = dash.status === 'fulfilled' ? (dash.value?.recent_activity || []) : [];
      setActivity(Array.isArray(fromDash) ? fromDash : []);
      setAgents(
        agentList.status === 'fulfilled' && Array.isArray(agentList.value?.agents)
          ? agentList.value!.agents
          : []
      );
      setLastRefresh(new Date());
    } catch {
      /* noop */
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load(true), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const handleSaveConfig = useCallback(
    (next: DashboardWidgetConfig) => {
      setStoredConfig(next);
      push('success', t('dashboard.customize.saved', 'Dashboard layout saved'));
    },
    [setStoredConfig, push, t]
  );

  const visibleWidgets = useMemo(
    () => config.order.filter((id) => !config.hidden.includes(id)),
    [config]
  );

  if (loading) {
    return (
      <>
        <DashboardSkeleton />
        <ToastContainer />
      </>
    );
  }

  const dash = data?.dashboard || {};
  const totalCandidates = Number(dash.total_candidates ?? 0);
  const activeJobs = Number(dash.active_jobs ?? 0);
  const interviewsThisWeek = Number(dash.interviews_this_week ?? 0);
  const passRate = Number(dash.pass_rate ?? 0);

  const pipeline = data?.pipeline || {};
  const stages: PipelineStage[] = Array.isArray(pipeline.stages)
    ? pipeline.stages.map((s: any) => ({ stage: s.stage || s.name || '', count: Number(s.count ?? 0) }))
    : [];

  const rawWeekly: any[] = Array.isArray(dash.weekly_data) ? dash.weekly_data : [];
  const weekly = rawWeekly.length > 0
    ? rawWeekly.map((w, i) => ({ label: w.label || DAY_LABELS[i % 7], value: Number(w.value ?? 0) }))
    : [];
  const weeklyMax = weekly.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const weeklyTotal = weekly.reduce((s, d) => s + d.value, 0);

  const candidatesChange = Number(dash.candidates_change_pct ?? NaN);
  const jobsChange = Number(dash.jobs_change_pct ?? NaN);
  const interviewsChange = Number(dash.interviews_change_pct ?? NaN);

  const renderWidget = (id: WidgetId) => {
    switch (id) {
      case 'stats':
        return (
          <StatsWidget
            key="stats"
            data={{
              totalCandidates,
              activeJobs,
              interviewsThisWeek,
              passRate,
              candidatesChangePct: Number.isNaN(candidatesChange) ? undefined : candidatesChange,
              jobsChangePct: Number.isNaN(jobsChange) ? undefined : jobsChange,
              interviewsChangePct: Number.isNaN(interviewsChange) ? undefined : interviewsChange,
            }}
          />
        );
      case 'quick-actions':
        return <QuickActionsWidget key="quick-actions" />;
      case 'recent-activity':
        return <RecentActivityWidget key="recent-activity" activity={activity} />;
      case 'upcoming-interviews':
        return <UpcomingInterviewsWidget key="upcoming-interviews" interviews={upcoming} />;
      case 'pipeline':
        return <PipelineWidget key="pipeline" stages={stages} />;
      case 'ai-tasks':
        return <AITasksWidget key="ai-tasks" agents={agents} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('dashboard.welcomeBack', 'Welcome back')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('dashboard.welcomeSubtitle', "Here's what's happening with your hiring today.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {configHydrated && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomizerOpen(true)}
              aria-label={t('dashboard.customize.open', 'Customize dashboard')}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {t('dashboard.customize.open', 'Customize')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => load(false)}
            aria-label={t('common.refresh', 'Refresh')}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="flex items-center gap-1.5 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg p-1 shadow-sm">
            {(['7d', '30d', '90d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  range === r
                    ? 'bg-blue-600 text-white shadow-sm dark:bg-brand-500'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-surface-700 dark:hover:text-white'
                }`}
                aria-pressed={range === r}
              >
                {r === '7d'
                  ? t('dashboard.last7days', '7 days')
                  : r === '30d'
                    ? t('dashboard.last30days', '30 days')
                    : t('dashboard.last90days', '90 days')}
              </button>
            ))}
          </div>
          {lastRefresh && (
            <span
              className="text-[10px] text-gray-400 dark:text-gray-500 inline-flex items-center gap-1.5"
              aria-live="polite"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 pulse-dot" aria-hidden="true" />
              Live · {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <Breadcrumb />
      <OnboardingChecklist />

      {visibleWidgets.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-surface-700 p-8 text-center bg-white dark:bg-surface-900">
          <EmptyState
            icon={<SlidersHorizontal className="h-10 w-10" />}
            title={t('dashboard.customize.allHidden', 'All widgets are hidden')}
            description={t(
              'dashboard.customize.allHiddenDesc',
              'Open the customizer to bring widgets back into your dashboard.'
            )}
            action={
              <Button variant="primary" onClick={() => setCustomizerOpen(true)}>
                <SlidersHorizontal className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {t('dashboard.customize.open', 'Customize')}
              </Button>
            }
          />
        </div>
      )}

      {configHydrated && (
        <div className="space-y-6">
          {visibleWidgets.map((id) => (
            <section
              key={id}
              aria-label={t(WIDGET_META[id].titleKey, WIDGET_META[id].titleDefault)}
            >
              {renderWidget(id)}
            </section>
          ))}
        </div>
      )}

      {!configHydrated && <DashboardSkeleton />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-surface-700 dark:bg-surface-900">
          <div className="p-6 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {t('dashboard.weeklyActivity', 'Weekly activity')}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('dashboard.weeklyActivitySub', 'Candidates processed per day')}
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 pb-6 pt-0">
            {weekly.length === 0 ? (
              <EmptyState
                icon={<TrendingUp className="h-10 w-10" />}
                title={t('dashboard.noActivityData', 'No activity data yet')}
                description={t(
                  'dashboard.noActivityDesc',
                  'Charts will populate once candidates start flowing through the pipeline.'
                )}
              />
            ) : (
              <>
                <BarChart
                  data={weekly}
                  max={weeklyMax}
                  ariaLabel={t('dashboard.barChartAria', 'Bar chart of weekly candidates')}
                />
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-surface-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-gradient-to-br from-blue-500 to-purple-500" />
                    {t('dashboard.candidatesCount', 'Candidates')}
                  </span>
                  <span>
                    {t('common.of', 'of')}{' '}
                    <strong className="text-gray-900 dark:text-gray-100">
                      {weeklyTotal.toLocaleString()} {t('dashboard.thisPeriod', 'this period')}
                    </strong>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <RecentActivityWidget activity={activity} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-surface-700 dark:bg-surface-900">
        <div className="p-6 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600 dark:text-brand-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('dashboard.recentCandidates', 'Recent candidates')}
              </h3>
            </div>
            <Link
              href="/dashboard/candidates"
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-brand-400 dark:hover:text-brand-300 font-semibold flex items-center gap-1"
            >
              {t('common.viewAll', 'View all')} <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <div className="px-6 pb-6 pt-0">
          {recent.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-10 w-10" />}
              title={t('dashboard.noCandidates', 'No candidates yet')}
              description={t('dashboard.noCandidatesDesc', 'Add your first candidate to get started.')}
              action={
                <Link
                  href="/dashboard/candidates?action=add"
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-brand-400 font-medium"
                >
                  {t('dashboard.addCandidate', 'Add candidate')} →
                </Link>
              }
            />
          ) : (
            <div
              role="list"
              aria-label={t('dashboard.recentCandidatesList', 'Recent candidates list')}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
            >
              {recent.map((c: any) => {
                const name = c.full_name || c.name || 'Unknown';
                const initials = name
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                const status = (c.status || 'active').replace(/_/g, ' ');
                const statusKey =
                  Object.keys(STATUS_COLORS).find((k) => k.toLowerCase() === status.toLowerCase()) ||
                  'Active';
                return (
                  <Link
                    key={c.id}
                    href={`/dashboard/candidates`}
                    role="listitem"
                    aria-label={`${name}${status ? `, ${status}` : ''}${c.score ? `, ${Math.round(c.score)}%` : ''}`}
                    className="group p-3 rounded-lg border border-gray-100 dark:border-surface-700 hover:border-blue-200 hover:bg-blue-50/30 dark:hover:bg-brand-500/10 transition card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold"
                        aria-hidden="true"
                      >
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {name}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                          {c.experience_years ? `${c.experience_years}y exp` : c.email || ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant={STATUS_COLORS[statusKey] || 'default'} size="sm">
                        {status}
                      </Badge>
                      {c.score ? (
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                          {Math.round(c.score)}%
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-surface-700 dark:bg-surface-900 p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('dashboard.customize.footer', 'Tip: you can rearrange widgets to fit how you work.')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t(
                'dashboard.customize.footerDesc',
                'Open the customizer to toggle widgets on or off, then drag to reorder. Your layout is saved on this device.'
              )}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setCustomizerOpen(true)}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {t('dashboard.customize.open', 'Customize')}
            </Button>
          </div>
        </div>
      </div>

      {configHydrated && (
        <DashboardCustomizer
          isOpen={customizerOpen}
          onClose={() => setCustomizerOpen(false)}
          config={config}
          onSave={handleSaveConfig}
        />
      )}

      <ToastContainer />
    </div>
  );
}
