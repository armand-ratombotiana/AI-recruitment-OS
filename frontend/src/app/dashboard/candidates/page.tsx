'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const mockCandidates = [
  { id: '1', full_name: 'John Smith', email: 'john.smith@email.com', location: 'San Francisco, CA', status: 'screening', seniority: 'Senior', experience: 8, match_score: 87, source: 'linkedin' },
  { id: '2', full_name: 'Sarah Chen', email: 'sarah.chen@email.com', location: 'New York, NY', status: 'interviewing', seniority: 'Staff', experience: 12, match_score: 92, source: 'referral' },
  { id: '3', full_name: 'Mike Johnson', email: 'mike.j@email.com', location: 'Austin, TX', status: 'new', seniority: 'Mid', experience: 4, match_score: 75, source: 'indeed' },
  { id: '4', full_name: 'Emily Davis', email: 'emily.d@email.com', location: 'Remote', status: 'screening', seniority: 'Senior', experience: 7, match_score: 83, source: 'linkedin' },
  { id: '5', full_name: 'Alex Kim', email: 'alex.kim@email.com', location: 'Seattle, WA', status: 'hired', seniority: 'Mid', experience: 5, match_score: 79, source: 'website' },
  { id: '6', full_name: 'Rachel Green', email: 'rachel.g@email.com', location: 'Chicago, IL', status: 'contacted', seniority: 'Junior', experience: 2, match_score: 68, source: 'linkedin' },
  { id: '7', full_name: 'David Park', email: 'david.p@email.com', location: 'Los Angeles, CA', status: 'interviewing', seniority: 'Senior', experience: 9, match_score: 91, source: 'referral' },
  { id: '8', full_name: 'Lisa Wang', email: 'lisa.w@email.com', location: 'San Francisco, CA', status: 'new', seniority: 'Mid', experience: 5, match_score: 77, source: 'indeed' },
  { id: '9', full_name: 'James Wilson', email: 'james.w@email.com', location: 'Boston, MA', status: 'offer', seniority: 'Principal', experience: 15, match_score: 95, source: 'linkedin' },
  { id: '10', full_name: 'Maria Garcia', email: 'maria.g@email.com', location: 'Miami, FL', status: 'rejected', seniority: 'Mid', experience: 3, match_score: 52, source: 'website' },
];

const statusColors: Record<string, string> = {
  new: 'bg-gray-100 text-gray-800', contacted: 'bg-blue-100 text-blue-800',
  screening: 'bg-yellow-100 text-yellow-800', interviewing: 'bg-purple-100 text-purple-800',
  offer: 'bg-green-100 text-green-800', hired: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

export default function CandidatesPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  const filtered = useMemo(() => {
    const result = mockCandidates.filter((c) => {
      const matchSearch = c.full_name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.full_name.localeCompare(b.full_name);
        case 'match': return b.match_score - a.match_score;
        case 'experience': return b.experience - a.experience;
        default: return 0;
      }
    });
    return result;
  }, [search, statusFilter, sortBy]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Candidates</h1>
          <p className="text-sm text-gray-500">{filtered.length} of {mockCandidates.length} candidates</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Add Candidate</button>
      </div>
      <div className="flex items-center gap-3">
        <input type="text" placeholder="Search candidates..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-md rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm focus:outline-none">
          <option value="all">All Status</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="screening">Screening</option>
          <option value="interviewing">Interviewing</option>
          <option value="offer">Offer</option>
          <option value="hired">Hired</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm focus:outline-none">
          <option value="name">Sort by Name</option>
          <option value="match">Sort by Match</option>
          <option value="experience">Sort by Experience</option>
        </select>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Candidate</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seniority</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Experience</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Match</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/dashboard/candidates/${c.id}`)}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-700">{c.full_name[0]}</div>
                    <div>
                      <p className="text-sm font-medium">{c.full_name}</p>
                      <p className="text-xs text-gray-500">{c.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[c.status]}`}>{c.status}</span></td>
                <td className="px-6 py-4 text-sm">{c.seniority}</td>
                <td className="px-6 py-4 text-sm">{c.experience} years</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full"><div className={`h-1.5 rounded-full ${c.match_score >= 80 ? 'bg-green-500' : c.match_score >= 60 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${c.match_score}%` }} /></div>
                    <span className="text-sm font-medium">{c.match_score}%</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{c.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
