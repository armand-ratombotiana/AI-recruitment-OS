'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';

const STATUS_MAP: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  new: 'info',
  screening: 'warning',
  interviewing: 'info',
  evaluation: 'warning',
  offer: 'success',
  hired: 'success',
  rejected: 'danger',
};

const SKILL_OPTIONS = [
  'JavaScript', 'TypeScript', 'Python', 'React', 'Node.js',
  'Java', 'Go', 'Rust', 'AWS', 'Docker', 'Kubernetes',
  'SQL', 'MongoDB', 'GraphQL', 'REST API',
];

function TableRowSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="py-3 px-4"><div className="h-4 w-32 bg-gray-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-4 w-40 bg-gray-200 rounded" /></td>
      <td className="py-3 px-4"><div className="flex gap-1"><div className="h-5 w-14 bg-gray-200 rounded-full" /><div className="h-5 w-14 bg-gray-200 rounded-full" /></div></td>
      <td className="py-3 px-4"><div className="h-4 w-12 bg-gray-200 rounded" /></td>
      <td className="py-3 px-4"><div className="h-5 w-20 bg-gray-200 rounded-full" /></td>
      <td className="py-3 px-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
    </tr>
  );
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [skillFilter, setSkillFilter] = useState('all');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCandidate, setNewCandidate] = useState({
    full_name: '',
    email: '',
    phone: '',
    skills: [] as string[],
    experience: '',
    seniority_level: 'mid',
    status: 'new',
  });

  const pageSize = 10;

  const fetchCandidates = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (skillFilter !== 'all') params.skills = skillFilter;
      params.page = String(page);
      params.page_size = String(pageSize);
      const data = await api.listCandidates(params);
      setCandidates(data.data || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      setError(e.message || 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, skillFilter, page]);

  useEffect(() => {
    const debounce = setTimeout(() => fetchCandidates(), 300);
    return () => clearTimeout(debounce);
  }, [fetchCandidates]);

  const handleCreate = async () => {
    if (!newCandidate.full_name || !newCandidate.email) return;
    try {
      setCreating(true);
      await api.createCandidate({
        full_name: newCandidate.full_name,
        email: newCandidate.email,
        phone: newCandidate.phone,
        skills: newCandidate.skills,
        experience: newCandidate.experience,
        seniority_level: newCandidate.seniority_level,
        status: newCandidate.status,
      });
      setShowCreateModal(false);
      setNewCandidate({ full_name: '', email: '', phone: '', skills: [], experience: '', seniority_level: 'mid', status: 'new' });
      fetchCandidates();
    } catch (e: any) {
      setError(e.message || 'Failed to create candidate');
    } finally {
      setCreating(false);
    }
  };

  const toggleSkill = (skill: string) => {
    setNewCandidate(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill],
    }));
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Candidates</h1>
          <p className="text-sm text-gray-500">{total} total candidates</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={fetchCandidates}>Refresh</Button>
          <Button onClick={() => setShowCreateModal(true)}>+ Add Candidate</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <input
            type="text"
            placeholder="Search by name, email, or skills..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="new">New</option>
          <option value="screening">Screening</option>
          <option value="interviewing">Interviewing</option>
          <option value="evaluation">Evaluation</option>
          <option value="offer">Offer</option>
          <option value="hired">Hired</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={skillFilter}
          onChange={e => { setSkillFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All Skills</option>
          {SKILL_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
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
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Skills</th>
                <th className="py-3 px-4">Experience</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)}
            </tbody>
          </table>
        </Card>
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={<span className="text-4xl">👥</span>}
          title={search || statusFilter !== 'all' || skillFilter !== 'all' ? 'No candidates match your filters' : 'No candidates yet'}
          description={search || statusFilter !== 'all' || skillFilter !== 'all' ? 'Try adjusting your search or filters.' : 'Add your first candidate to get started.'}
          action={!search && statusFilter === 'all' && skillFilter === 'all' ? <Button onClick={() => setShowCreateModal(true)}>+ Add Candidate</Button> : undefined}
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Skills</th>
                    <th className="py-3 px-4">Experience</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {candidates.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-blue-700">
                              {c.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{c.full_name || 'Unknown'}</p>
                            <p className="text-xs text-gray-400 capitalize">{c.seniority_level || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">{c.email || '—'}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {(c.skills || []).slice(0, 3).map((skill: string, i: number) => (
                            <Badge key={i} variant="default">{skill}</Badge>
                          ))}
                          {(c.skills || []).length > 3 && (
                            <span className="text-xs text-gray-400">+{c.skills.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">{c.experience || '—'}</td>
                      <td className="py-3 px-4">
                        <Badge variant={STATUS_MAP[c.status] || 'default'}>
                          {c.status || 'new'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {c.match_score != null && (
                            <span className="text-sm font-medium text-blue-600">{Math.round(c.match_score * 100)}%</span>
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages} ({total} candidates)
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`px-3 py-1 text-sm rounded-lg ${page === pageNum ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Add New Candidate" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Full Name *</label>
            <input
              value={newCandidate.full_name}
              onChange={e => setNewCandidate(p => ({ ...p, full_name: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input
              type="email"
              value={newCandidate.email}
              onChange={e => setNewCandidate(p => ({ ...p, email: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="john@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input
              value={newCandidate.phone}
              onChange={e => setNewCandidate(p => ({ ...p, phone: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="+1 555 0123"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Experience</label>
            <input
              value={newCandidate.experience}
              onChange={e => setNewCandidate(p => ({ ...p, experience: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="5 years at Google, 2 years at Meta"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Seniority Level</label>
            <select
              value={newCandidate.seniority_level}
              onChange={e => setNewCandidate(p => ({ ...p, seniority_level: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="junior">Junior</option>
              <option value="mid">Mid-Level</option>
              <option value="senior">Senior</option>
              <option value="staff">Staff</option>
              <option value="lead">Lead</option>
              <option value="principal">Principal</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={newCandidate.status}
              onChange={e => setNewCandidate(p => ({ ...p, status: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="new">New</option>
              <option value="screening">Screening</option>
              <option value="interviewing">Interviewing</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Skills</label>
            <div className="flex flex-wrap gap-2">
              {SKILL_OPTIONS.map(skill => (
                <button
                  key={skill}
                  onClick={() => toggleSkill(skill)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    newCandidate.skills.includes(skill)
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newCandidate.full_name || !newCandidate.email}>
              {creating ? 'Creating...' : 'Create Candidate'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
