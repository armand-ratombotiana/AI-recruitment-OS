'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const data = await api.listJobs();
      setJobs(data.data || []);
    } catch (e) {
      console.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Jobs</h1>
        <button onClick={fetchJobs} className="text-sm text-blue-600 hover:text-blue-700">Refresh</button>
      </div>
      {loading && <p className="text-gray-500">Loading jobs...</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.map(job => (
          <Card key={job.id} className="p-6 hover:shadow-md transition">
            <Badge variant={job.status === 'open' ? 'success' : 'warning'}>{job.status}</Badge>
            <h3 className="font-semibold mt-2">{job.title}</h3>
            <p className="text-sm text-gray-500">{job.department} • {job.location}</p>
            <p className="text-sm text-gray-500 mt-2">{job.applicants_count} applicants</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
