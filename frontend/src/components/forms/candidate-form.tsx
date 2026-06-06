'use client';

import { useState, useId, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';
import { Button, InputField, TextareaField, SelectField } from '@/components';
import type { Locale } from '@/stores/locale-store';
import { translate } from '@/stores/locale-store';

const STATUS_OPTIONS_BASE = [
  { value: 'new', labelKey: 'candidates.statuses.new' },
  { value: 'active', labelKey: 'candidates.statuses.active' },
  { value: 'screening', labelKey: 'candidates.statuses.screening' },
  { value: 'ppe', labelKey: 'candidates.statuses.ppe' },
  { value: 'interviewing', labelKey: 'candidates.statuses.interviewing' },
  { value: 'offer', labelKey: 'candidates.statuses.offer' },
  { value: 'hired', labelKey: 'candidates.statuses.hired' },
  { value: 'rejected', labelKey: 'candidates.statuses.rejected' },
] as const;

export interface CandidateFormValues {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  skills: string[];
  experience_years: number;
  status: string;
  notes: string;
}

export interface CandidateFormInitial {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  skills?: string[] | null;
  experience_years?: number | null;
  status?: string | null;
  notes?: string | null;
}

export interface CandidateFormProps {
  initial?: CandidateFormInitial | null;
  submitting?: boolean;
  onSubmit: (values: CandidateFormValues) => void | Promise<void>;
  onCancel: () => void;
  locale: Locale;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toInitialString(v: string | null | undefined): string {
  return v ?? '';
}

function toInitialSkills(v: string[] | null | undefined): string[] {
  return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
}

function toInitialNumber(v: number | null | undefined): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0;
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

export function CandidateForm({ initial, submitting, onSubmit, onCancel, locale }: CandidateFormProps) {
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const fullNameId = useId();
  const emailId = useId();
  const phoneId = useId();
  const locationId = useId();
  const experienceId = useId();
  const skillsId = useId();
  const statusId = useId();
  const notesId = useId();

  const [fullName, setFullName] = useState<string>(toInitialString(initial?.full_name));
  const [email, setEmail] = useState<string>(toInitialString(initial?.email));
  const [phone, setPhone] = useState<string>(toInitialString(initial?.phone));
  const [location, setLocation] = useState<string>(toInitialString(initial?.location));
  const [skills, setSkills] = useState<string[]>(toInitialSkills(initial?.skills));
  const [experienceYears, setExperienceYears] = useState<string>(
    initial && initial.experience_years != null ? String(initial.experience_years) : ''
  );
  const [status, setStatus] = useState<string>(toInitialString(initial?.status) || 'active');
  const [notes, setNotes] = useState<string>(toInitialString(initial?.notes));

  const [errors, setErrors] = useState<Partial<Record<keyof CandidateFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(toInitialString(initial?.full_name));
    setEmail(toInitialString(initial?.email));
    setPhone(toInitialString(initial?.phone));
    setLocation(toInitialString(initial?.location));
    setSkills(toInitialSkills(initial?.skills));
    setExperienceYears(
      initial && initial.experience_years != null ? String(initial.experience_years) : ''
    );
    setStatus(toInitialString(initial?.status) || 'active');
    setNotes(toInitialString(initial?.notes));
    setErrors({});
    setFormError(null);
  }, [initial]);

  const validate = (): boolean => {
    const next: Partial<Record<keyof CandidateFormValues, string>> = {};
    if (!fullName.trim()) {
      next.full_name = t('auth.errors.nameRequired', 'Please enter the candidate name');
    }
    if (!email.trim()) {
      next.email = t('auth.errors.emailRequired', 'Email is required');
    } else if (!EMAIL_RE.test(email.trim())) {
      next.email = t('auth.errors.emailInvalid', 'Please enter a valid email address');
    }
    if (experienceYears.trim() !== '') {
      const n = Number(experienceYears);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        next.experience_years = t(
          'candidates.errors.experienceInvalid',
          'Experience must be a non-negative whole number'
        );
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    const payload: CandidateFormValues = {
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      location: location.trim(),
      skills,
      experience_years:
        experienceYears.trim() === '' ? 0 : Math.max(0, Math.floor(Number(experienceYears))),
      status: status || 'active',
      notes: notes.trim(),
    };
    onSubmit(payload);
  };

  const statusOptions = STATUS_OPTIONS_BASE.map((o) => ({
    value: o.value,
    label: t(o.labelKey, o.value.charAt(0).toUpperCase() + o.value.slice(1)),
  }));

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
        <InputField
          id={fullNameId}
          label={t('candidates.fields.fullName', 'Full name')}
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jane Doe"
          error={errors.full_name}
          disabled={submitting}
          autoComplete="name"
        />
        <InputField
          id={emailId}
          type="email"
          label={t('candidates.fields.email', 'Email')}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
          error={errors.email}
          disabled={submitting}
          autoComplete="email"
        />
        <InputField
          id={phoneId}
          type="tel"
          label={t('candidates.fields.phone', 'Phone')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 555 123 4567"
          disabled={submitting}
          autoComplete="tel"
        />
        <InputField
          id={locationId}
          label={t('candidates.fields.location', 'Location')}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="City, Country"
          disabled={submitting}
          autoComplete="address-level2"
        />
        <InputField
          id={experienceId}
          type="number"
          label={t('candidates.fields.experience', 'Years of experience')}
          min={0}
          step={1}
          value={experienceYears}
          onChange={(e) => setExperienceYears(e.target.value)}
          placeholder="0"
          error={errors.experience_years}
          disabled={submitting}
        />
        <SelectField
          id={statusId}
          label={t('candidates.fields.status', 'Status')}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={statusOptions}
          disabled={submitting}
        />
        <div className="sm:col-span-2">
          <label
            htmlFor={skillsId}
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('candidates.fields.skills', 'Skills')}
          </label>
          <TagInput
            id={skillsId}
            value={skills}
            onChange={setSkills}
            placeholder={t('candidates.skillsPlaceholder', 'e.g. React, TypeScript, Node.js')}
            disabled={submitting}
            ariaLabel={t('candidates.fields.skills', 'Skills')}
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {t('candidates.skillsHelp', 'Press Enter or comma to add a skill. Click × to remove.')}
          </p>
        </div>
        <div className="sm:col-span-2">
          <TextareaField
            id={notesId}
            label={t('candidates.fields.notes', 'Notes')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('candidates.notesPlaceholder', 'Internal notes about this candidate…')}
            rows={4}
            disabled={submitting}
            maxLength={2000}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-gray-100 dark:border-surface-700">
        <Button variant="secondary" onClick={onCancel} disabled={submitting} type="button">
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          variant="primary"
          type="submit"
          loading={submitting}
          disabled={submitting}
        >
          {initial ? t('common.save', 'Save') : t('candidates.addCandidate', 'Add candidate')}
        </Button>
      </div>
    </form>
  );
}
