'use client';

import { useCallback, useState } from 'react';
import { gql } from '@apollo/client';
import { Briefcase, Save, RotateCcw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { useGraphQLMutation } from '@/hooks/use-graphql';

const CREATE_JOB_MUTATION = gql`
  mutation CreateJob($input: JobCreateInput!) {
    createJob(input: $input) {
      id
      title
      department
      location
      description
      status
      employmentType
      salaryMin
      salaryMax
      createdAt
    }
  }
`;

interface JobFormProps {
  className?: string;
  onCreated?: (jobId: string) => void;
}

interface FormState {
  title: string;
  department: string;
  location: string;
  description: string;
  employmentType: string;
  salaryMin: string;
  salaryMax: string;
}

const INITIAL_STATE: FormState = {
  title: '',
  department: '',
  location: '',
  description: '',
  employmentType: 'full-time',
  salaryMin: '',
  salaryMax: '',
};

const DEPARTMENTS = [
  'Engineering',
  'Product',
  'Design',
  'Marketing',
  'Sales',
  'HR',
  'Finance',
  'Operations',
];

const EMPLOYMENT_TYPES = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
];

export function JobForm({ className, onCreated }: JobFormProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);

  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [success, setSuccess] = useState<string | null>(null);

  const [createJob, { loading, error }] = useGraphQLMutation<{
    createJob: { id: string };
  }>(CREATE_JOB_MUTATION, {
    onCompleted: (data: { createJob: { id: string } } | null) => {
      setSuccess(data?.createJob?.id ?? null);
      setForm(INITIAL_STATE);
      if (data?.createJob?.id) onCreated?.(data.createJob.id);
      setTimeout(() => setSuccess(null), 4000);
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const input: Record<string, unknown> = {
        title: form.title,
        department: form.department,
        location: form.location,
        description: form.description,
        employmentType: form.employmentType,
      };
      if (form.salaryMin) input.salaryMin = Number(form.salaryMin);
      if (form.salaryMax) input.salaryMax = Number(form.salaryMax);
      createJob({ variables: { input } });
    },
    [form, createJob]
  );

  const updateField = useCallback(
    (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    },
    []
  );

  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-400/20 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100 dark:placeholder:text-gray-500';
  const labelClass = 'block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900',
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4 dark:border-surface-700">
        <Briefcase className="h-5 w-5 text-pink-500" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('graphql.jobs.createTitle', 'Create Job Posting')}
        </h2>
      </div>

      <div className="space-y-4 p-5">
        {success && (
          <div className="rounded-lg bg-green-50 px-4 py-3 text-xs font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400">
            {t('graphql.jobs.created', 'Job created successfully!')} ID: {success}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
            {error.message}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="job-title" className={labelClass}>
              {t('graphql.jobs.title', 'Job Title')} *
            </label>
            <input
              id="job-title"
              type="text"
              required
              value={form.title}
              onChange={updateField('title')}
              placeholder={t('graphql.jobs.titlePlaceholder', 'e.g. Senior Frontend Engineer')}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="job-dept" className={labelClass}>
              {t('graphql.jobs.department', 'Department')} *
            </label>
            <select
              id="job-dept"
              required
              value={form.department}
              onChange={updateField('department')}
              className={inputClass}
            >
              <option value="">{t('graphql.jobs.selectDepartment', 'Select...')}</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="job-location" className={labelClass}>
              {t('graphql.jobs.location', 'Location')}
            </label>
            <input
              id="job-location"
              type="text"
              value={form.location}
              onChange={updateField('location')}
              placeholder={t('graphql.jobs.locationPlaceholder', 'e.g. Remote, Paris, London')}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="job-type" className={labelClass}>
              {t('graphql.jobs.employmentType', 'Employment Type')}
            </label>
            <select
              id="job-type"
              value={form.employmentType}
              onChange={updateField('employmentType')}
              className={inputClass}
            >
              {EMPLOYMENT_TYPES.map((et) => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="job-sal-min" className={labelClass}>
                {t('graphql.jobs.salaryMin', 'Salary Min')}
              </label>
              <input
                id="job-sal-min"
                type="number"
                value={form.salaryMin}
                onChange={updateField('salaryMin')}
                placeholder="50000"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="job-sal-max" className={labelClass}>
                {t('graphql.jobs.salaryMax', 'Salary Max')}
              </label>
              <input
                id="job-sal-max"
                type="number"
                value={form.salaryMax}
                onChange={updateField('salaryMax')}
                placeholder="80000"
                className={inputClass}
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="job-desc" className={labelClass}>
              {t('graphql.jobs.description', 'Description')}
            </label>
            <textarea
              id="job-desc"
              value={form.description}
              onChange={updateField('description')}
              rows={4}
              placeholder={t('graphql.jobs.descPlaceholder', 'Describe the role, requirements, and benefits...')}
              className={cn(inputClass, 'resize-none')}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-surface-700">
        <button
          type="button"
          onClick={() => setForm(INITIAL_STATE)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-surface-600 dark:text-gray-300 dark:hover:bg-surface-800"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('graphql.jobs.reset', 'Reset')}
        </button>
        <button
          type="submit"
          disabled={loading || !form.title || !form.department}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-pink-600 hover:to-purple-700 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {loading
            ? t('graphql.jobs.creating', 'Creating...')
            : t('graphql.jobs.create', 'Create Job')}
        </button>
      </div>
    </form>
  );
}

export default JobForm;
