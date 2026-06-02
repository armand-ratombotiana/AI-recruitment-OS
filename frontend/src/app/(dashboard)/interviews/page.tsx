'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
  pending: 'default',
};

const TYPE_LABELS: Record<string, string> = {
  technical: 'Technical',
  behavioral: 'Behavioral',
  culture_fit: 'Culture Fit',
  phone_screen: 'Phone Screen',
  panel: 'Panel Interview',
  coding: 'Coding Challenge',
};

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
];

function TableRowSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-gray-200 rounded-full" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
      </td>
      <td className="py-3 px-4"><div className="h-4 w-28 bg-gray-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-5 w-20 bg-gray-200 rounded-full" /></td>
      <td className="py-3 px-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-5 w-20 bg-gray-200 rounded-full" /></td>
      <td className="py-3 px-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
    </tr>
  );
}

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [newInterview, setNewInterview] = useState({
    candidate_id: '',
    job_id: '',
    type: 'technical',
    scheduled_at: '',
    duration_minutes: '60',
  });

  const fetchInterviews = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const data = await api.listInterviews(params);
      setInterviews(data.data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load interviews');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchInterviews();
  }, [fetchInterviews]);

  const openScheduleModal = async () => {
    setShowScheduleModal(true);
    try {
      const [candData, jobData] = await Promise.all([api.listCandidates(), api.listJobs()]);
      setCandidates(candData.data || []);
      setJobs(jobData.data || []);
    } catch { /* ignore */ }
  };

  const handleSchedule = async () => {
    if (!newInterview.candidate_id || !newInterview.job_id || !newInterview.scheduled_at) return;
    try {
      setScheduling(true);
      await api.createInterview({
        candidate_id: newInterview.candidate_id,
        job_id: newInterview.job_id,
        type: newInterview.type,
        scheduled_at: newInterview.scheduled_at,
        duration_minutes: Number(newInterview.duration_minutes),
      });
      setShowScheduleModal(false);
      setNewInterview({ candidate_id: '', job_id: '', type: 'technical', scheduled_at: '', duration_minutes: '60' });
      fetchInterviews();
    } catch (e: any) {
      setError(e.message || 'Failed to schedule interview');
    } finally {
      setScheduling(false);
    }
  };

  const handleStartInterview = async (id: string) => {
    try {
      await api.startInterview(id);
      fetchInterviews();
    } catch (e: any) {
      setError(e.message || 'Failed to start interview');
    }
  };

  const handleCompleteInterview = async (id: string) => {
    try {
      await api.completeInterview(id);
      fetchInterviews();
    } catch (e: any) {
      setError(e.message || 'Failed to complete interview');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Interviews</h1>
          <p className="text-sm text-gray-500">{interviews.length} total interviews</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={fetchInterviews}>Refresh</Button>
          <Button onClick={openScheduleModal}>+ Schedule Interview</Button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        {TABS.map(tab => {
          const count = tab.id === 'all'
            ? interviews.length
            : interviews.filter(i => i.status === tab.id).length;
          return (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                statusFilter === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                statusFilter === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="py-3 px-4">Candidate</th>
                <th className="py-3 px-4">Job</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)}
            </tbody>
          </table>
        </Card>
      ) : interviews.length === 0 ? (
        <EmptyState
          icon={<span className="text-4xl">🎥</span>}
          title={statusFilter !== 'all' ? 'No interviews with this status' : 'No interviews scheduled'}
          description={statusFilter !== 'all' ? 'Try selecting a different filter.' : 'Schedule your first interview to get started.'}
          action={statusFilter === 'all' ? <Button onClick={openScheduleModal}>+ Schedule Interview</Button> : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Candidate</th>
                  <th className="py-3 px-4">Job</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {interviews.map((interview) => (
                  <tr key={interview.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-purple-700">
                            {TYPE_LABELS[interview.type]?.[0] || 'I'}
                          </span>
                        </div>
                        <span className="text-sm font-semibold">
                          {interview.candidate?.name || interview.candidate_name || 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {interview.job?.title || interview.job_title || 'Unknown'}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="info">{TYPE_LABELS[interview.type] || interview.type}</Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : 'TBD'}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={STATUS_VARIANT[interview.status] || 'default'}>
                        {interview.status?.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {interview.status === 'scheduled' && (
                          <button
                            onClick={() => handleStartInterview(interview.id)}
                            className="text-sm text-green-600 hover:text-green-700 font-medium"
                          >
                            Start
                          </button>
                        )}
                        {interview.status === 'in_progress' && (
                          <button
                            onClick={() => handleCompleteInterview(interview.id)}
                            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                          >
                            Complete
                          </button>
                        )}
                        <button className="text-sm text-gray-500 hover:text-blue-600">View</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal isOpen={showScheduleModal} onClose={() => setShowScheduleModal(false)} title="Schedule Interview" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Candidate *</label>
            <select
              value={newInterview.candidate_id}
              onChange={e => setNewInterview(p => ({ ...p, candidate_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select candidate...</option>
              {candidates.map(c => (
                <option key={c.id} value={c.id}>{c.full_name || c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Job *</label>
            <select
              value={newInterview.job_id}
              onChange={e => setNewInterview(p => ({ ...p, job_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select job...</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Interview Type</label>
            <select
              value={newInterview.type}
              onChange={e => setNewInterview(p => ({ ...p, type: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="technical">Technical</option>
              <option value="behavioral">Behavioral</option>
              <option value="culture_fit">Culture Fit</option>
              <option value="phone_screen">Phone Screen</option>
              <option value="panel">Panel</option>
              <option value="coding">Coding Challenge</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Scheduled At *</label>
            <input
              type="datetime-local"
              value={newInterview.scheduled_at}
              onChange={e => setNewInterview(p => ({ ...p, scheduled_at: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
            <input
              type="number"
              value={newInterview.duration_minutes}
              onChange={e => setNewInterview(p => ({ ...p, duration_minutes: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              min="15"
              max="240"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowScheduleModal(false)}>Cancel</Button>
            <Button onClick={handleSchedule} disabled={scheduling || !newInterview.candidate_id || !newInterview.job_id || !newInterview.scheduled_at}>
              {scheduling ? 'Scheduling...' : 'Schedule Interview'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
