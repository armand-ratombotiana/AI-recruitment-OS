'use client';

import { useState, useEffect, useId } from 'react';
import {
  Plus,
  Briefcase,
  MapPin,
  Users,
  Building2,
  Clock,
  TrendingUp,
  Search,
} from 'lucide-react';
import { api } from '@/services/api/client';
import { DataTable, EmptyState, Badge, Button, Skeleton, Modal, useToast, Breadcrumb, HelpButton } from '@/components';
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
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [avgTime, setAvgTime] = useState<string | null>(null);
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

  const handleCreate = async (data: any) => {
    setSubmitting(true);
    try {
      await api.createJob({
        title: data.title,
        department: data.department,
        location: data.location || undefined,
        type: data.type,
        salary_min: data.salary_min,
        salary_max: data.salary_max,
        description: data.description,
        requirements: data.requirements,
        skills: data.skills,
        status: 'open',
      });
      setCreateOpen(false);
      setStep(0);
      push('success', t('jobs.created', `Job "${data.title}" created successfully`).replace('{title}', data.title));
      await load();
    } catch (err: any) {
      push('error', err?.message || t('jobs.couldntLoad', 'Failed to create job'));
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

  const columns: Column<any>[] = [
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
        <Button data-tour="jobs-create" variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setCreateOpen(true); setStep(0); }}>
          {t('jobs.createJob', 'Create job')}
        </Button>
      </div>

      <Breadcrumb />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

      <Modal isOpen={createOpen} onClose={() => !submitting && setCreateOpen(false)} title={t('jobs.wizard.title', 'Create new job')} description={t('jobs.wizard.desc', 'A 3-step wizard to get your job posted in under a minute.')} size="lg">
        <CreateJobWizard
          step={step}
          setStep={setStep}
          onCancel={() => { if (!submitting) { setCreateOpen(false); setStep(0); } }}
          onComplete={handleCreate}
          submitting={submitting}
          locale={locale}
        />
      </Modal>
    </div>
  );
}

