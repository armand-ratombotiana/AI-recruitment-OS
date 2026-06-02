'use client';
import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('7d');

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getDashboard(range), api.getPipelineAnalytics(), api.getAIPerformance()]).then(([d, p, a]) => setData({ dashboard: d, pipeline: p, ai: a })).catch(() => {}).finally(() => setLoading(false));
  }, [range]);

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex gap-2">
          {['7d','30d','90d'].map(r => <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 rounded-lg text-sm ${range === r ? 'bg-blue-600 text-white' : 'border hover:bg-gray-50'}`}>{r}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-6"><p className="text-sm text-gray-500">Total Candidates</p><p className="text-3xl font-bold">{data?.dashboard?.total_candidates || 0}</p></div>
        <div className="bg-white rounded-xl border p-6"><p className="text-sm text-gray-500">Active Jobs</p><p className="text-3xl font-bold">{data?.dashboard?.active_jobs || 0}</p></div>
        <div className="bg-white rounded-xl border p-6"><p className="text-sm text-gray-500">Pass Rate</p><p className="text-3xl font-bold">{data?.dashboard?.pass_rate || 0}%</p></div>
      </div>
    </div>
  );
}
