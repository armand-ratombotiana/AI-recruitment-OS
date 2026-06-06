'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Briefcase,
  MapPin,
  Users,
  Building2,
  Clock,
  TrendingUp,
  Search,
  Pencil,
  Trash2,
  Download,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import { DataTable, EmptyState, Badge, Button, Skeleton, Modal, useToast, Breadcrumb, HelpButton, ConfirmDialog } from '@/components';
import { ExportMenu } from '@/components/ui/export-menu';
import { useBulkActions } from '@/hooks/use-bulk-actions';
import { JobForm } from '@/components/forms';
import type { JobFormValues } from '@/components/forms';
import type { Column } from '@/components/ui/data-table';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';
import { jobsTour } from '@/components/onboarding/tours';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'default' | 'info'> = {
  open: 'success',
  draft: 'warning',
  closed: 'default',
  on_hold: 'info',
};

const formatSalary = (min: number, max: number, locale: string) => {
  if (!min && !max) return '—';
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : 'en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `$${n}`;
    }
  };
  return `${fmt(min)} - ${fmt(max)}`;
};

const STATUS_KEYS = ['open', 'draft', 'closed', 'on_hold'];

export default function JobsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [avgTime, setAvgTime] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const { push, ToastContainer } = useToast();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.listJobs();
      setJobs(d?.data || []);
    } catch (err: any) {
      setError(err?.message || t('jobs.couldntLoad', "Couldn't load jobs"));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.getDashboard('30d')
      .then((d) => {
        const t = d?.avg_time_to_hire_days;
        if (typeof t === 'number') setAvgTime(`${t}d`);
      })
      .catch(() => setAvgTime(null));
  }, []);

  const handleCreate = async (values: JobFormValues) => {
    setSubmitting(true);
    try {
      await api.createJob({
        title: values.title,
        company: values.department,
        location: values.location,
        description: values.description,
        requirements: values.requirements
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        skills: values.skills,
        employment_type: values.employment_type,
        experience_years_min: values.experience_years_min,
        experience_years_max: values.experience_years_max,
        salary_min: values.salary_min,
        salary_max: values.salary_max,
        currency: values.currency,
      });
      setCreateOpen(false);
      push(
        'success',
        t('jobs.created', 'Job "{title}" created successfully').replace('{title}', values.title)
      );
      await load();
    } catch (err: any) {
      const e = err as APIError;
      push('error', e?.message || t('jobs.createFailed', 'Failed to create job'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string, values: JobFormValues) => {
    setSubmitting(true);
    try {
      await api.jobs.update(id, {
        title: values.title,
        location: values.location,
        description: values.description,
        requirements: values.requirements
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        skills: values.skills,
        salary_min: values.salary_min,
        salary_max: values.salary_max,
        status: values.status,
      });
      setEditing(null);
      push(
        'success',
        t('jobs.updatedSuccess', 'Job "{title}" updated').replace('{title}', values.title)
      );
      await load();
    } catch (err: any) {
      const e = err as APIError;
      push('error', e?.message || t('jobs.updateFailed', 'Failed to update job'));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = jobs.filter((j) => {
    if (statusFilter !== 'all' && j.status !== statusFilter) return false;
    if (search && !j.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalApplicants = filtered.reduce((sum, j) => sum + (j.applicants || 0), 0);
  const openCount = jobs.filter((j) => j.status === 'open').length;

  const exportCSV = () => {
    const rows = [['Title', 'Department', 'Location', 'Type', 'Salary Min', 'Salary Max', 'Status', 'Applicants']];
    const data = selected.size > 0 ? filtered.filter((j) => selected.has(j.id)) : filtered;
    data.forEach((j) => rows.push([
      j.title,
      j.department || j.company || '',
      j.location || '',
      j.employment_type || j.type || '',
      String(j.salary_min || 0),
      String(j.salary_max || 0),
      j.status,
      String(j.applicants || 0),
    ]));
    const csv = rows.map((r) => r.map((v) => `"${(v || '').replace(/"/g, '""')}"`).join('\n')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jobs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    push('success', t('jobs.exported', 'Exported {count} job(s) to CSV').replace('{count}', String(data.length)));
  };

  const exportWithFormat = async (format: 'csv' | 'xlsx' | 'pdf') => {
    const ids = selected.size > 0 ? Array.from(selected) : undefined;
    if (format === 'csv') {
      exportCSV();
      return;
    }
    try {
      const res = await api.jobs.export(format, ids);
      if (res?.url) {
        window.open(res.url, '_blank');
        push('success', t('jobs.exportedFormat', 'Exported {count} job(s) to {format}')
          .replace('{count}', String(ids ? ids.length : filtered.length))
          .replace('{format}', format.toUpperCase()));
      } else if (res?.data) {
        const blob = new Blob([res.data], {
          type: format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jobs-${new Date().toISOString().slice(0, 10)}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        push('success', t('jobs.exportedFormat', 'Exported {count} job(s) to {format}')
          .replace('{count}', String(ids ? ids.length : filtered.length))
          .replace('{format}', format.toUpperCase()));
      } else {
        exportCSV();
      }
    } catch (err: any) {
      push('error', err?.message || t('jobs.exportFailed', 'Export failed'));
    }
  };

  const bulkDelete = async () => {
    setBulkDeleting(true);
    const ids = Array.from(selected);
    let removed = 0;
    let failed = 0;
    try {
      const res = await api.jobs.bulkDelete(ids);
      removed = ids.length;
      void res;
    } catch {
      for (const id of ids) {
        try {
          await api.jobs.delete(id);
          removed++;
        } catch {
          failed++;
        }
      }
    }
    setBulkDeleting(false);
    setConfirmBulkDelete(false);
    if (failed > 0) {
      push('error', t('jobs.bulkDeleteFailed', 'Some jobs could not be deleted'));
    } else {
      push('success', t('jobs.removed', 'Removed {count} job(s)').replace('{count}', String(removed)));
    }
    setSelected(new Set());
    await load();
  };

  const columns: Column<any>[] = [
    {
      key: 'select',
      label: '',
      sortable: false,
      render: (j) => (
        <input
          type="checkbox"
          checked={selected.has(j.id)}
          onChange={() => {
            setSelected((p) => {
              const n = new Set(p);
              if (n.has(j.id)) n.delete(j.id);
              else n.add(j.id);
              return n;
            });
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={t('jobs.select', 'Select {title}').replace('{title}', j.title)}
        />
      ),
    },
    {
      key: 'title',
      label: t('jobs.table.position', 'Position'),
      render: (j) => (
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100">{j.title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {j.department || t('jobs.deptGeneral', 'General')}</span>
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {j.location || t('jobs.remote', 'Remote')}</span>
          </p>
        </div>
      ),
    },
    { key: 'type', label: t('jobs.table.type', 'Type'), render: (j) => <span className="text-gray-600 dark:text-gray-300 text-sm">{j.type || t('jobs.fullTime', 'Full-time')}</span> },
    { key: 'salary', label: t('jobs.table.salary', 'Salary'), render: (j) => <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">{formatSalary(j.salary_min, j.salary_max, locale)}</span> },
    {
      key: 'applicants',
      label: t('jobs.table.applicants', 'Applicants'),
      align: 'center',
      render: (j) => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 dark:bg-brand-500/20 dark:text-brand-300">
          <Users className="h-3 w-3" /> {j.applicants || 0}
        </span>
      ),
    },
    {
      key: 'status',
      label: t('jobs.table.status', 'Status'),
      render: (j) => <Badge variant={STATUS_VARIANT[j.status] || 'default'} size="sm" dot>{t(`jobs.statuses.${j.status}`, j.status)}</Badge>,
    },
    {
      key: 'created_at',
      label: t('jobs.table.posted', 'Posted'),
      render: (j) => <span className="text-xs text-gray-500 dark:text-gray-400">{j.created_at || '—'}</span>,
    },
    {
      key: 'row_actions',
      label: '',
      sortable: false,
      render: (j) => (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setEditing(j)}
            className="px-2 py-1 text-[10px] font-semibold rounded bg-gray-50 text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700 inline-flex items-center gap-1"
            aria-label={t('jobs.actions.edit', 'Edit job')}
            title={t('common.edit', 'Edit')}
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            {t('common.edit', 'Edit')}
          </button>
        </div>
      ),
    },
  ];

  const STATUSES = [
    { value: 'all', label: t('candidates.allStatuses', 'All statuses') },
    ...STATUS_KEYS.map((s) => ({ value: s, label: t(`jobs.statuses.${s}`, s) })),
  ];

  return (
    <div className="space-y-6">
      <ToastContainer />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{t('jobs.title', 'Jobs')}</h1>
            <HelpButton tour={jobsTour} />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {interpolate(t('jobs.openTotal', '{open} open · {total} total applicants'), {
              open: String(openCount),
              total: String(totalApplicants),
            })}
          </p>
        </div>
        <Button data-tour="jobs-create" variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setCreateOpen(true); }}>
          {t('jobs.createJob', 'Create job')}
        </Button>
        <ExportMenu onExport={exportWithFormat} disabled={filtered.length === 0} />
      </div>

      <Breadcrumb />

      <div data-tour="jobs-stats" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            <Briefcase className="h-3.5 w-3.5" /> {t('jobs.stats.total', 'Total Jobs')}
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{jobs.length}</p>
        </div>
        <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            <TrendingUp className="h-3.5 w-3.5" /> {t('jobs.stats.open', 'Open')}
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{openCount}</p>
        </div>
        <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            <Users className="h-3.5 w-3.5" /> {t('jobs.stats.applicants', 'Applicants')}
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-brand-400 mt-1">{totalApplicants}</p>
        </div>
        <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            <Clock className="h-3.5 w-3.5" /> {t('jobs.stats.avgTime', 'Avg Time')}
          </div>
          <p className="text-2xl font-bold text-purple-600 dark:text-accent-400 mt-1" aria-label={t('jobs.stats.avgTimeAria', 'Average time to hire: {value}').replace('{value}', avgTime ?? '—')}>{avgTime ?? '—'}</p>
        </div>
      </div>

      <div data-tour="jobs-search" className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('jobs.search', 'Search jobs by title...')}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 dark:placeholder-gray-500"
              aria-label={t('jobs.search', 'Search jobs')}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
            aria-label={t('jobs.filterByStatus', 'Filter by status')}
          >
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {selected.size > 0 && (
        <div data-tour="jobs-bulk" className="bg-blue-50 dark:bg-brand-500/10 border border-blue-200 dark:border-brand-500/30 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-blue-900 dark:text-brand-200">
              {interpolate(t('jobs.selected', '{count} selected'), { count: String(selected.size) })}
            </span>
            <button onClick={() => setSelected(new Set())} className="text-xs text-blue-700 dark:text-brand-300 hover:underline">{t('candidates.clear', 'Clear')}</button>
          </div>
          <div className="flex items-center gap-2">
            <ExportMenu onExport={exportWithFormat} />
            <Button variant="danger" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmBulkDelete(true)}>{t('common.delete', 'Delete')}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy="true">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={56} />)}</div>
      ) : error ? (
        <EmptyState
          icon={<Briefcase className="h-12 w-12" />}
          title={t('jobs.couldntLoad', "Couldn't load jobs")}
          description={error}
          action={<Button variant="primary" onClick={load}>{t('common.retry', 'Retry')}</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-12 w-12" />}
          title={jobs.length === 0 ? t('jobs.noJobsYet', 'No jobs yet') : t('jobs.noJobsFound', 'No jobs found')}
          description={jobs.length === 0 ? t('jobs.noJobsDesc', 'Create your first job posting to start receiving applications.') : t('candidates.tryAdjusting', 'Try adjusting your filters.')}
          action={<Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>{t('jobs.createJob', 'Create job')}</Button>}
        />
      ) : (
        <div data-tour="jobs-row" className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 overflow-hidden">
          <DataTable columns={columns} data={filtered} searchable={false} pageSize={10} rowKey={(j) => j.id} />
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => !submitting && setCreateOpen(false)} title={t('jobs.createTitle', 'Create new job')} description={t('jobs.createDesc', 'Publish a new position. It will start receiving applications immediately.')} size="lg">
        <JobForm
          onCancel={() => setCreateOpen(false)}
          onSubmit={handleCreate}
          submitting={submitting}
          locale={locale}
        />
      </Modal>

      <Modal
        isOpen={!!editing}
        onClose={() => !submitting && setEditing(null)}
        title={t('jobs.editTitle', 'Edit job')}
        description={editing ? t('jobs.editDesc', 'Update "{title}".').replace('{title}', editing.title) : undefined}
        size="lg"
      >
        {editing && (
          <JobForm
            initial={{
              id: editing.id,
              title: editing.title,
              department: editing.company || editing.department,
              location: editing.location,
              employment_type: editing.employment_type || editing.type,
              experience_years_min: editing.experience_years_min,
              experience_years_max: editing.experience_years_max,
              salary_min: editing.salary_min,
              salary_max: editing.salary_max,
              currency: editing.currency,
              description: editing.description,
              requirements: Array.isArray(editing.requirements)
                ? editing.requirements
                : typeof editing.requirements === 'string'
                  ? editing.requirements
                  : '',
              skills: editing.skills,
              status: editing.status,
            }}
            onCancel={() => setEditing(null)}
            onSubmit={(values) => handleUpdate(editing.id, values)}
            submitting={submitting}
            locale={locale}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        onClose={() => !bulkDeleting && setConfirmBulkDelete(false)}
        onConfirm={bulkDelete}
        title={interpolate(t('jobs.confirmBulkDelete.title', 'Delete {count} job(s)?'), { count: String(selected.size) })}
        description={t('jobs.confirmBulkDelete.description', 'This will permanently remove the selected jobs. This action cannot be undone.')}
        confirmLabel={t('jobs.confirmBulkDelete.confirm', 'Delete jobs')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        loading={bulkDeleting}
        destructive
      />
    </div>
  );
}
