'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
  Upload,
} from 'lucide-react';
import { api } from '@/services/api/client';
import { DataTable, EmptyState, Badge, Button, Skeleton, Modal, useToast, Breadcrumb, HelpButton, ConfirmDialog } from '@/components';
import type { Column } from '@/components/ui/data-table';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';
import { candidatesTour } from '@/components/onboarding/tours';

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

const STATUS_VALUES = ['all', 'active', 'screening', 'ppe', 'interviewing', 'offer', 'hired', 'rejected'];

interface Candidate {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  status: string;
  skills: string[];
  experience_years?: number;
  score?: number;
  avatar?: string;
  created_at?: string;
}

export default function CandidatesPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
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
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const { push, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.listCandidates();
      setCandidates(((d?.data || []) as any) as Candidate[]);
    } catch (err: any) {
      setError(err?.message || t('candidates.couldntLoad', "Couldn't load candidates"));
      setCandidates([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleEnrich = async (id: string) => {
    setEnriching((p) => new Set(p).add(id));
    try {
      await api.enrichCandidate(id);
      push('success', t('candidates.enrichStarted', 'AI enrichment started'));
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
      const msg = score
        ? t('candidates.matchCompleteWithScore', 'Match complete — score {score}%').replace('{score}', String((score * 100).toFixed(0)))
        : t('candidates.matchComplete', 'Match complete');
      push('success', msg);
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
      push('success', t('candidates.addedToCandidates', '{name} added to candidates').replace('{name}', data.full_name));
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
    const csv = rows.map((r) => r.map((v) => `"${(v || '').replace(/"/g, '""')}"`).join('\n'));
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidates-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    push('success', t('candidates.exported', 'Exported {count} candidate(s) to CSV').replace('{count}', String(data.length)));
  };

  const bulkDelete = async () => {
    setBulkDeleting(true);
    const ids = Array.from(selected);
    let removed = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await api.candidates.delete(id);
        removed++;
      } catch {
        failed++;
      }
    }
    setBulkDeleting(false);
    setConfirmBulkDelete(false);
    if (failed > 0) {
      push('error', t('candidates.bulkDeleteFailed', 'Some candidates could not be deleted'));
    } else {
      push('success', t('candidates.removed', 'Removed {count} candidate(s)').replace('{count}', String(removed)));
    }
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
          aria-label={interpolate(t('candidates.select', 'Select {name}'), { name: c.full_name })}
        />
      ),
    },
    {
      key: 'full_name',
      label: t('candidates.table.candidate', 'Candidate'),
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {c.full_name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{c.full_name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'location', label: t('candidates.table.location', 'Location'), render: (c) => c.location ? <span className="text-gray-600 dark:text-gray-300 text-xs">{c.location}</span> : <span className="text-gray-400">—</span> },
    {
      key: 'skills',
      label: t('candidates.table.skills', 'Skills'),
      sortable: false,
      render: (c) => (
        <div className="flex flex-wrap gap-1 max-w-xs">
          {c.skills?.slice(0, 3).map((s) => (
            <span key={s} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700 font-medium dark:bg-surface-800 dark:text-gray-200">{s}</span>
          ))}
          {c.skills && c.skills.length > 3 && <span className="text-xs text-gray-400">+{c.skills.length - 3}</span>}
        </div>
      ),
    },
    { key: 'experience_years', label: t('candidates.table.experience', 'Exp.'), align: 'center', render: (c) => c.experience_years ? `${c.experience_years}y` : '—' },
    { key: 'score', label: t('candidates.table.score', 'Score'), align: 'center', render: (c) => c.score ? <span className="font-bold text-gray-900 dark:text-gray-100">{c.score}</span> : '—' },
    {
      key: 'status',
      label: t('candidates.table.status', 'Status'),
      render: (c) => <Badge variant={STATUS_VARIANT[c.status] || 'default'} size="sm" dot>{c.status}</Badge>,
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      render: (c) => (
        <div data-tour="candidates-ai" className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleEnrich(c.id)}
            disabled={enriching.has(c.id)}
            className="px-2 py-1 text-[10px] font-semibold rounded bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50 dark:bg-accent-500/20 dark:text-accent-300 dark:hover:bg-accent-500/30"
            title="AI enrichment"
          >
            {enriching.has(c.id) ? '...' : t('candidates.actions.enrich', 'Enrich')}
          </button>
          <button
            type="button"
            onClick={() => handleMatch(c.id)}
            disabled={matching.has(c.id)}
            className="px-2 py-1 text-[10px] font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:bg-brand-500/20 dark:text-brand-300 dark:hover:bg-brand-500/30"
            title="Run AI matching"
          >
            {matching.has(c.id) ? '...' : t('candidates.actions.match', 'Match')}
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{t('candidates.title', 'Candidates')}</h1>
            <HelpButton tour={candidatesTour} />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {interpolate(t('candidates.totalShown', '{total} total · {shown} shown'), {
              total: String(candidates.length),
              shown: String(filtered.length),
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={(el) => {
              if (el) (window as any).__candidatesFileInput = el;
            }}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                push('info', t('candidates.import.started', 'Import started for {name}').replace('{name}', file.name));
              }
              e.target.value = '';
            }}
          />
          <Button
            data-tour="candidates-import"
            variant="secondary"
            leftIcon={<Upload className="h-4 w-4" />}
            onClick={() => (window as any).__candidatesFileInput?.click()}
          >
            {t('candidates.import', 'Import CSV')}
          </Button>
          <Button data-tour="candidates-add" variant="primary" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
            {t('candidates.addCandidate', 'Add candidate')}
          </Button>
        </div>
      </div>

      <Breadcrumb />

      <div data-tour="candidates-search" className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('candidates.search', 'Search candidates by name or email...')}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 dark:placeholder-gray-500"
              aria-label={t('candidates.searchAria', 'Search candidates')}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
            aria-label={t('jobs.filterByStatus', t('candidates.filterByStatus', 'Filter by status'))}
          >
            {STATUS_VALUES.map((v) => (
              <option key={v} value={v}>
                {v === 'all'
                  ? t('candidates.allStatuses', 'All statuses')
                  : t(`candidates.statuses.${v}`, v.charAt(0).toUpperCase() + v.slice(1))}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg p-1">
            <button onClick={() => setView('table')} className={`p-1.5 rounded ${view === 'table' ? 'bg-blue-50 text-blue-600 dark:bg-brand-500/20 dark:text-brand-300' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-surface-700'}`} aria-label={t('candidates.viewTable', 'Table view')} aria-pressed={view === 'table'}>
              <List className="h-4 w-4" />
            </button>
            <button onClick={() => setView('grid')} className={`p-1.5 rounded ${view === 'grid' ? 'bg-blue-50 text-blue-600 dark:bg-brand-500/20 dark:text-brand-300' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-surface-700'}`} aria-label={t('candidates.viewGrid', 'Grid view')} aria-pressed={view === 'grid'}>
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Filter className="h-3.5 w-3.5" /> {t('candidates.filterSkills', 'Skills:')}
          </div>
          {allSkills.slice(0, 8).map((s) => (
            <button
              key={s}
              onClick={() => setSkillFilter((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s])}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition ${
                skillFilter.includes(s)
                  ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-brand-500/30 dark:border-brand-500/50 dark:text-brand-200'
                  : 'bg-white dark:bg-surface-800 border-gray-200 dark:border-surface-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-surface-700'
              }`}
            >
              {s}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs">
            <label className="text-gray-500 dark:text-gray-400">{t('candidates.minScore', 'Min score:')} <strong className="text-gray-900 dark:text-gray-100">{minScore}</strong></label>
            <input type="range" min="0" max="100" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-24" aria-label="Minimum score" />
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div data-tour="candidates-bulk" className="bg-blue-50 dark:bg-brand-500/10 border border-blue-200 dark:border-brand-500/30 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-blue-900 dark:text-brand-200">
              {interpolate(t('candidates.selected', '{count} selected'), { count: String(selected.size) })}
            </span>
            <button onClick={() => setSelected(new Set())} className="text-xs text-blue-700 dark:text-brand-300 hover:underline">{t('candidates.clear', 'Clear')}</button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={exportCSV}>{t('common.export', 'Export')}</Button>
            <Button variant="danger" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmBulkDelete(true)}>{t('common.delete', 'Delete')}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={56} />)}</div>
      ) : error ? (
        <EmptyState
          icon={<UserPlus className="h-12 w-12" />}
          title={t('candidates.couldntLoad', "Couldn't load candidates")}
          description={error}
          action={<Button variant="primary" onClick={load}>{t('common.retry', 'Retry')}</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="h-12 w-12" />}
          title={candidates.length === 0 ? t('candidates.noCandidatesYet', 'No candidates yet') : t('candidates.noCandidatesFound', 'No candidates found')}
          description={candidates.length === 0 ? t('candidates.noCandidatesDesc', 'Add your first candidate to start building your talent pool.') : t('candidates.tryAdjusting', 'Try adjusting your filters.')}
          action={<Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>{t('candidates.add', 'Add candidate')}</Button>}
        />
      ) : view === 'table' ? (
        <div data-tour="candidates-table" className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 overflow-hidden">
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
              data-tour="candidates-row"
              className="group bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4 hover:border-blue-300 dark:hover:border-brand-500/40 hover:shadow-md transition cursor-pointer"
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
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{c.full_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{c.experience_years}y exp</p>
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
                  <span key={s} className="inline-block px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700 font-medium dark:bg-surface-800 dark:text-gray-200">{s}</span>
                ))}
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-surface-700">
                <Badge variant={STATUS_VARIANT[c.status] || 'default'} size="sm" dot>{c.status}</Badge>
                <span className="text-xs text-gray-400">{c.location}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title={t('candidates.newCandidate', 'Add new candidate')} description={t('candidates.newCandidateDesc', 'Create a candidate profile. They will appear in the screening queue.')}>
        <AddCandidateForm
          onCancel={() => setAddOpen(false)}
          onSubmit={handleCreate}
          submitting={submitting}
          locale={locale}
        />
      </Modal>

      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail?.full_name || t('candidates.title', 'Candidate')} description={detail?.email} size="lg">
        {detail && <CandidateDetail candidate={detail} locale={locale} />}
      </Modal>

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        onClose={() => !bulkDeleting && setConfirmBulkDelete(false)}
        onConfirm={bulkDelete}
        title={interpolate(t('candidates.confirmBulkDelete.title', 'Delete {count} candidate(s)?'), { count: String(selected.size) })}
        description={t('candidates.confirmBulkDelete.description', 'This will permanently remove the selected candidates from your talent pool. This action cannot be undone.')}
        confirmLabel={t('candidates.confirmBulkDelete.confirm', 'Delete candidates')}
        cancelLabel={t('candidates.confirmBulkDelete.cancel', t('common.cancel', 'Cancel'))}
        variant="danger"
        loading={bulkDeleting}
        destructive
      />
    </div>
  );
}

function AddCandidateForm({ onCancel, onSubmit, submitting, locale }: { onCancel: () => void; onSubmit: (data: any) => void; submitting?: boolean; locale: any }) {
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', location: '', skills: '', experience_years: '' });
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) { setError(t('auth.errors.nameAndEmailRequired', 'Name and email are required')); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError(t('auth.errors.emailInvalid', 'Please enter a valid email')); return; }
    setError('');
    onSubmit({ ...form, skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean) });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('candidates.fields.fullName', 'Full name *')}</label>
          <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('candidates.fields.email', 'Email *')}</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('candidates.fields.phone', 'Phone')}</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('candidates.fields.location', 'Location')}</label>
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="City, Country" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('candidates.fields.experience', 'Years of experience')}</label>
          <input type="number" min="0" value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('candidates.fields.skills', 'Skills (comma separated)')}</label>
          <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="React, TypeScript, Node.js" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 dark:border-surface-700">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>{t('common.cancel', 'Cancel')}</Button>
        <Button variant="primary" type="submit" loading={submitting}>{t('candidates.addCandidate', 'Add candidate')}</Button>
      </div>
    </form>
  );
}

function CandidateDetail({ candidate, locale }: { candidate: Candidate; locale: any }) {
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold">
          {candidate.full_name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{candidate.full_name}</h3>
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-1">
            <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {candidate.email}</span>
            {candidate.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {candidate.phone}</span>}
            {candidate.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {candidate.location}</span>}
          </div>
        </div>
        <div className="ml-auto text-right">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{candidate.score || 0}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Match score</p>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">{t('candidates.table.skills', 'Skills')}</h4>
        <div className="flex flex-wrap gap-1.5">
          {candidate.skills?.map((s) => (
            <span key={s} className="px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 font-medium border border-blue-200 dark:bg-brand-500/20 dark:text-brand-300 dark:border-brand-500/30">{s}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-surface-700">
        <div className="p-3 bg-gray-50 dark:bg-surface-800 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">Experience</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5 flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> {candidate.experience_years || 0} years</p>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-surface-800 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('candidates.table.status', 'Status')}</p>
          <div className="mt-1"><Badge variant={STATUS_VARIANT[candidate.status] || 'default'} size="sm" dot>{candidate.status}</Badge></div>
        </div>
      </div>
    </div>
  );
}
