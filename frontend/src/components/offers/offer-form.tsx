'use client';

import { useState, useId, useEffect } from 'react';
import { Button, InputField, SelectField, TextareaField } from '@/components';
import type { Locale } from '@/stores/locale-store';
import { translate } from '@/stores/locale-store';
import type { OfferTypes } from '@/services/api/types';

export interface OfferFormValues {
  candidate_id: string;
  job_id: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  equity_percent: number | null;
  start_date: string | null;
  expiration_date: string | null;
  template_id: string | null;
  notes: string | null;
}

export interface OfferFormInitial {
  candidate_id?: string | null;
  job_id?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string | null;
  equity_percent?: number | null;
  start_date?: string | null;
  expiration_date?: string | null;
  template_id?: string | null;
  notes?: string | null;
}

export interface OfferFormProps {
  initial?: OfferFormInitial | null;
  candidates: Array<{ id: string; label: string }>;
  jobs: Array<{ id: string; label: string }>;
  templates: OfferTypes.OfferTemplate[];
  submitting?: boolean;
  onSubmit: (values: OfferFormValues) => void | Promise<void>;
  onCancel: () => void;
  locale: Locale;
}

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'CAD', label: 'CAD ($)' },
];

export function OfferForm({
  initial,
  candidates,
  jobs,
  templates,
  submitting,
  onSubmit,
  onCancel,
  locale,
}: OfferFormProps) {
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const candidateId = useId();
  const jobId = useId();
  const salaryMinId = useId();
  const salaryMaxId = useId();
  const currencyId = useId();
  const equityId = useId();
  const startDateId = useId();
  const expirationDateId = useId();
  const templateId = useId();
  const notesId = useId();

  const [candidate, setCandidate] = useState<string>(initial?.candidate_id ?? '');
  const [job, setJob] = useState<string>(initial?.job_id ?? '');
  const [salaryMin, setSalaryMin] = useState<string>(
    initial?.salary_min != null ? String(initial.salary_min) : ''
  );
  const [salaryMax, setSalaryMax] = useState<string>(
    initial?.salary_max != null ? String(initial.salary_max) : ''
  );
  const [currency, setCurrency] = useState<string>(initial?.currency ?? 'USD');
  const [equity, setEquity] = useState<string>(
    initial?.equity_percent != null ? String(initial.equity_percent) : ''
  );
  const [startDate, setStartDate] = useState<string>(initial?.start_date ?? '');
  const [expirationDate, setExpirationDate] = useState<string>(initial?.expiration_date ?? '');
  const [template, setTemplate] = useState<string>(initial?.template_id ?? '');
  const [notes, setNotes] = useState<string>(initial?.notes ?? '');

  const [errors, setErrors] = useState<Partial<Record<keyof OfferFormValues, string>>>({});

  useEffect(() => {
    setCandidate(initial?.candidate_id ?? '');
    setJob(initial?.job_id ?? '');
    setSalaryMin(initial?.salary_min != null ? String(initial.salary_min) : '');
    setSalaryMax(initial?.salary_max != null ? String(initial.salary_max) : '');
    setCurrency(initial?.currency ?? 'USD');
    setEquity(initial?.equity_percent != null ? String(initial.equity_percent) : '');
    setStartDate(initial?.start_date ?? '');
    setExpirationDate(initial?.expiration_date ?? '');
    setTemplate(initial?.template_id ?? '');
    setNotes(initial?.notes ?? '');
    setErrors({});
  }, [initial]);

  const validate = (): boolean => {
    const next: Partial<Record<keyof OfferFormValues, string>> = {};
    if (!candidate) {
      next.candidate_id = t('offers.errors.candidateRequired', 'Please select a candidate');
    }
    if (!job) {
      next.job_id = t('offers.errors.jobRequired', 'Please select a job');
    }
    if (salaryMin && Number(salaryMin) < 0) {
      next.salary_min = t('offers.errors.salaryMinInvalid', 'Salary must be positive');
    }
    if (salaryMax && Number(salaryMax) < 0) {
      next.salary_max = t('offers.errors.salaryMaxInvalid', 'Salary must be positive');
    }
    if (salaryMin && salaryMax && Number(salaryMin) > Number(salaryMax)) {
      next.salary_max = t('offers.errors.salaryRangeInvalid', 'Max must be >= min');
    }
    if (equity && (Number(equity) < 0 || Number(equity) > 100)) {
      next.equity_percent = t('offers.errors.equityInvalid', 'Equity must be 0-100%');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const payload: OfferFormValues = {
      candidate_id: candidate,
      job_id: job,
      salary_min: salaryMin ? Number(salaryMin) : null,
      salary_max: salaryMax ? Number(salaryMax) : null,
      currency,
      equity_percent: equity ? Number(equity) : null,
      start_date: startDate || null,
      expiration_date: expirationDate || null,
      template_id: template || null,
      notes: notes.trim() || null,
    };
    onSubmit(payload);
  };

  const candidateOptions = [
    { value: '', label: t('offers.placeholders.candidate', 'Select candidate…') },
    ...candidates.map((c) => ({ value: c.id, label: c.label })),
  ];

  const jobOptions = [
    { value: '', label: t('offers.placeholders.job', 'Select job…') },
    ...jobs.map((j) => ({ value: j.id, label: j.label })),
  ];

  const templateOptions = [
    { value: '', label: t('offers.placeholders.template', 'Select template…') },
    ...templates.map((t) => ({ value: t.id, label: t.name })),
  ];

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField
          id={candidateId}
          label={t('offers.fields.candidate', 'Candidate *')}
          required
          value={candidate}
          onChange={(e) => setCandidate(e.target.value)}
          options={candidateOptions}
          error={errors.candidate_id}
          disabled={submitting}
        />
        <SelectField
          id={jobId}
          label={t('offers.fields.job', 'Job *')}
          required
          value={job}
          onChange={(e) => setJob(e.target.value)}
          options={jobOptions}
          error={errors.job_id}
          disabled={submitting}
        />
        <InputField
          id={salaryMinId}
          type="number"
          label={t('offers.fields.salaryMin', 'Salary min')}
          min={0}
          step={1000}
          value={salaryMin}
          onChange={(e) => setSalaryMin(e.target.value)}
          placeholder="50000"
          error={errors.salary_min}
          disabled={submitting}
        />
        <InputField
          id={salaryMaxId}
          type="number"
          label={t('offers.fields.salaryMax', 'Salary max')}
          min={0}
          step={1000}
          value={salaryMax}
          onChange={(e) => setSalaryMax(e.target.value)}
          placeholder="80000"
          error={errors.salary_max}
          disabled={submitting}
        />
        <SelectField
          id={currencyId}
          label={t('offers.fields.currency', 'Currency')}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={CURRENCY_OPTIONS}
          disabled={submitting}
        />
        <InputField
          id={equityId}
          type="number"
          label={t('offers.fields.equity', 'Equity (%)')}
          min={0}
          max={100}
          step={0.1}
          value={equity}
          onChange={(e) => setEquity(e.target.value)}
          placeholder="0.5"
          error={errors.equity_percent}
          disabled={submitting}
        />
        <InputField
          id={startDateId}
          type="date"
          label={t('offers.fields.startDate', 'Start date')}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          disabled={submitting}
        />
        <InputField
          id={expirationDateId}
          type="date"
          label={t('offers.fields.expirationDate', 'Expiration date')}
          value={expirationDate}
          onChange={(e) => setExpirationDate(e.target.value)}
          disabled={submitting}
        />
        <div className="sm:col-span-2">
          <SelectField
            id={templateId}
            label={t('offers.fields.template', 'Template')}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            options={templateOptions}
            disabled={submitting}
          />
        </div>
        <div className="sm:col-span-2">
          <TextareaField
            id={notesId}
            label={t('offers.fields.notes', 'Notes')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('offers.placeholders.notes', 'Internal notes about this offer…')}
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
        <Button variant="primary" type="submit" loading={submitting} disabled={submitting}>
          {initial ? t('common.save', 'Save') : t('offers.createOffer', 'Create offer')}
        </Button>
      </div>
    </form>
  );
}
