'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, Activity, Cpu, Target, BarChart3, Sparkles } from 'lucide-react';
import { api } from '@/services/api/client';
import { StatsCard, Skeleton, SkeletonCard, EmptyState, Badge, Card, CardHeader, CardTitle, CardContent } from '@/components';

function pickNumber(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<{ dashboard: any; pipeline: any; ai: any }>({ dashboard: null, pipeline: null, ai: null });
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('7d');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      api.getDashboard(range),
      api.getPipelineAnalytics(),
      api.getAIPerformance(),
    ]).then(([d, p, a]) => {
      if (cancelled) return;
      setData({
        dashboard: d.status === 'fulfilled' ? d.value : {},
        pipeline: p.status === 'fulfilled' ? p.value : {},
        ai: a.status === 'fulfilled' ? a.value : {},
      });
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  if (loading) {
    return (
      <div className="space-y-6">
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-blue-600" />
          Analytics
        </h1>
        <div className="flex gap-2">
          {['7d', '30d', '90d'].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${range === r ? 'bg-blue-600 text-white' : 'border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Candidates" value={pickNumber(d.total_candidates).toLocaleString()} icon={<Target className="h-5 w-5" />} />
        <StatsCard title="Active Jobs" value={pickNumber(d.active_jobs).toLocaleString()} icon={<TrendingUp className="h-5 w-5" />} />
        <StatsCard title="Interviews" value={pickNumber(d.interviews_this_week).toLocaleString()} icon={<Activity className="h-5 w-5" />} />
        <StatsCard title="Pass Rate" value={`${pickNumber(d.pass_rate)}%`} icon={<Sparkles className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pipeline funnel</CardTitle>
              {stages.length > 0 && <Badge variant="info" size="sm">{stages.length} stages</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {stages.length === 0 ? (
              <EmptyState
                icon={<BarChart3 className="h-10 w-10" />}
                title="No pipeline data"
                description="Once candidates start moving through the funnel, you'll see the breakdown here."
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>AI agent performance</CardTitle>
              {agents.length > 0 && <Badge variant="purple" size="sm">{agents.length} agents</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <EmptyState
                icon={<Cpu className="h-10 w-10" />}
                title="No AI metrics yet"
                description="Run the AI orchestrator to populate per-agent performance stats."
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
                          <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                          {ag.name || ag.type || 'Agent'}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">{tasks.toLocaleString()} tasks</span>
                      </div>
                      <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
                          style={{ width: `${widthPct}%` }}
                          aria-label={`${ag.name || ag.type} completed ${tasks} tasks`}
                        />
                      </div>
                      {typeof ag.confidence === 'number' && (
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">avg confidence {Math.round(ag.confidence * 100)}%</p>
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
          <CardTitle>Productivity signals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Avg time to hire', value: d.avg_time_to_hire_days ? `${d.avg_time_to_hire_days}d` : '—' },
              { label: 'Hires this period', value: d.hires_count ?? 0 },
              { label: 'Rejections', value: d.rejections_count ?? 0 },
              { label: 'Offer acceptance', value: d.offer_acceptance_rate != null ? `${d.offer_acceptance_rate}%` : '—' },
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
