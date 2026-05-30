'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [dashboardData, candidatesData] = await Promise.all([
        api.getDashboard(),
        api.listCandidates(),
      ]);
      setStats(dashboardData?.metrics || {});
      setCandidates(candidatesData?.data || []);
    } catch (e) {
      console.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-500">Welcome back. Here is your recruitment overview.</p>
        </div>
        <button onClick={loadData} className="text-sm text-blue-600 hover:text-blue-700">Refresh</button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Candidates', value: stats?.total_candidates || 0, icon: '👥', color: 'bg-blue-100 text-blue-600' },
          { label: 'Open Positions', value: stats?.open_positions || 0, icon: '💼', color: 'bg-green-100 text-green-600' },
          { label: 'Active Interviews', value: stats?.active_interviews || 0, icon: '🎥', color: 'bg-purple-100 text-purple-600' },
          { label: 'Hires This Month', value: stats?.hires_this_month || 0, icon: '🎉', color: 'bg-amber-100 text-amber-600' },
        ].map((stat, i) => (
          <Card key={i} className="p-6 animate-fade-in" style={{animationDelay: `${i * 0.1}s`}}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{loading ? '...' : stat.value}</p>
              </div>
              <div className={`rounded-xl p-3 text-xl ${stat.color}`}>{stat.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Pipeline */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Pipeline Overview</h3>
        <div className="space-y-3">
          {[{ stage: 'Applied', count: 145, color: 'bg-blue-500' }, { stage: 'Screening', count: 89, color: 'bg-cyan-500' },
            { stage: 'Interview', count: 42, color: 'bg-purple-500' }, { stage: 'Evaluation', count: 18, color: 'bg-amber-500' },
            { stage: 'Offer', count: 7, color: 'bg-green-500' }, { stage: 'Hired', count: 3, color: 'bg-emerald-600' }
          ].map(s => (
            <div key={s.stage} className="flex items-center gap-3">
              <span className="w-24 text-sm text-gray-600">{s.stage}</span>
              <div className="flex-1"><div className="h-2 rounded-full bg-gray-100"><div className={`h-2 rounded-full ${s.color}`} style={{width: `${(s.count/145)*100}%`}} /></div></div>
              <span className="w-10 text-right text-sm font-medium">{s.count}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Activity */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        <div className="space-y-4">
          {candidates.slice(0, 5).map(c => (
            <div key={c.id} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-xs font-medium text-blue-700">{c.full_name?.split(' ').map((n: string) => n[0]).join('')}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.full_name}</p>
                <p className="text-xs text-gray-500">{c.status} • {c.seniority_level}</p>
              </div>
              {c.match_score && <span className="text-sm font-medium">{Math.round(c.match_score * 100)}%</span>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
