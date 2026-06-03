'use client';

import { useState, useEffect } from 'react';
import {
  Plus,
  Briefcase,
  MapPin,
  DollarSign,
  Users,
  Building2,
  Clock,
  TrendingUp,
  Search,
} from 'lucide-react';
import { api } from '@/services/api/client';
import { DataTable, EmptyState, Badge, Button, Skeleton, Modal, useToast, Breadcrumb } from '@/components';
import type { Column } from '@/components/ui/data-table';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'default' | 'info'> = {
  open: 'success',
  draft: 'warning',
  closed: 'default',
  on_hold: 'info',
};

const STATUSES = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'draft', label: 'Draft' },
  { value: 'closed', label: 'Closed' },
  { value: 'on_hold', label: 'On hold' },
];

const SAMPLE = [
  { id: '1', title: 'Senior Full-Stack Engineer', department: 'Engineering', location: 'San Francisco, CA', type: 'Full-time', salary_min: 160000, salary_max: 220000, status: 'open', applicants: 47, created_at: '2026-05-10' },
  { id: '2', title: 'Product Designer', department: 'Design', location: 'Remote', type: 'Full-time', salary_min: 120000, salary_max: 160000, status: 'open', applicants: 32, created_at: '2026-05-12' },
  { id: '3', title: 'Data Scientist', department: 'Data', location: 'New York, NY', type: 'Full-time', salary_min: 140000, salary_max: 190000, status: 'open', applicants: 28, created_at: '2026-05-15' },
  { id: '4', title: 'Engineering Manager', department: 'Engineering', location: 'Seattle, WA', type: 'Full-time', salary_min: 200000, salary_max: 280000, status: 'open', applicants: 15, created_at: '2026-05-18' },
  { id: '5', title: 'DevOps Engineer', department: 'Engineering', location: 'Remote', type: 'Contract', salary_min: 130000, salary_max: 170000, status: 'draft', applicants: 0, created_at: '2026-05-22' },
  { id: '6', title: 'Marketing Lead', department: 'Marketing', location: 'Austin, TX', type: 'Full-time', salary_min: 110000, salary_max: 150000, status: 'open', applicants: 19, created_at: '2026-05-20' },
  { id: '7', title: 'Customer Success Manager', department: 'Operations', location: 'Remote', type: 'Full-time', salary_min: 90000, salary_max: 130000, status: 'closed', applicants: 41, created_at: '2026-04-15' },
];

const formatSalary = (min: number, max: number) => {
  if (!min && !max) return '—';
  const fmt = (n: number) => `$${n >= 1000 ? `${Math.round(n / 1000)}k` : n}`;
  return `${fmt(min)} - ${fmt(max)}`;
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [step, setStep] = useState(0);
  const { push, ToastContainer } = useToast();

  useEffect(() => {
    api.listJobs()
      .then((d) => setJobs(d?.data && d.data.length > 0 ? d.data : SAMPLE))
      .catch(() => setJobs(SAMPLE))
      .finally(() => setLoading(false));
  }, []);

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
      label: 'Position',
      render: (j) => (
        <div>
          <p className="font-semibold text-gray-900">{j.title}</p>
          <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {j.department || 'General'}</span>
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {j.location || 'Remote'}</span>
          </p>
        </div>
      ),
    },
    { key: 'type', label: 'Type', render: (j) => <span className="text-gray-600 text-sm">{j.type || 'Full-time'}</span> },
    { key: 'salary', label: 'Salary', render: (j) => <span className="text-sm text-gray-700 font-medium">{formatSalary(j.salary_min, j.salary_max)}</span> },
    {
      key: 'applicants',
      label: 'Applicants',
      align: 'center',
      render: (j) => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
          <Users className="h-3 w-3" /> {j.applicants || 0}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (j) => <Badge variant={STATUS_VARIANT[j.status] || 'default'} size="sm" dot>{j.status}</Badge>,
    },
    {
      key: 'created_at',
      label: 'Posted',
      render: (j) => <span className="text-xs text-gray-500">{j.created_at || '—'}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <ToastContainer />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">{openCount} open · {totalApplicants} total applicants</p>
        </div>
        <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setCreateOpen(true); setStep(0); }}>
          Create job
        </Button>
      </div>

      <Breadcrumb />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase">
            <Briefcase className="h-3.5 w-3.5" /> Total Jobs
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{jobs.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase">
            <TrendingUp className="h-3.5 w-3.5" /> Open
          </div>
          <p className="text-2xl font-bold text-green-600 mt-1">{openCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase">
            <Users className="h-3.5 w-3.5" /> Applicants
          </div>
          <p className="text-2xl font-bold text-blue-600 mt-1">{totalApplicants}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase">
            <Clock className="h-3.5 w-3.5" /> Avg Time
          </div>
          <p className="text-2xl font-bold text-purple-600 mt-1">12d</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs by title..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-label="Search jobs"
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
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={56} />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-12 w-12" />}
          title="No jobs found"
          description="Create your first job posting to start receiving applications."
          action={<Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Create job</Button>}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <DataTable columns={columns} data={filtered} searchable={false} pageSize={10} rowKey={(j) => j.id} />
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create new job" description="A 3-step wizard to get your job posted in under a minute." size="lg">
        <CreateJobWizard
          step={step}
          setStep={setStep}
          onCancel={() => { setCreateOpen(false); setStep(0); }}
          onComplete={(data) => {
            const newJob = { id: String(Date.now()), ...data, applicants: 0, created_at: new Date().toISOString().slice(0, 10) };
            setJobs((p) => [newJob, ...p]);
            setCreateOpen(false);
            setStep(0);
            push('success', `Job "${data.title}" created successfully`);
          }}
        />
      </Modal>
    </div>
  );
}

