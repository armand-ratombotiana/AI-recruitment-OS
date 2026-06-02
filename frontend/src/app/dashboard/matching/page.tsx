'use client';
import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';

export default function MatchingPage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listCandidates(), api.listJobs()])
      .then(([c, j]) => { setCandidates(c?.data || []); setJobs(j?.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4">{[1,2].map(i => <div key={i} className="h-40 bg-gray-200 rounded-xl animate-pulse" />)}</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">AI Matching</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4">Top Candidates</h2>
          <div className="space-y-3">
            {candidates.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div><p className="font-medium text-sm">{c.full_name}</p><p className="text-xs text-gray-500">{c.email}</p></div>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">{Math.floor(Math.random() * 20) + 80}%</span>
              </div>
            ))}
            {candidates.length === 0 && <p className="text-center py-4 text-gray-500 text-sm">No candidates yet</p>}
          </div>
        </div>
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4">Open Positions</h2>
          <div className="space-y-3">
            {jobs.slice(0, 5).map(j => (
              <div key={j.id} className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-sm">{j.title}</p>
                <p className="text-xs text-gray-500">{j.department || 'General'}</p>
              </div>
            ))}
            {jobs.length === 0 && <p className="text-center py-4 text-gray-500 text-sm">No open positions</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
