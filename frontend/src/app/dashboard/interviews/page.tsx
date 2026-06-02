'use client';
import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listInterviews().then(d => setInterviews(d?.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Interviews</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Schedule Interview</button>
      </div>
      {loading ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}</div> : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr><th className="px-4 py-3 text-left">Candidate</th><th className="px-4 py-3 text-left">Job</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Status</th></tr></thead>
            <tbody>{interviews.map(i => <tr key={i.id} className="border-b hover:bg-gray-50"><td className="px-4 py-3 font-medium">{i.candidate_name || '-'}</td><td className="px-4 py-3 text-gray-500">{i.job_title || '-'}</td><td className="px-4 py-3">{i.scheduled_at ? new Date(i.scheduled_at).toLocaleDateString() : '-'}</td><td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-700">{i.status || 'scheduled'}</span></td></tr>)}</tbody>
          </table>
          {interviews.length === 0 && <p className="text-center py-8 text-gray-500">No interviews found</p>}
        </div>
      )}
    </div>
  );
}
