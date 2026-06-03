'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Download,
  Trash2,
  Filter,
  X,
  UserPlus,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Star,
} from 'lucide-react';
import { api } from '@/services/api/client';
import { DataTable, EmptyState, Badge, Button, Skeleton, Modal, useToast, Breadcrumb } from '@/components';
import type { Column } from '@/components/ui/data-table';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'purple' | 'default' | 'danger'> = {
  active: 'info',
  interviewing: 'purple',
  screening: 'warning',
  offer: 'success',
  hired: 'success',
  rejected: 'danger',
  new: 'default',
  ppe: 'warning',
};

const STATUSES = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'screening', label: 'Screening' },
  { value: 'ppe', label: 'PPE' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
];

interface Candidate {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  location?: string;
  status: string;
  skills: string[];
  experience_years?: number;
  score?: number;
  avatar?: string;
  created_at?: string;
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [statusFilter, setStatusFilter] = useState('all');
  const [skillFilter, setSkillFilter] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<Candidate | null>(null);
  const [enriching, setEnriching] = useState<Set<string>>(new Set());
  const [matching, setMatching] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const { push, ToastContainer } = useToast();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.listCandidates();
      setCandidates(d?.data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load candidates');
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleEnrich = async (id: string) => {
    setEnriching((p) => new Set(p).add(id));
    try {
      await api.enrichCandidate(id);
      push('success', 'AI enrichment started');
      await load();
    } catch (err: any) {
      push('error', err?.message || 'Enrichment failed');
    } finally {
      setEnriching((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    }
  };

  const handleMatch = async (id: string) => {
    setMatching((p) => new Set(p).add(id));
    try {
      const r = await api.matchCandidate(id);
      const score = r?.match_score ?? r?.result?.match_score;
      push('success', `Match complete${score ? ` — score ${(score * 100).toFixed(0)}%` : ''}`);
      await load();
    } catch (err: any) {
      push('error', err?.message || 'Matching failed');
    } finally {
      setMatching((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    }
  };

  const handleCreate = async (data: any) => {
    setSubmitting(true);
    try {
      await api.createCandidate({
        full_name: data.full_name,
        email: data.email,
        phone: data.phone || undefined,
        location: data.location || undefined,
        skills: data.skills,
        experience_years: data.experience_years ? Number(data.experience_years) : 0,
        status: 'active',
      });
      setAddOpen(false);
      push('success', `${data.full_name} added to candidates`);
      await load();
    } catch (err: any) {
      push('error', err?.message || 'Failed to create candidate');
    } finally {
      setSubmitting(false);
    }
  };

  const allSkills = useMemo(() => {
    const s = new Set<string>();
    candidates.forEach((c) => c.skills?.forEach((sk) => s.add(sk)));
    return Array.from(s).sort();
  }, [candidates]);

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (skillFilter.length > 0 && !skillFilter.every((s) => c.skills?.includes(s))) return false;
      if ((c.score || 0) < minScore) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.full_name?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [candidates, statusFilter, skillFilter, minScore, search]);

  const toggleSelect = (id: string) => {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  };

  const exportCSV = () => {
    const rows = [['Name', 'Email', 'Status', 'Score', 'Skills', 'Location']];
    const data = selected.size > 0 ? filtered.filter((c) => selected.has(c.id)) : filtered;
    data.forEach((c) => rows.push([c.full_name, c.email, c.status, String(c.score || 0), c.skills?.join('; ') || '', c.location || '']));
    const csv = rows.map((r) => r.map((v) => `"${(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidates-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    push('success', `Exported ${data.length} candidate(s) to CSV`);
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    let removed = 0;
    for (const id of ids) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/candidates/${id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(api.getToken() ? { Authorization: `Bearer ${api.getToken()}` } : {}),
          },
        });
        removed++;
      } catch {
        // continue with other items
      }
    }
    push('success', `Removed ${removed} candidate(s)`);
    setSelected(new Set());
    await load();
  };

  const columns: Column<Candidate>[] = [
    {
      key: 'select',
      label: '',
      sortable: false,
      render: (c) => (
        <input
          type="checkbox"
          checked={selected.has(c.id)}
          onChange={() => toggleSelect(c.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${c.full_name}`}
        />
      ),
    },
    {
      key: 'full_name',
      label: 'Candidate',
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {c.full_name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <p className="font-medium text-gray-900">{c.full_name}</p>
            <p className="text-xs text-gray-500">{c.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'location', label: 'Location', render: (c) => c.location ? <span className="text-gray-600 text-xs">{c.location}</span> : <span className="text-gray-400">—</span> },
    {
      key: 'skills',
      label: 'Skills',
      sortable: false,
      render: (c) => (
        <div className="flex flex-wrap gap-1 max-w-xs">
          {c.skills?.slice(0, 3).map((s) => (
            <span key={s} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700 font-medium">{s}</span>
          ))}
          {c.skills && c.skills.length > 3 && <span className="text-xs text-gray-400">+{c.skills.length - 3}</span>}
        </div>
      ),
    },
    { key: 'experience_years', label: 'Exp.', align: 'center', render: (c) => c.experience_years ? `${c.experience_years}y` : '—' },
    { key: 'score', label: 'Score', align: 'center', render: (c) => c.score ? <span className="font-bold text-gray-900">{c.score}</span> : '—' },
    {
      key: 'status',
      label: 'Status',
      render: (c) => <Badge variant={STATUS_VARIANT[c.status] || 'default'} size="sm" dot>{c.status}</Badge>,
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      render: (c) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleEnrich(c.id)}
            disabled={enriching.has(c.id)}
            className="px-2 py-1 text-[10px] font-semibold rounded bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50"
            title="AI enrichment"
          >
            {enriching.has(c.id) ? '...' : 'Enrich'}
          </button>
          <button
            type="button"
            onClick={() => handleMatch(c.id)}
            disabled={matching.has(c.id)}
            className="px-2 py-1 text-[10px] font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            title="Run AI matching"
          >
            {matching.has(c.id) ? '...' : 'Match'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <ToastContainer />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500 mt-1">{candidates.length} total · {filtered.length} shown</p>
        </div>
        <Button variant="primary" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
          Add candidate
        </Button>
      </div>

      <Breadcrumb />

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search candidates by name or email..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-label="Search candidates"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
            aria-label="Filter by status"
          >
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1">
            <button onClick={() => setView('table')} className={`p-1.5 rounded ${view === 'table' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`} aria-label="Table view" aria-pressed={view === 'table'}>
              <List className="h-4 w-4" />
            </button>
            <button onClick={() => setView('grid')} className={`p-1.5 rounded ${view === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`} aria-label="Grid view" aria-pressed={view === 'grid'}>
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Filter className="h-3.5 w-3.5" /> Skills:
          </div>
          {allSkills.slice(0, 8).map((s) => (
            <button
              key={s}
              onClick={() => setSkillFilter((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s])}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition ${
                skillFilter.includes(s) ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs">
            <label className="text-gray-500">Min score: <strong className="text-gray-900">{minScore}</strong></label>
            <input type="range" min="0" max="100" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-24" aria-label="Minimum score" />
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-blue-900">{selected.size} selected</span>
            <button onClick={() => setSelected(new Set())} className="text-xs text-blue-700 hover:underline">Clear</button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={exportCSV}>Export</Button>
            <Button variant="danger" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={bulkDelete}>Delete</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={56} />)}</div>
      ) : error ? (
        <EmptyState
          icon={<UserPlus className="h-12 w-12" />}
          title="Couldn't load candidates"
          description={error}
          action={<Button variant="primary" onClick={load}>Retry</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="h-12 w-12" />}
          title={candidates.length === 0 ? "No candidates yet" : "No candidates found"}
          description={candidates.length === 0 ? "Add your first candidate to start building your talent pool." : "Try adjusting your filters."}
          action={<Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>Add candidate</Button>}
        />
      ) : view === 'table' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <DataTable
            columns={columns}
            data={filtered}
            searchable={false}
            pageSize={10}
            onRowClick={(c) => setDetail(c)}
            rowKey={(c) => c.id}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="group bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition cursor-pointer"
              onClick={() => setDetail(c)}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                    {c.full_name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{c.full_name}</p>
                    <p className="text-xs text-gray-500">{c.experience_years}y exp</p>
                  </div>
                </div>
                {c.score && (
                  <div className="flex items-center gap-1 text-amber-500">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    <span className="text-xs font-bold">{c.score}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {c.skills?.slice(0, 3).map((s) => (
                  <span key={s} className="inline-block px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700 font-medium">{s}</span>
                ))}
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <Badge variant={STATUS_VARIANT[c.status] || 'default'} size="sm" dot>{c.status}</Badge>
                <span className="text-xs text-gray-400">{c.location}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add new candidate" description="Create a candidate profile. They will appear in the screening queue.">
        <AddCandidateForm
          onCancel={() => setAddOpen(false)}
          onSubmit={handleCreate}
          submitting={submitting}
        />
      </Modal>

      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail?.full_name || 'Candidate'} description={detail?.email} size="lg">
        {detail && <CandidateDetail candidate={detail} />}
      </Modal>
    </div>
  );
}

function AddCandidateForm({ onCancel, onSubmit, submitting }: { onCancel: () => void; onSubmit: (data: any) => void; submitting?: boolean }) {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', location: '', skills: '', experience_years: '' });
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) { setError('Name and email are required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError('Please enter a valid email'); return; }
    setError('');
    onSubmit({ ...form, skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean) });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name *</label>
          <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="City, Country" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Years of experience</label>
          <input type="number" min="0" value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Skills (comma separated)</label>
          <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="React, TypeScript, Node.js" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button variant="primary" type="submit" loading={submitting}>Add candidate</Button>
      </div>
    </form>
  );
}

function CandidateDetail({ candidate }: { candidate: Candidate }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold">
          {candidate.full_name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">{candidate.full_name}</h3>
          <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
            <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {candidate.email}</span>
            {candidate.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {candidate.phone}</span>}
            {candidate.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {candidate.location}</span>}
          </div>
        </div>
        <div className="ml-auto text-right">
          <p className="text-2xl font-bold text-gray-900">{candidate.score || 0}</p>
          <p className="text-xs text-gray-500">Match score</p>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Skills</h4>
        <div className="flex flex-wrap gap-1.5">
          {candidate.skills?.map((s) => (
            <span key={s} className="px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 font-medium border border-blue-200">{s}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500">Experience</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5 flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> {candidate.experience_years || 0} years</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500">Status</p>
          <div className="mt-1"><Badge variant={STATUS_VARIANT[candidate.status] || 'default'} size="sm" dot>{candidate.status}</Badge></div>
        </div>
      </div>
    </div>
  );
}
