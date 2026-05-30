'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      const data = await api.listCandidates();
      setCandidates(data.data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  };

  const filtered = candidates.filter(c =>
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Candidates</h1>
        <button onClick={fetchCandidates} className="text-sm text-blue-600 hover:text-blue-700">Refresh</button>
      </div>
      <input type="text" placeholder="Search candidates..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full rounded-lg border px-4 py-2 text-sm" />
      {loading && <p className="text-gray-500">Loading candidates...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {!loading && filtered.length === 0 && <p className="text-gray-500">No candidates found</p>}
      {filtered.map(c => (
        <Card key={c.id} className="p-4 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{c.full_name}</h3>
              <p className="text-sm text-gray-500">{c.email}</p>
            </div>
            <div className="text-right">
              <Badge variant={c.status === 'hired' ? 'success' : 'info'}>{c.status}</Badge>
              {c.match_score && <p className="text-sm mt-1">{Math.round(c.match_score * 100)}% match</p>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
