'use client';
import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.listCandidates().then(d => setCandidates(d?.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = candidates.filter(c => !search || c.full_name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Candidates</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Add Candidate</button>
      </div>
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search candidates..." className="w-full px-4 py-2 border rounded-lg text-sm" />
      {loading ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}</div> : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Email</th><th className="px-4 py-3 text-left">Skills</th><th className="px-4 py-3 text-left">Status</th></tr></thead>
            <tbody>{filtered.map(c => <tr key={c.id} className="border-b hover:bg-gray-50"><td className="px-4 py-3 font-medium">{c.full_name}</td><td className="px-4 py-3 text-gray-500">{c.email}</td><td className="px-4 py-3">{Array.isArray(c.skills) ? c.skills.join(', ') : c.skills || '-'}</td><td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">{c.status || 'active'}</span></td></tr>)}</tbody>
          </table>
          {filtered.length === 0 && <p className="text-center py-8 text-gray-500">No candidates found</p>}
        </div>
      )}
    </div>
  );
}
