'use client';
import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboard('7d').then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4">{[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}</div>;

  const stats = [
    { label: 'Total Candidates', value: data?.total_candidates || 0, change: '+12%', color: 'blue' },
    { label: 'Active Jobs', value: data?.active_jobs || 0, change: '+5%', color: 'green' },
    { label: 'Interviews This Week', value: data?.interviews_this_week || 0, change: '+8%', color: 'purple' },
    { label: 'Pass Rate', value: `${data?.pass_rate || 0}%`, change: '+2%', color: 'orange' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl border p-6">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
            <p className="text-sm text-green-600 mt-1">{s.change}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-4">Pipeline Overview</h2>
        <div className="space-y-3">
          {[{label:'Applied',value:100,color:'bg-blue-500'},{label:'Screened',value:75,color:'bg-blue-400'},{label:'Interview',value:45,color:'bg-purple-500'},{label:'Offer',value:20,color:'bg-green-500'}].map(s => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="w-20 text-sm text-gray-600">{s.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-4">
                <div className={`${s.color} h-4 rounded-full`} style={{width:`${s.value}%`}} />
              </div>
              <span className="text-sm font-medium">{s.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
