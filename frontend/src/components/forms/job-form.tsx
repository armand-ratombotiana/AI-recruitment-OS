'use client';

import { useState, useId, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';
import { Button, InputField, TextareaField, SelectField } from '@/components';
import type { Locale } from '@/stores/locale-store';
import { translate } from '@/stores/locale-store';

const DEPARTMENT_OPTIONS = [
  'Engineering',
  'Design',
  'Product',
  'Data',
  'Marketing',
  'Sales',
  'Operations',
  'HR',
];

const EMPLOYMENT_TYPE_OPTIONS = ['Full-time', 'Part-time', 'Contract', 'Internship'];

const EXPERIENCE_LEVEL_OPTIONS = [
  { value: 'junior', labelKey: 'jobs.levels.junior', fallback: 'Junior' },
  { value: 'mid', labelKey: 'jobs.levels.mid', fallback: 'Mid' },
  { value: 'senior', labelKey: 'jobs.levels.senior', fallback: 'Senior' },
  { value: 'lead', labelKey: 'jobs.levels.lead', fallback: 'Lead' },
  { value: 'principal', labelKey: 'jobs.levels.principal', fallback: 'Principal' },
] as const;

const STATUS_OPTIONS = [
  { value: 'open', labelKey: 'jobs.statuses.open' },
  { value: 'draft', labelKey: 'jobs.statuses.draft' },
  { value: 'closed', labelKey: 'jobs.statuses.closed' },
  { value: 'on_hold', labelKey: 'jobs.statuses.on_hold' },
] as const;

const EXPERIENCE_YEARS_MAP: Record<string, { min?: number; max?: number }> = {
  junior: { max: 2 },
  mid: { min: 2, max: 5 },
  senior: { min: 5, max: 8 },
  lead: { min: 7, max: 12 },
  principal: { min: 10 },
};

export interface JobFormValues {
  title: string;
  department: string;
  location: string;
  employment_type: string;
  experience_level: string;
  experience_years_min: number | null;
  experience_years_max: number | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  description: string;
  requirements: string;
  skills: string[];
  status: string;
}

export interface JobFormInitial {
  id?: string;
  title?: string | null;
  department?: string | null;
  location?: string | null;
  employment_type?: string | null;
  experience_years_min?: number | null;
  experience_years_max?: number | null;
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string | null;
  description?: string | null;
  requirements?: string[] | string | null;
  skills?: string[] | null;
  status?: string | null;
}

export interface JobFormProps {
  initial?: JobFormInitial | null;
  submitting?: boolean;
  onSubmit: (values: JobFormValues) => void | Promise<void>;
  onCancel: () => void;
  locale: Locale;
}

function toStr(v: string | null | undefined): string {
  return v ?? '';
}

function toArr(v: string[] | null | undefined): string[] {
  return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
}

function toNumString(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? '' : String(v);
}

function requirementsToText(v: string[] | string | null | undefined): string {
  if (Array.isArray(v)) return v.join('\n');
  return v ?? '';
}

function deriveExperienceLevel(min: number | null | undefined, max: number | null | undefined): string {
  if (min == null && max == null) return '';
  const m = min ?? 0;
  const x = max ?? m;
  if (x <= 2) return 'junior';
  if (m >= 2 && x <= 5) return 'mid';
  if (m >= 5 && x <= 8) return 'senior';
  if (m >= 7 && x <= 12) return 'lead';
  if (m >= 10) return 'principal';
  return '';
}

interface TagInputProps {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabled?: boolean;
  ariaLabel: string;
}

function TagInput({ id, value, onChange, placeholder, disabled, ariaLabel }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addSkill = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      if (value.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
        setDraft('');
        return;
      }
      onChange([...value, trimmed]);
      setDraft('');
    },
    [onChange, value]
  );

  const removeSkill = useCallback(
    (skill: string) => {
      onChange(value.filter((s) => s !== skill));
    },
    [onChange, value]
  );

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-1.5 w-full min-h-[42px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 dark:bg-surface-800 dark:border-surface-700"
    >
      {value.map((skill) => (
        <span
          key={skill}
          className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-xs font-medium dark:bg-brand-500/20 dark:text-brand-300 dark:border-brand-500/30"
        >
          {skill}
          <button
            type="button"
            onClick={() => removeSkill(skill)}
            disabled={disabled}
            aria-label={`Remove ${skill}`}
            className="rounded-full p-0.5 hover:bg-blue-100 dark:hover:bg-brand-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => {
          if (draft.trim()) addSkill(draft);
        }}
        disabled={disabled}
        placeholder={value.length === 0 ? placeholder : ''}
        aria-label={ariaLabel}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:text-gray-100 dark:placeholder:text-gray-500"
      />
      {draft.trim() !== '' && (
        <button
          type="button"
          onClick={() => addSkill(draft)}
          disabled={disabled}
          aria-label="Add skill"
          className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-surface-700"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function JobForm({ initial, submitting, onSubmit, onCancel, locale }: JobFormProps) {
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const titleId = useId();
  const departmentId = useId();
  const locationId = useId();
  const employmentTypeId = useId();
  const experienceLevelId = useId();
  const salaryMinId = useId();
  const salaryMaxId = useId();
  const currencyId = useId();
  const descriptionId = useId();
  const requirementsId = useId();
  const skillsId = useId();
  const statusId = useId();

  const [title, setTitle] = useState<string>(toStr(initial?.title));
  const [department, setDepartment] = useState<string>(toStr(initial?.department) || 'Engineering');
  const [location, setLocation] = useState<string>(toStr(initial?.location));
  const [employmentType, setEmploymentType] = useState<string>(
    toStr(initial?.employment_type) || 'Full-time'
  );
  const [experienceLevel, setExperienceLevel] = useState<string>(
    initial?.experience_years_min != null || initial?.experience_years_max != null
      ? deriveExperienceLevel(initial?.experience_years_min, initial?.experience_years_max)
      : ''
  );
  const [salaryMin, setSalaryMin] = useState<string>(toNumString(initial?.salary_min));
  const [salaryMax, setSalaryMax] = useState<string>(toNumString(initial?.salary_max));
  const [currency, setCurrency] = useState<string>(toStr(initial?.currency) || 'USD');
  const [description, setDescription] = useState<string>(toStr(initial?.description));
  const [requirements, setRequirements] = useState<string>(
    requirementsToText(initial?.requirements)
  );
  const [skills, setSkills] = useState<string[]>(toArr(initial?.skills));
  const [status, setStatus] = useState<string>(toStr(initial?.status) || 'open');

  const [errors, setErrors] = useState<Partial<Record<keyof JobFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(toStr(initial?.title));
    setDepartment(toStr(initial?.department) || 'Engineering');
    setLocation(toStr(initial?.location));
    setEmploymentType(toStr(initial?.employment_type) || 'Full-time');
    setExperienceLevel(
      initial?.experience_years_min != null || initial?.experience_years_max != null
        ? deriveExperienceLevel(initial?.experience_years_min, initial?.experience_years_max)
        : ''
    );
    setSalaryMin(toNumString(initial?.salary_min));
    setSalaryMax(toNumString(initial?.salary_max));
    setCurrency(toStr(initial?.currency) || 'USD');
    setDescription(toStr(initial?.description));
    setRequirements(requirementsToText(initial?.requirements));
    setSkills(toArr(initial?.skills));
    setStatus(toStr(initial?.status) || 'open');
    setErrors({});
    setFormError(null);
  }, [initial]);

  const parseSalary = (raw: string): number | null => {
    if (raw.trim() === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof JobFormValues, string>> = {};
    if (!title.trim()) {
      next.title = t('jobs.errors.titleRequired', 'Job title is required');
    }
    const minN = parseSalary(salaryMin);
    const maxN = parseSalary(salaryMax);
    if (salaryMin.trim() !== '' && minN === null) {
      next.salary_min = t('jobs.errors.salaryInvalid', 'Salary must be a non-negative number');
    }
    if (salaryMax.trim() !== '' && maxN === null) {
      next.salary_max = t('jobs.errors.salaryInvalid', 'Salary must be a non-negative number');
    }
    if (minN !== null && maxN !== null && minN > maxN) {
      next.salary_max = t(
        'jobs.errors.salaryRangeInvalid',
        'Maximum salary must be greater than or equal to minimum'
      );
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    const level = experienceLevel;
    const levelRange = level ? EXPERIENCE_YEARS_MAP[level] : undefined;
    const expMin = levelRange?.min !== undefined ? levelRange.min : null;
    const expMax = levelRange?.max !== undefined ? levelRange.max : null;

    const payload: JobFormValues = {
      title: title.trim(),
      department,
      location: location.trim(),
      employment_type: employmentType,
      experience_level: level,
      experience_years_min: level ? expMin : null,
      experience_years_max: level ? expMax : null,
      salary_min: parseSalary(salaryMin),
      salary_max: parseSalary(salaryMax),
      currency: currency || 'USD',
      description: description.trim(),
      requirements: requirements.trim(),
      skills,
      status: status || 'open',
    };
    onSubmit(payload);
  };

  const departmentOptions = DEPARTMENT_OPTIONS.map((d) => ({ value: d, label: d }));
  const employmentTypeOptions = EMPLOYMENT_TYPE_OPTIONS.map((tt) => ({ value: tt, label: tt }));
  const experienceLevelOptions = [
    { value: '', label: t('jobs.levels.none', '— Select level —') },
    ...EXPERIENCE_LEVEL_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey, o.fallback) })),
  ];
  const statusOptions = STATUS_OPTIONS.map((o) => ({
    value: o.value,
    label: t(o.labelKey, o.value.charAt(0).toUpperCase() + o.value.slice(1)),
  }));
  const currencyOptions = [
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
    { value: 'GBP', label: 'GBP' },
    { value: 'CAD', label: 'CAD' },
  ];

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300"
        >
          {formError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <InputField
            id={titleId}
            label={t('jobs.fields.title', 'Job title')}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Full-Stack Engineer"
            error={errors.title}
            disabled={submitting}
          />
        </div>
        <SelectField
          id={departmentId}
          label={t('jobs.fields.department', 'Department')}
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          options={departmentOptions}
          disabled={submitting}
        />
        <SelectField
          id={employmentTypeId}
          label={t('jobs.fields.employmentType', 'Employment type')}
          value={employmentType}
          onChange={(e) => setEmploymentType(e.target.value)}
          options={employmentTypeOptions}
          disabled={submitting}
        />
        <InputField
          id={locationId}
          label={t('jobs.fields.location', 'Location')}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. San Francisco, CA or Remote"
          disabled={submitting}
        />
        <SelectField
          id={experienceLevelId}
          label={t('jobs.fields.experienceLevel', 'Experience level')}
          value={experienceLevel}
          onChange={(e) => setExperienceLevel(e.target.value)}
          options={experienceLevelOptions}
          disabled={submitting}
          helpText={t('jobs.fields.experienceLevelHelp', 'Used to suggest a salary band.')}
        />
        <InputField
          id={salaryMinId}
          type="number"
          label={t('jobs.fields.salaryMin', 'Salary min')}
          min={0}
          step={1000}
          value={salaryMin}
          onChange={(e) => setSalaryMin(e.target.value)}
          placeholder="100000"
          error={errors.salary_min}
          disabled={submitting}
        />
        <InputField
          id={salaryMaxId}
          type="number"
          label={t('jobs.fields.salaryMax', 'Salary max')}
          min={0}
          step={1000}
          value={salaryMax}
          onChange={(e) => setSalaryMax(e.target.value)}
          placeholder="150000"
          error={errors.salary_max}
          disabled={submitting}
        />
        <SelectField
          id={currencyId}
          label={t('jobs.fields.currency', 'Currency')}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={currencyOptions}
          disabled={submitting}
        />
        <SelectField
          id={statusId}
          label={t('jobs.fields.status', 'Status')}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={statusOptions}
          disabled={submitting}
        />
        <div className="sm:col-span-2">
          <TextareaField
            id={descriptionId}
            label={t('jobs.fields.description', 'Description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t(
              'jobs.descriptionPlaceholder',
              'What will this person do? What is the mission?'
            )}
            rows={4}
            disabled={submitting}
            maxLength={5000}
          />
        </div>
        <div className="sm:col-span-2">
          <TextareaField
            id={requirementsId}
            label={t('jobs.fields.requirements', 'Requirements')}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder={t(
              'jobs.requirementsPlaceholder',
              'List requirements, one per line.'
            )}
            rows={4}
            disabled={submitting}
            maxLength={5000}
            helpText={t(
              'jobs.requirementsHelp',
              'One requirement per line. Will be stored as a list.'
            )}
          />
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor={skillsId}
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('jobs.fields.skills', 'Required skills')}
          </label>
          <TagInput
            id={skillsId}
            value={skills}
            onChange={setSkills}
            placeholder={t('jobs.skillsPlaceholder', 'React, TypeScript, Node.js')}
            disabled={submitting}
            ariaLabel={t('jobs.fields.skills', 'Required skills')}
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {t('jobs.skillsHelp', 'Press Enter or comma to add a skill. Click × to remove.')}
          </p>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-gray-100 dark:border-surface-700">
        <Button variant="secondary" onClick={onCancel} disabled={submitting} type="button">
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button variant="primary" type="submit" loading={submitting} disabled={submitting}>
          {initial?.id ? t('common.save', 'Save') : t('jobs.createJob', 'Create job')}
        </Button>
      </div>
    </form>
  );
}