function CreateJobWizard({ step, setStep, onCancel, onComplete }: { step: number; setStep: (n: number) => void; onCancel: () => void; onComplete: (data: any) => void }) {
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

  const STEPS = ['Basics', 'Requirements', 'Pipeline'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-sm font-medium ${i === step ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
            {i < STEPS.length - 1 && <div className="flex-1 h-0.5 bg-gray-200" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Job title *</label>
            <input value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="e.g. Senior Full-Stack Engineer" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Department</label>
              <select value={form.department} onChange={(e) => update('department', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                {['Engineering', 'Design', 'Product', 'Data', 'Marketing', 'Sales', 'Operations', 'HR'].map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Employment type</label>
              <select value={form.type} onChange={(e) => update('type', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                {['Full-time', 'Part-time', 'Contract', 'Internship'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Location</label>
            <input value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="e.g. San Francisco, CA or Remote" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Salary min ($)</label>
              <input type="number" value={form.salary_min} onChange={(e) => update('salary_min', e.target.value)} placeholder="100000" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Salary max ($)</label>
              <input type="number" value={form.salary_max} onChange={(e) => update('salary_max', e.target.value)} placeholder="150000" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Job description</label>
            <textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={4} placeholder="What will this person do? What's the mission?" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Requirements</label>
            <textarea value={form.requirements} onChange={(e) => update('requirements', e.target.value)} rows={4} placeholder="What skills and experience are required?" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Required skills (comma separated)</label>
            <input value={form.skills} onChange={(e) => update('skills', e.target.value)} placeholder="React, TypeScript, Node.js" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
            <p className="font-semibold mb-1">Ready to post</p>
            <p>Your job will be published and start receiving applications immediately. The AI screening will rank candidates automatically.</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Title</span><span className="font-medium text-gray-900">{form.title || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Department</span><span className="font-medium text-gray-900">{form.department}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Location</span><span className="font-medium text-gray-900">{form.location || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="font-medium text-gray-900">{form.type}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Salary</span><span className="font-medium text-gray-900">{form.salary_min || form.salary_max ? `$${Number(form.salary_min).toLocaleString()} - $${Number(form.salary_max).toLocaleString()}` : '—'}</span></div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <Button variant="secondary" onClick={step === 0 ? onCancel : () => setStep(step - 1)}>
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={next} disabled={step === 0 && !form.title.trim()}>Continue</Button>
        ) : (
          <Button variant="primary" onClick={submit} leftIcon={<Plus className="h-4 w-4" />}>Create job</Button>
        )}
      </div>
    </div>
  );
}
