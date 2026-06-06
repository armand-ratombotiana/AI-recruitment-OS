'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Calendar as CalendarIcon, Plus, X, Users as UsersIcon } from 'lucide-react';
import { Button, InputField, TextareaField, SelectField } from '@/components';
import type { Locale } from '@/stores/locale-store';
import { translate } from '@/stores/locale-store';

export const INTERVIEW_TYPES = ['phone', 'video', 'onsite', 'technical', 'panel'] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_TYPE_LABEL_KEYS: Record<InterviewType, string> = {
  phone: 'interviews.types.phone',
  video: 'interviews.types.video',
  onsite: 'interviews.types.onsite',
  technical: 'interviews.types.technical',
  panel: 'interviews.types.panel',
};

export const INTERVIEW_TYPE_FALLBACKS: Record<InterviewType, string> = {
  phone: 'Phone screen',
  video: 'Video call',
  onsite: 'Onsite',
  technical: 'Technical',
  panel: 'Panel',
};

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

export interface InterviewFormValues {
  candidate_id: string;
  job_id: string;
  scheduled_at: string;
  duration_minutes: number;
  type: string;
  interviewers: string[];
  location: string;
  notes: string;
}

export interface InterviewFormInitial {
  id?: string;
  candidate_id?: string | null;
  job_id?: string | null;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  type?: string | null;
  interviewer?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface InterviewOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface InterviewFormProps {
  initial?: InterviewFormInitial | null;
  submitting?: boolean;
  onSubmit: (values: InterviewFormValues) => void | Promise<void>;
  onCancel: () => void;
  locale: Locale;
  candidates?: InterviewOption[];
  jobs?: InterviewOption[];
  interviewers?: string[];
  loadingOptions?: boolean;
}

function toStr(v: string | null | undefined): string {
  return v ?? '';
}

function toInt(v: number | null | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function toArr(v: string | null | undefined): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}

interface MultiselectProps {
  id: string;
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabled?: boolean;
  ariaLabel: string;
}

function InterviewerMultiselect({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  ariaLabel,
}: MultiselectProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const addValue = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, trimmed]);
    setDraft('');
  };

  const removeValue = (v: string) => {
    onChange(value.filter((x) => x !== v));
  };

  const toggleOption = (opt: string) => {
    if (value.includes(opt)) removeValue(opt);
    else onChange([...value, opt]);
  };

  return (
    <div ref={containerRef} id={id} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 w-full min-h-[42px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 dark:bg-surface-800 dark:border-surface-700"
        role="group"
        aria-label={ariaLabel}
      >
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-xs font-medium dark:bg-brand-500/20 dark:text-brand-300 dark:border-brand-500/30"
          >
            {v}
            <button
              type="button"
              onClick={() => removeValue(v)}
              disabled={disabled}
              aria-label={`Remove ${v}`}
              className="rounded-full p-0.5 hover:bg-blue-100 dark:hover:bg-brand-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <div className="flex flex-1 items-center gap-1 min-w-[140px]">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addValue(draft);
              } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
                onChange(value.slice(0, -1));
              }
            }}
            onFocus={() => setOpen(true)}
            disabled={disabled}
            placeholder={value.length === 0 ? placeholder : ''}
            aria-label={ariaLabel}
            className="flex-1 min-w-[120px] bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          {options.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((s) => !s)}
              disabled={disabled}
              aria-label={ariaLabel}
              aria-expanded={open}
              className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-surface-700"
            >
              <UsersIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {open && options.length > 0 && (
        <ul
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:bg-surface-800 dark:border-surface-700"
        >
          {options
            .filter((o) => !value.includes(o))
            .map((o) => (
              <li key={o}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value.includes(o)}
                  onClick={() => toggleOption(o)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-700 dark:focus-visible:bg-surface-700"
                >
                  {o}
                </button>
              </li>
            ))}
          {options.filter((o) => !value.includes(o)).length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">All added</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function InterviewForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
  locale,
  candidates = [],
  jobs = [],
  interviewers = [],
  loadingOptions = false,
}: InterviewFormProps) {
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const candidateIdFieldId = useId();
  const jobIdFieldId = useId();
  const scheduledAtFieldId = useId();
  const durationFieldId = useId();
  const typeFieldId = useId();
  const interviewersFieldId = useId();
  const locationFieldId = useId();
  const notesFieldId = useId();

  const [candidateId, setCandidateId] = useState<string>(toStr(initial?.candidate_id));
  const [jobId, setJobId] = useState<string>(toStr(initial?.job_id));
  const [scheduledAt, setScheduledAt] = useState<string>(isoToLocalInput(initial?.scheduled_at));
  const [duration, setDuration] = useState<number>(toInt(initial?.duration_minutes, 60));
  const [type, setType] = useState<string>(toStr(initial?.type) || 'video');
  const [interviewerList, setInterviewerList] = useState<string[]>(toArr(initial?.interviewer));
  const [location, setLocation] = useState<string>(toStr(initial?.location));
  const [notes, setNotes] = useState<string>(toStr(initial?.notes));

  const [errors, setErrors] = useState<Partial<Record<keyof InterviewFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setCandidateId(toStr(initial?.candidate_id));
    setJobId(toStr(initial?.job_id));
    setScheduledAt(isoToLocalInput(initial?.scheduled_at));
    setDuration(toInt(initial?.duration_minutes, 60));
    setType(toStr(initial?.type) || 'video');
    setInterviewerList(toArr(initial?.interviewer));
    setLocation(toStr(initial?.location));
    setNotes(toStr(initial?.notes));
    setErrors({});
    setFormError(null);
  }, [initial]);

  const validate = (): boolean => {
    const next: Partial<Record<keyof InterviewFormValues, string>> = {};
    if (!candidateId.trim()) {
      next.candidate_id = t('interviews.formErrors.candidateRequired', 'Please select a candidate');
    }
    if (!jobId.trim()) {
      next.job_id = t('interviews.formErrors.jobRequired', 'Please select a job');
    }
    if (!scheduledAt) {
      next.scheduled_at = t('interviews.formErrors.scheduledAtRequired', 'Date and time are required');
    } else {
      const d = new Date(scheduledAt);
      if (isNaN(d.getTime())) {
        next.scheduled_at = t('interviews.formErrors.scheduledAtInvalid', 'Please enter a valid date and time');
      }
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      next.duration_minutes = t(
        'interviews.formErrors.durationInvalid',
        'Duration must be a positive number of minutes'
      );
    } else if (duration > 24 * 60) {
      next.duration_minutes = t(
        'interviews.formErrors.durationTooLong',
        'Duration cannot exceed 24 hours'
      );
    }
    if (!type.trim()) {
      next.type = t('interviews.formErrors.typeRequired', 'Please select an interview type');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    const payload: InterviewFormValues = {
      candidate_id: candidateId.trim(),
      job_id: jobId.trim(),
      scheduled_at: localInputToIso(scheduledAt),
      duration_minutes: Math.max(5, Math.floor(duration)),
      type: type.trim(),
      interviewers: interviewerList.map((v) => v.trim()).filter(Boolean),
      location: location.trim(),
      notes: notes.trim(),
    };
    onSubmit(payload);
  };

  const typeOptions = INTERVIEW_TYPES.map((tt) => ({
    value: tt,
    label: t(INTERVIEW_TYPE_LABEL_KEYS[tt], INTERVIEW_TYPE_FALLBACKS[tt]),
  }));
  const durationOptions = DURATION_OPTIONS.map((d) => ({
    value: String(d),
    label: t('interviews.durations.short', '{n} min').replace('{n}', String(d)),
  }));

  const candidateOptions: Array<{ value: string; label: string; disabled?: boolean }> = candidates.map(
    (c) => ({ value: c.id, label: c.sublabel ? `${c.label} · ${c.sublabel}` : c.label })
  );
  const jobOptions: Array<{ value: string; label: string; disabled?: boolean }> = jobs.map((j) => ({
    value: j.id,
    label: j.sublabel ? `${j.label} · ${j.sublabel}` : j.label,
  }));

  const isEdit = Boolean(initial?.id);
  const scheduledAtErrorId = `${scheduledAtFieldId}-error`;
  const scheduledAtHelpId = `${scheduledAtFieldId}-help`;

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
        <SelectField
          id={candidateIdFieldId}
          label={t('interviews.fields.candidate', 'Candidate')}
          required
          value={candidateId}
          onChange={(e) => setCandidateId(e.target.value)}
          options={candidateOptions}
          disabled={submitting || loadingOptions}
          placeholder={
            loadingOptions
              ? t('common.loading', 'Loading…')
              : t('interviews.placeholders.candidate', 'Select candidate…')
          }
          error={errors.candidate_id}
        />
        <SelectField
          id={jobIdFieldId}
          label={t('interviews.fields.job', 'Job')}
          required
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          options={jobOptions}
          disabled={submitting || loadingOptions}
          placeholder={
            loadingOptions
              ? t('common.loading', 'Loading…')
              : t('interviews.placeholders.job', 'Select job…')
          }
          error={errors.job_id}
        />
        <div>
          <label
            htmlFor={scheduledAtFieldId}
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {t('interviews.fields.scheduledAt', 'Date and time')}
            </span>
            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id={scheduledAtFieldId}
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
            aria-required="true"
            aria-invalid={Boolean(errors.scheduled_at) || undefined}
            aria-describedby={
              [errors.scheduled_at ? scheduledAtErrorId : null, scheduledAtHelpId]
                .filter(Boolean)
                .join(' ') || undefined
            }
            disabled={submitting}
            className={
              'block w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:bg-surface-800 dark:text-gray-100 ' +
              (errors.scheduled_at
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500 dark:border-surface-700')
            }
          />
          {errors.scheduled_at ? (
            <p id={scheduledAtErrorId} role="alert" className="mt-1.5 text-xs text-red-600">
              {errors.scheduled_at}
            </p>
          ) : (
            <p id={scheduledAtHelpId} className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {t('interviews.fields.scheduledAtHelp', 'Local timezone. Format: YYYY-MM-DDTHH:mm')}
            </p>
          )}
        </div>
        <SelectField
          id={durationFieldId}
          label={t('interviews.fields.duration', 'Duration (min)')}
          required
          value={String(duration)}
          onChange={(e) => setDuration(Number(e.target.value))}
          options={durationOptions}
          disabled={submitting}
          error={errors.duration_minutes}
        />
        <SelectField
          id={typeFieldId}
          label={t('interviews.fields.type', 'Type')}
          required
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={typeOptions}
          disabled={submitting}
          error={errors.type}
        />
        <div className="sm:col-span-2">
          <label
            htmlFor={interviewersFieldId}
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('interviews.fields.interviewers', 'Interviewers')}
          </label>
          <InterviewerMultiselect
            id={interviewersFieldId}
            value={interviewerList}
            options={interviewers}
            onChange={setInterviewerList}
            placeholder={t('interviews.placeholders.interviewers', 'Add or pick interviewers…')}
            disabled={submitting}
            ariaLabel={t('interviews.fields.interviewers', 'Interviewers')}
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {t(
              'interviews.fields.interviewersHelp',
              'Press Enter or comma to add. Click × to remove.'
            )}
          </p>
        </div>
        <div className="sm:col-span-2">
          <InputField
            id={locationFieldId}
            label={t('interviews.fields.location', 'Location')}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t(
              'interviews.placeholders.location',
              'e.g. Zoom link, office address, or "Remote"'
            )}
            disabled={submitting}
          />
        </div>
        <div className="sm:col-span-2">
          <TextareaField
            id={notesFieldId}
            label={t('interviews.fields.notes', 'Notes')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t(
              'interviews.placeholders.notes',
              'Agenda, topics to cover, or prep notes…'
            )}
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
          leftIcon={<Plus className="h-4 w-4" />}
        >
          {isEdit
            ? t('common.save', 'Save')
            : t('interviews.schedule', 'Schedule interview')}
        </Button>
      </div>
    </form>
  );
}

export default InterviewForm;