function CreateJobWizard({ step, setStep, onCancel, onComplete, submitting, locale }: { step: number; setStep: (n: number) => void; onCancel: () => void; onComplete: (data: any) => void; submitting?: boolean; locale: any }) {
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const titleId = useId();
  const deptId = useId();
  const typeId = useId();
  const locId = useId();
  const salMinId = useId();
  const salMaxId = useId();
  const descId = useId();
  const reqId = useId();
  const skillsId = useId();
  const [form, setForm] = useState({
    title: '',
    department: 'Engineering',
    location: '',
    type: 'Full-time',
    salary_min: '',
    salary_max: '',
    description: '',
    requirements: '',
    skills: '',
  });

  const update = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const next = () => {
    if (step === 0 && !form.title.trim()) return;
    setStep(step + 1);
  };

  const submit = () => {
    if (!form.title.trim()) return;
    onComplete({
      ...form,
      status: 'open',
      salary_min: Number(form.salary_min) || 0,
      salary_max: Number(form.salary_max) || 0,
      skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
    });
  };

  const STEP_LABELS = [
    t('jobs.wizard.stepBasics', 'Basics'),
    t('jobs.wizard.stepRequirements', 'Requirements'),
    t('jobs.wizard.stepReview', 'Review'),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex items-center gap-2 flex-1" aria-current={i === step ? 'step' : undefined}>
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500 dark:bg-surface-700 dark:text-gray-400'}`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-sm font-medium ${i === step ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>{label}</span>
            {i < STEP_LABELS.length - 1 && <div className="flex-1 h-0.5 bg-gray-200 dark:bg-surface-700" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label htmlFor={titleId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('jobs.fields.title', 'Job title *')}</label>
            <input id={titleId} value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="e.g. Senior Full-Stack Engineer" className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={deptId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('jobs.fields.department', 'Department')}</label>
              <select id={deptId} value={form.department} onChange={(e) => update('department', e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100">
                {['Engineering', 'Design', 'Product', 'Data', 'Marketing', 'Sales', 'Operations', 'HR'].map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={typeId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('jobs.fields.type', 'Employment type')}</label>
              <select id={typeId} value={form.type} onChange={(e) => update('type', e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100">
                {['Full-time', 'Part-time', 'Contract', 'Internship'].map((tt) => <option key={tt}>{tt}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={locId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('jobs.fields.location', 'Location')}</label>
            <input id={locId} value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="e.g. San Francisco, CA or Remote" className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={salMinId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('jobs.fields.salaryMin', 'Salary min ($)')}</label>
              <input id={salMinId} type="number" value={form.salary_min} onChange={(e) => update('salary_min', e.target.value)} placeholder="100000" className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor={salMaxId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('jobs.fields.salaryMax', 'Salary max ($)')}</label>
              <input id={salMaxId} type="number" value={form.salary_max} onChange={(e) => update('salary_max', e.target.value)} placeholder="150000" className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100" />
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label htmlFor={descId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('jobs.fields.description', 'Job description')}</label>
            <textarea id={descId} value={form.description} onChange={(e) => update('description', e.target.value)} rows={4} placeholder="What will this person do? What's the mission?" className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none bg-white dark:bg-surface-800 dark:text-gray-100" />
          </div>
          <div>
            <label htmlFor={reqId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('jobs.fields.requirements', 'Requirements')}</label>
            <textarea id={reqId} value={form.requirements} onChange={(e) => update('requirements', e.target.value)} rows={4} placeholder="What skills and experience are required?" className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none bg-white dark:bg-surface-800 dark:text-gray-100" />
          </div>
          <div>
            <label htmlFor={skillsId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('jobs.fields.skills', 'Required skills (comma separated)')}</label>
            <input id={skillsId} value={form.skills} onChange={(e) => update('skills', e.target.value)} placeholder="React, TypeScript, Node.js" className="w-full px-3 py-2 border border-gray-300 dark:border-surface-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-surface-800 dark:text-gray-100" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-brand-500/10 border border-blue-200 dark:border-brand-500/30 rounded-lg p-4 text-sm text-blue-900 dark:text-brand-200">
            <p className="font-semibold mb-1">{t('jobs.wizard.ready', 'Ready to post')}</p>
            <p>{t('jobs.wizard.readyDesc', 'Your job will be published and start receiving applications immediately. The AI screening will rank candidates automatically.')}</p>
          </div>
          <div className="bg-gray-50 dark:bg-surface-800 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">{t('jobs.fields.title', 'Title')}</span><span className="font-medium text-gray-900 dark:text-gray-100">{form.title || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">{t('jobs.fields.department', 'Department')}</span><span className="font-medium text-gray-900 dark:text-gray-100">{form.department}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">{t('jobs.fields.location', 'Location')}</span><span className="font-medium text-gray-900 dark:text-gray-100">{form.location || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">{t('jobs.fields.type', 'Type')}</span><span className="font-medium text-gray-900 dark:text-gray-100">{form.type}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">{t('jobs.table.salary', 'Salary')}</span><span className="font-medium text-gray-900 dark:text-gray-100">{form.salary_min || form.salary_max ? formatSalary(Number(form.salary_min) || 0, Number(form.salary_max) || 0, locale) : '—'}</span></div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-surface-700">
        <Button variant="secondary" onClick={step === 0 ? onCancel : () => setStep(step - 1)} disabled={submitting}>
          {step === 0 ? t('common.cancel', 'Cancel') : t('common.back', 'Back')}
        </Button>
        {step < STEP_LABELS.length - 1 ? (
          <Button variant="primary" onClick={next} disabled={step === 0 && !form.title.trim()}>{t('jobs.wizard.continue', 'Continue')}</Button>
        ) : (
          <Button variant="primary" onClick={submit} loading={submitting} leftIcon={<Plus className="h-4 w-4" />}>{t('jobs.wizard.create', 'Create job')}</Button>
        )}
      </div>
    </div>
  );
}
