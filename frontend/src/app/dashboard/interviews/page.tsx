'use client';
import { useState, useMemo } from 'react';

const mockInterviews = [
  { id: '1', candidate: 'John Smith', job: 'Senior Backend Engineer', type: 'technical', status: 'scheduled', date: '2025-01-18T14:00:00Z', is_ai: false, interviewers: ['Sarah Chen', 'Mike Johnson'], duration: 60 },
  { id: '2', candidate: 'Sarah Chen', job: 'Staff Frontend Engineer', type: 'behavioral', status: 'scheduled', date: '2025-01-18T10:00:00Z', is_ai: true, interviewers: ['AI Agent'], duration: 45 },
  { id: '3', candidate: 'David Park', job: 'Senior Backend Engineer', type: 'hr_screening', status: 'completed', date: '2025-01-17T11:00:00Z', is_ai: false, interviewers: ['Emily Davis'], duration: 30 },
  { id: '4', candidate: 'Emily Davis', job: 'ML Engineer', type: 'coding', status: 'in_progress', date: '2025-01-18T09:00:00Z', is_ai: true, interviewers: ['AI Agent'], duration: 90 },
  { id: '5', candidate: 'Alex Thompson', job: 'Senior Backend Engineer', type: 'system_design', status: 'cancelled', date: '2025-01-16T15:00:00Z', is_ai: false, interviewers: ['Mike Johnson'], duration: 60 },
];

const typeLabels: Record<string, string> = {
  hr_screening: 'HR Screening', technical: 'Technical', behavioral: 'Behavioral',
  pair_programming: 'Pair Programming', system_design: 'System Design', coding: 'Coding',
};

const statusColors: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800', in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800', cancelled: 'bg-red-100 text-red-800',
};

export default function InterviewsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    return mockInterviews.filter((i) => {
      const matchSearch = i.candidate.toLowerCase().includes(search.toLowerCase()) || i.job.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || i.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Interviews</h1>
          <p className="text-sm text-gray-500">{filtered.length} interviews • {filtered.filter(i => i.status === 'scheduled').length} upcoming</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Schedule Interview</button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Scheduled', count: 2, color: 'bg-blue-100 text-blue-600' },
          { label: 'In Progress', count: 1, color: 'bg-yellow-100 text-yellow-600' },
          { label: 'Completed', count: 1, color: 'bg-green-100 text-green-600' },
          { label: 'AI Interviews', count: 2, color: 'bg-purple-100 text-purple-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${s.color}`}><span className="text-sm font-bold">•</span></div>
              <div><p className="text-2xl font-bold">{s.count}</p><p className="text-xs text-gray-500">{s.label}</p></div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <input type="text" placeholder="Search interviews..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-md rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm focus:outline-none">
          <option value="all">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border divide-y">
        {filtered.map((interview) => (
          <div key={interview.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
              {interview.is_ai ? <span className="text-purple-600 text-sm font-bold">AI</span> : <span className="text-gray-600 text-sm font-bold">{interview.candidate[0]}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{interview.candidate}</p>
                <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{typeLabels[interview.type]}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[interview.status]}`}>{interview.status}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{interview.job} • {interview.duration}min</p>
            </div>
            <div className="text-right text-sm">
              <p>{new Date(interview.date).toLocaleDateString()}</p>
              <p className="text-xs text-gray-500">{new Date(interview.date).toLocaleTimeString()}</p>
            </div>
            <button className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50">
              {interview.status === 'completed' ? 'View' : 'Join'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
