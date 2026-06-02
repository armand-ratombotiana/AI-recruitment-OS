'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DashboardMetrics {
  total_candidates: number;
  open_positions: number;
  active_interviews: number;
  hires_this_month: number;
  pass_rate?: number;
  time_to_hire?: number;
}

interface PipelineStage {
  stage: string;
  count: number;
  conversion_rate?: number;
}

interface AIMetric {
  label: string;
  value: number;
  target: number;
  unit: string;
}

const TIME_RANGES = [
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: '90d', label: '90 Days' },
];

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-6 animate-pulse">
            <div className="space-y-3">
              <div className="h-4 w-24 bg-gray-200 rounded" />
              <div className="h-8 w-16 bg-gray-200 rounded" />
              <div className="h-3 w-12 bg-gray-200 rounded" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [pipeline, setPipeline] = useState<any>(null);
  const [aiPerformance, setAIPerformance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const [dashData, pipeData, aiData] = await Promise.allSettled([
        api.getDashboard(timeRange),
        api.getPipelineAnalytics(),
        api.getAIPerformance(),
      ]);
      if (dashData.status === 'fulfilled') setDashboard(dashData.value);
      if (pipeData.status === 'fulfilled') setPipeline(pipeData.value);
      if (aiData.status === 'fulfilled') setAIPerformance(aiData.value);
    } catch {
      console.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSkeleton />;

  const metrics: DashboardMetrics = dashboard?.metrics || {
    total_candidates: 0,
    open_positions: 0,
    active_interviews: 0,
    hires_this_month: 0,
  };

  const pipelineData: PipelineStage[] = pipeline?.pipeline || [
    { stage: 'Applied', count: 0 },
    { stage: 'Screening', count: 0 },
    { stage: 'Interview', count: 0 },
    { stage: 'Evaluation', count: 0 },
    { stage: 'Offer', count: 0 },
    { stage: 'Hired', count: 0 },
  ];

  const aiMetrics: AIMetric[] = aiPerformance?.metrics || [
    { label: 'AI Evaluation Accuracy', value: 0, target: 95, unit: '%' },
    { label: 'Candidate Match Rate', value: 0, target: 90, unit: '%' },
    { label: 'Interview Pass Rate', value: 0, target: 80, unit: '%' },
    { label: 'Time to Hire', value: 0, target: 14, unit: ' days' },
  ];

  const maxPipeline = Math.max(...pipelineData.map(s => s.count), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex items-center gap-2">
          {TIME_RANGES.map(tr => (
            <button
              key={tr.id}
              onClick={() => setTimeRange(tr.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                timeRange === tr.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Total Candidates', value: metrics.total_candidates, icon: '👥', color: 'bg-blue-100 text-blue-600', trend: '+12%' },
          { title: 'Open Positions', value: metrics.open_positions, icon: '💼', color: 'bg-green-100 text-green-600', trend: '+5%' },
          { title: 'Active Interviews', value: metrics.active_interviews, icon: '🎥', color: 'bg-purple-100 text-purple-600', trend: '+8%' },
          { title: 'Hires This Month', value: metrics.hires_this_month, icon: '🎉', color: 'bg-amber-100 text-amber-600', trend: '+3%' },
        ].map((kpi, i) => (
          <Card key={i} className="p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-3 text-xl ${kpi.color}`}>{kpi.icon}</div>
              <div>
                <p className="text-sm text-gray-500">{kpi.title}</p>
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-xs text-green-600 font-medium">{kpi.trend}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4 h-48">
              {pipelineData.map((item: PipelineStage, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs font-semibold">{item.count}</span>
                  <div
                    className={`w-full rounded-t-lg transition-all ${
                      ['bg-blue-500', 'bg-cyan-500', 'bg-purple-500', 'bg-amber-500', 'bg-green-500', 'bg-emerald-600'][i % 6]
                    }`}
                    style={{ height: `${(item.count / maxPipeline) * 100}%`, minHeight: '8px' }}
                  />
                  <span className="text-xs text-gray-500 text-center">{item.stage}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {aiMetrics.map((metric, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{metric.label}</span>
                    <span className="text-sm font-semibold">
                      {metric.value}{metric.unit}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        metric.value >= metric.target ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min((metric.value / metric.target) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Target: {metric.target}{metric.unit}</span>
                    <span>{Math.round((metric.value / metric.target) * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pipelineData.map((item: PipelineStage, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-24 text-sm text-gray-600 font-medium">{item.stage}</span>
                <div className="flex-1">
                  <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        ['bg-blue-500', 'bg-cyan-500', 'bg-purple-500', 'bg-amber-500', 'bg-green-500', 'bg-emerald-600'][i % 6]
                      }`}
                      style={{ width: `${(item.count / maxPipeline) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="w-12 text-right text-sm font-semibold">{item.count}</span>
                {item.conversion_rate != null && (
                  <span className="w-16 text-right text-xs text-gray-500">{item.conversion_rate}%</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Candidates</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard?.top_candidates?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="pb-3">Name</th>
                    <th className="pb-3">Score</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Skills</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dashboard.top_candidates.map((c: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-xs font-bold text-blue-700">
                              {c.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                            </span>
                          </div>
                          <span className="text-sm font-medium">{c.full_name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-sm font-semibold text-blue-600">{c.match_score ? Math.round(c.match_score * 100) : 0}%</td>
                      <td className="py-3">
                        <Badge variant={c.status === 'hired' ? 'success' : c.status === 'interviewing' ? 'info' : 'default'}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-1">
                          {(c.skills || []).slice(0, 2).map((s: string, j: number) => (
                            <Badge key={j} variant="default">{s}</Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">No candidates data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
