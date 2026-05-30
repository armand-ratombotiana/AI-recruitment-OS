'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';

const mockJobs = [
  { id: '1', title: 'Senior Backend Engineer', department: 'Engineering', location: 'San Francisco, CA', remote: 'hybrid', status: 'open', applicants: 24, salary: '$180k-$220k', description: 'Build scalable distributed systems.' },
  { id: '2', title: 'Staff Frontend Engineer', department: 'Engineering', location: 'Remote', remote: 'remote', status: 'open', applicants: 18, salary: '$200k-$250k', description: 'Lead frontend architecture.' },
  { id: '3', title: 'ML Engineer', department: 'AI Platform', location: 'New York, NY', remote: 'onsite', status: 'open', applicants: 31, salary: '$190k-$240k', description: 'Build ML models for recruitment.' },
  { id: '4', title: 'DevOps Engineer', department: 'Infrastructure', location: 'Austin, TX', remote: 'hybrid', status: 'draft', applicants: 0, salary: '$160k-$190k', description: 'Manage cloud infrastructure.' },
  { id: '5', title: 'Product Manager', department: 'Product', location: 'San Francisco, CA', remote: 'hybrid', status: 'closed', applicants: 42, salary: '$170k-$210k', description: 'Drive product strategy.' },
];

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800', open: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800', closed: 'bg-red-100 text-red-800',
};

export default function JobsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const filtered = useMemo(() => {
    return mockJobs.filter((j) => {
      const matchSearch = j.title.toLowerCase().includes(search.toLowerCase()) || j.department.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || j.status === statusFilter.toLowerCase();
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs</h1>
          <p className="text-sm text-gray-500">{filtered.length} positions • {filtered.filter(j => j.status === 'open').length} active</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Create Job</button>
      </div>
      <div className="flex items-center gap-3">
        <input type="text" placeholder="Search jobs..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-md rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm focus:outline-none">
          <option value="All">All Status</option>
          <option value="Draft">Draft</option>
          <option value="Open">Open</option>
          <option value="Paused">Paused</option>
          <option value="Closed">Closed</option>
        </select>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((job) => (
          <Link key={job.id} href={`/dashboard/jobs/${job.id}`}
            className="bg-white rounded-xl border p-6 hover:shadow-md transition-all cursor-pointer group">
            <div className="flex items-start justify-between mb-3">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[job.status]}`}>{job.status}</span>
            </div>
            <h3 className="text-lg font-semibold mb-1 group-hover:text-blue-600 transition-colors">{job.title}</h3>
            <p className="text-sm text-gray-500 mb-1">{job.department}</p>
            <p className="text-sm text-gray-500 mb-4 line-clamp-2">{job.description}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-4">
              <span>📍 {job.location}</span>
              <span>🏠 {job.remote}</span>
              <span className="text-green-600 font-medium">{job.salary}</span>
            </div>
            <div className="border-t pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">👥 {job.applicants} applicants</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
