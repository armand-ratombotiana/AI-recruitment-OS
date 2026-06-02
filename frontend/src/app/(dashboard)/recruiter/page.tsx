'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';

export default function RecruiterPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [dashboard, candidates] = await Promise.all([
        api.getDashboard(),
        api.listCandidates(),
      ]);
      setData({ dashboard: dashboard?.metrics, candidates: candidates?.data || [], pipeline: dashboard?.pipeline || [] });
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Recruiter Workspace</h1>
      
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4 animate-pulse"><div className="h-4 w-24 bg-gray-200 rounded mb-2" /><div className="h-8 w-16 bg-gray-200 rounded" /></Card>
              <Card className="p-4 animate-pulse"><div className="h-4 w-24 bg-gray-200 rounded mb-2" /><div className="h-8 w-16 bg-gray-200 rounded" /></Card>
            </div>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4"><p className="text-sm text-gray-500">Active Candidates</p><p className="text-2xl font-bold">{data?.dashboard?.total_candidates || '...'}</p></Card>
            <Card className="p-4"><p className="text-sm text-gray-500">Open Positions</p><p className="text-2xl font-bold">{data?.dashboard?.open_positions || '...'}</p></Card>
          </div>
          
          {/* Pipeline */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Pipeline</h3>
            <div className="space-y-2">
              {(data?.pipeline?.length > 0 ? data.pipeline : [{stage:'Applied',count:0},{stage:'Screening',count:0},{stage:'Interview',count:0},{stage:'Offer',count:0}]).map((p: any) => {
                const maxCount = Math.max(...(data?.pipeline?.map((x: any) => x.count) || [1]), 1);
                return (
                  <div key={p.stage} className="flex items-center gap-2">
                    <span className="w-20 text-sm">{p.stage}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded"><div className="h-2 bg-blue-500 rounded" style={{width:`${(p.count/maxCount)*100}%`}} /></div>
                    <span className="text-sm">{p.count}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {['View Candidates', 'Manage Jobs', 'Start PPE Session', 'View Analytics'].map((action, i) => (
                <button key={i} className="w-full text-left px-3 py-2 rounded-lg border text-sm hover:bg-gray-50">{action}</button>
              ))}
            </div>
          </Card>
          
          <Card className="p-4">
            <h3 className="font-semibold mb-3">AI Insights</h3>
            <div className="space-y-2 text-sm">
              <p className="text-green-600">• Top candidate: Sarah Chen (92% match)</p>
              <p className="text-amber-600">• 3 candidates need follow-up</p>
              <p className="text-blue-600">• 2 interviews scheduled today</p>
            </div>
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}
