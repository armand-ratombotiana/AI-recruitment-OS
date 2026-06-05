'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, Activity, Cpu, Target, BarChart3, Sparkles, AlertCircle } from 'lucide-react';
import { api } from '@/services/api/client';
import { StatsCard, Skeleton, SkeletonCard, EmptyState, Badge, Card, CardHeader, CardTitle, CardContent } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';

function pickNumber(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function AnalyticsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [data, setData] = useState<{ dashboard: any; pipeline: any; ai: any }>({ dashboard: null, pipeline: null, ai: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState('7d');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      api.getDashboard(range),
      api.getPipelineAnalytics(),
      api.getAIPerformance(),
    ]).then(([d, p, a]) => {
      if (cancelled) return;
      if (d.status === 'rejected') setError(d.reason?.message || t('analytics.couldntLoad', "Couldn't load analytics"));
      setData({
        dashboard: d.status === 'fulfilled' ? d.value : {},
        pipeline: p.status === 'fulfilled' ? p.value : {},
        ai: a.status === 'fulfilled' ? a.value : {},
      });
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, t]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <Skeleton variant="text" width="30%" height={32} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonCard />
      </div>
    );
  }

  const d = data.dashboard || {};
  const p = data.pipeline || {};
  const a = data.ai || {};

  const stages: any[] = Array.isArray(p.stages) ? p.stages : [];
  const maxStage = stages.reduce((m: number, s: any) => Math.max(m, pickNumber(s.count, 0)), 0) || 1;

  const agents: any[] = Array.isArray(a.agents) ? a.agents : (Array.isArray(a) ? a : []);
  const aiMaxTasks = agents.reduce((m: number, ag: any) => Math.max(m, pickNumber(ag.tasks_completed ?? ag.completed ?? 0)), 0) || 1;

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
          <BarChart3 className="h-6 w-6 text-blue-600 dark:text-brand-400" aria-hidden="true" />
          {t('analytics.title', 'Analytics')}
        </h1>
        <div
          role="group"
          aria-label={t('analytics.rangeLabel', 'Time range')}
          className="flex gap-1 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg p-1 shadow-sm"
        >
          {['7d', '30d', '90d'].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                range === r
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-surface-700 dark:hover:text-white'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title={t('analytics.stats.totalCandidates', 'Total Candidates')}
          value={pickNumber(d.total_candidates).toLocaleString()}
          icon={<Target className="h-5 w-5" />}
        />
        <StatsCard
          title={t('analytics.stats.activeJobs', 'Active Jobs')}
          value={pickNumber(d.active_jobs).toLocaleString()}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatsCard
          title={t('analytics.stats.interviews', 'Interviews')}
          value={pickNumber(d.interviews_this_week).toLocaleString()}
          icon={<Activity className="h-5 w-5" />}
        />
        <StatsCard
          title={t('analytics.stats.passRate', 'Pass Rate')}
          value={`${pickNumber(d.pass_rate)}%`}
          icon={<Sparkles className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-tour="analytics-funnel">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('analytics.funnel', 'Pipeline funnel')}</CardTitle>
              {stages.length > 0 && <Badge variant="info" size="sm">{stages.length} {t('analytics.stages', 'stages')}</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {stages.length === 0 ? (
              <EmptyState
                icon={<BarChart3 className="h-10 w-10" />}
                title={t('analytics.noPipeline', 'No pipeline data')}
                description={t('analytics.noPipelineDesc', "Once candidates start moving through the funnel, you'll see the breakdown here.")}
              />
            ) : (
              <div className="space-y-3">
                {stages.map((s: any, i: number) => {
                  const count = pickNumber(s.count, 0);
                  const widthPct = Math.max(8, (count / maxStage) * 100);
                  const colors = ['from-blue-500 to-blue-600', 'from-indigo-500 to-indigo-600', 'from-purple-500 to-purple-600', 'from-amber-500 to-orange-500', 'from-green-500 to-emerald-600'];
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">{s.stage || s.name || `Stage ${i + 1}`}</span>
                        <span className="text-gray-500 dark:text-gray-400">{count.toLocaleString()}</span>
                      </div>
                      <div
                        className={`h-7 rounded-md bg-gradient-to-r ${colors[i % colors.length]} flex items-center px-3 text-white text-xs font-bold`}
                        style={{ width: `${widthPct}%` }}
                        role="progressbar"
                        aria-valuenow={count}
                        aria-valuemin={0}
                        aria-valuemax={maxStage}
                        aria-label={`${s.stage || s.name || `Stage ${i + 1}`}: ${count} candidates`}
                      >
                        {i === 0 ? count.toLocaleString() : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-tour="analytics-ai">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('analytics.aiPerformance', 'AI agent performance')}</CardTitle>
              {agents.length > 0 && <Badge variant="purple" size="sm">{agents.length} {t('analytics.agents', 'agents')}</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <EmptyState
                icon={<Cpu className="h-10 w-10" />}
                title={t('analytics.noAiMetrics', 'No AI metrics yet')}
                description={t('analytics.noAiMetricsDesc', 'Run the AI orchestrator to populate per-agent performance stats.')}
              />
            ) : (
              <div className="space-y-3">
                {agents.slice(0, 10).map((ag: any, i: number) => {
                  const tasks = pickNumber(ag.tasks_completed ?? ag.completed, 0);
                  const widthPct = Math.max(4, (tasks / aiMaxTasks) * 100);
                  return (
                    <div key={ag.id || ag.type || i} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold text-gray-700 dark:text-gray-300 truncate flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-purple-500" aria-hidden="true" />
                          {ag.name || ag.type || 'Agent'}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">{tasks.toLocaleString()} {t('analytics.tasks', 'tasks')}</span>
                      </div>
                      <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden" role="progressbar" aria-valuenow={tasks} aria-valuemin={0} aria-valuemax={aiMaxTasks} aria-label={`${ag.name || ag.type} completed ${tasks} tasks`}>
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      {typeof ag.confidence === 'number' && (
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">{t('analytics.avgConfidence', 'avg confidence')} {Math.round(ag.confidence * 100)}%</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('analytics.productivity', 'Productivity signals')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: t('analytics.metrics.avgTimeToHire', 'Avg time to hire'),
                value: d.avg_time_to_hire_days ? `${d.avg_time_to_hire_days}d` : '—',
              },
              {
                label: t('analytics.metrics.hires', 'Hires this period'),
                value: d.hires_count ?? 0,
              },
              {
                label: t('analytics.metrics.rejections', 'Rejections'),
                value: d.rejections_count ?? 0,
              },
              {
                label: t('analytics.metrics.offerAcceptance', 'Offer acceptance'),
                value: d.offer_acceptance_rate != null ? `${d.offer_acceptance_rate}%` : '—',
              },
            ].map((s, i) => (
              <div key={i} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
