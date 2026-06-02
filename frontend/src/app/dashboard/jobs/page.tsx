'use client';
import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listJobs().then(d => setJobs(d?.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Jobs</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Create Job</button>
      </div>
      {loading ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}</div> : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr><th className="px-4 py-3 text-left">Title</th><th className="px-4 py-3 text-left">Department</th><th className="px-4 py-3 text-left">Salary</th><th className="px-4 py-3 text-left">Status</th></tr></thead>
            <tbody>{jobs.map(j => <tr key={j.id} className="border-b hover:bg-gray-50"><td className="px-4 py-3 font-medium">{j.title}</td><td className="px-4 py-3 text-gray-500">{j.department || '-'}</td><td className="px-4 py-3">{j.salary_min && j.salary_max ? `$${j.salary_min.toLocaleString()} - $${j.salary_max.toLocaleString()}` : '-'}</td><td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">{j.status || 'open'}</span></td></tr>)}</tbody>
          </table>
          {jobs.length === 0 && <p className="text-center py-8 text-gray-500">No jobs found</p>}
        </div>
      )}
    </div>
  );
}
