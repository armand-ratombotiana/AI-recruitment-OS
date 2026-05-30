'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function AnalyticsPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [pipeline, setPipeline] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const [dashData, pipeData] = await Promise.all([
        api.getDashboard(),
        api.getPipelineAnalytics(),
      ]);
      setDashboard(dashData);
      setPipeline(pipeData);
    } catch (e) {
      console.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const metrics = dashboard?.metrics || {};
  const pipelineData = pipeline?.pipeline || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <button onClick={loadAnalytics} className="text-sm text-blue-600 hover:text-blue-700">Refresh</button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Total Candidates', value: metrics.total_candidates || 0, icon: '👥', color: 'bg-blue-100 text-blue-600' },
          { title: 'Open Positions', value: metrics.open_positions || 0, icon: '💼', color: 'bg-green-100 text-green-600' },
          { title: 'Active Interviews', value: metrics.active_interviews || 0, icon: '🎥', color: 'bg-purple-100 text-purple-600' },
          { title: 'Hires This Month', value: metrics.hires_this_month || 0, icon: '🎉', color: 'bg-amber-100 text-amber-600' },
        ].map((kpi, i) => (
          <Card key={i} className="p-6">
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-2 text-xl ${kpi.color}`}>{kpi.icon}</div>
              <div>
                <p className="text-sm text-gray-500">{kpi.title}</p>
                <p className="text-2xl font-bold">{loading ? '...' : kpi.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Pipeline Chart */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Pipeline Distribution</h3>
        <div className="space-y-3">
          {pipelineData.map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-24 text-sm text-gray-600">{item.stage}</span>
              <div className="flex-1">
                <div className="h-3 rounded-full bg-gray-100">
                  <div className="h-3 rounded-full bg-blue-500 transition-all" style={{ width: `${(item.count / (pipelineData[0]?.count || 1)) * 100}%` }} />
                </div>
              </div>
              <span className="w-10 text-right text-sm font-medium">{item.count}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* AI Performance */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">AI Performance</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'AI Evaluation Accuracy', value: '91.5%', target: '95%' },
            { label: 'Candidate Match Rate', value: '87.2%', target: '90%' },
            { label: 'Interview Pass Rate', value: '78.4%', target: '80%' },
            { label: 'Time to Hire', value: '14.7 days', target: '14 days' },
          ].map((metric, i) => (
            <div key={i} className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">{metric.label}</p>
              <p className="text-xl font-bold">{metric.value}</p>
              <p className="text-xs text-gray-400">Target: {metric.target}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Conversion Funnel */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Conversion Funnel</h3>
        <div className="flex items-end gap-4 h-48">
          {[
            { stage: 'Applied', count: 145, color: 'bg-blue-500' },
            { stage: 'Screening', count: 89, color: 'bg-cyan-500' },
            { stage: 'Interview', count: 42, color: 'bg-purple-500' },
            { stage: 'Evaluation', count: 18, color: 'bg-amber-500' },
            { stage: 'Offer', count: 7, color: 'bg-green-500' },
            { stage: 'Hired', count: 3, color: 'bg-emerald-600' },
          ].map((item, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs font-medium">{item.count}</span>
              <div className={`w-full rounded-t-lg ${item.color} transition-all`} style={{ height: `${(item.count / 145) * 100}%`, minHeight: '8px' }} />
              <span className="text-xs text-gray-500">{item.stage}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
