'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';

function TableRowSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="py-3 px-4"><div className="h-4 w-40 bg-gray-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-32 bg-gray-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-5 w-16 bg-gray-200 rounded-full" /></td>
      <td className="py-3 px-4"><div className="h-4 w-8 bg-gray-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
    </tr>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newJob, setNewJob] = useState({
    title: '',
    department: '',
    location: '',
    description: '',
    salary_min: '',
    salary_max: '',
  });

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const data = await api.listJobs(params);
      setJobs(data.data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const debounce = setTimeout(() => fetchJobs(), 300);
    return () => clearTimeout(debounce);
  }, [fetchJobs]);

  const handleCreate = async () => {
    if (!newJob.title) return;
    try {
      setCreating(true);
      await api.createJob({
        ...newJob,
        salary_min: newJob.salary_min ? Number(newJob.salary_min) : undefined,
        salary_max: newJob.salary_max ? Number(newJob.salary_max) : undefined,
      });
      setShowCreateModal(false);
      setNewJob({ title: '', department: '', location: '', description: '', salary_min: '', salary_max: '' });
      fetchJobs();
    } catch (e: any) {
      setError(e.message || 'Failed to create job');
    } finally {
      setCreating(false);
    }
  };

  const filteredJobs = jobs.filter(j => {
    const matchesSearch = !search ||
      j.title?.toLowerCase().includes(search.toLowerCase()) ||
      j.department?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || j.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs</h1>
          <p className="text-sm text-gray-500">{jobs.length} open positions</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={fetchJobs}>Refresh</Button>
          <Button onClick={() => setShowCreateModal(true)}>+ Create Job</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <input
            type="text"
            placeholder="Search jobs by title or department..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Salary Range</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Candidates</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)}
            </tbody>
          </table>
        </Card>
      ) : filteredJobs.length === 0 ? (
        <EmptyState
          icon={<span className="text-4xl">💼</span>}
          title={search || statusFilter !== 'all' ? 'No jobs match your filters' : 'No jobs posted yet'}
          description={search || statusFilter !== 'all' ? 'Try adjusting your search or filters.' : 'Create your first job opening to start attracting candidates.'}
          action={!search && statusFilter === 'all' ? <Button onClick={() => setShowCreateModal(true)}>+ Create Job</Button> : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Salary Range</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Candidates</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <div>
                        <p className="text-sm font-semibold">{job.title || 'Untitled'}</p>
                        {job.location && <p className="text-xs text-gray-400">{job.location}</p>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{job.department || '—'}</td>
                    <td className="py-3 px-4">
                      {(job.salary_min || job.salary_max) ? (
                        <span className="text-sm font-medium text-green-700">
                          ${job.salary_min?.toLocaleString() || '?'}
                          {job.salary_min && job.salary_max ? ' - ' : ''}
                          ${job.salary_max?.toLocaleString() || ''}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={job.status === 'open' ? 'success' : job.status === 'closed' ? 'danger' : 'warning'}>
                        {job.status || 'open'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{job.applicants_count ?? 0}</td>
                    <td className="py-3 px-4">
                      <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Job" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Job Title *</label>
            <input
              value={newJob.title}
              onChange={e => setNewJob(p => ({ ...p, title: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Senior Backend Engineer"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Department</label>
              <input
                value={newJob.department}
                onChange={e => setNewJob(p => ({ ...p, department: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Engineering"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input
                value={newJob.location}
                onChange={e => setNewJob(p => ({ ...p, location: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Remote / NYC"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={newJob.description}
              onChange={e => setNewJob(p => ({ ...p, description: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={4}
              placeholder="Job description and requirements..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Min Salary ($)</label>
              <input
                type="number"
                value={newJob.salary_min}
                onChange={e => setNewJob(p => ({ ...p, salary_min: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="80000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Salary ($)</label>
              <input
                type="number"
                value={newJob.salary_max}
                onChange={e => setNewJob(p => ({ ...p, salary_max: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="120000"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newJob.title}>
              {creating ? 'Creating...' : 'Create Job'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
