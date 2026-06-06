'use client';

import { useEffect, useId, useState } from 'react';
import { Bell, BellRing, X, CheckCircle2 } from 'lucide-react';
import { useJobAlerts } from '@/lib/public-job-store';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { api, APIError } from '@/services/api/client';
import { cn } from '@/lib/utils';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface JobAlertsDialogProps {
  open: boolean;
  onClose: () => void;
  initialKeywords?: string;
  initialLocation?: string;
  initialRemote?: boolean;
  initialEmploymentType?: string;
  jobId?: string | null;
  jobTitle?: string;
}

export function JobAlertsDialog({
  open,
  onClose,
  initialKeywords = '',
  initialLocation = '',
  initialRemote = false,
  initialEmploymentType = '',
  jobId = null,
  jobTitle,
}: JobAlertsDialogProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { add } = useJobAlerts();
  const emailId = useId();
  const keywordsId = useId();
  const locationId = useId();
  const frequencyId = useId();
  const remoteId = useId();

  const [email, setEmail] = useState('');
  const [keywords, setKeywords] = useState(initialKeywords);
  const [locationVal, setLocationVal] = useState(initialLocation);
  const [remote, setRemote] = useState(initialRemote);
  const [employmentType, setEmploymentType] = useState(initialEmploymentType);
  const [frequency, setFrequency] = useState<'instant' | 'daily' | 'weekly'>('daily');
  const [errors, setErrors] = useState<{ email?: string; keywords?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setKeywords(initialKeywords);
      setLocationVal(initialLocation);
      setRemote(initialRemote);
      setEmploymentType(initialEmploymentType);
      setErrors({});
      setSuccess(false);
    }
  }, [open, initialKeywords, initialLocation, initialRemote, initialEmploymentType]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      next.email = t('auth.errors.emailInvalid', 'Please enter a valid email address');
    }
    if (!keywords.trim()) {
      next.keywords = t('public.jobs.alerts.errors.keywords', 'Please enter at least one keyword');
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      add({
        email: email.trim(),
        keywords: keywords.trim(),
        location: locationVal.trim() || undefined,
        remote: remote || undefined,
        employment_type: employmentType || undefined,
        frequency,
        jobId,
      });
      try {
        await api.mailing.send({
          to: email.trim(),
          subject: t('public.jobs.alerts.emailSubject', 'Your AI-ROS job alerts are active'),
          body: t(
            'public.jobs.alerts.emailBody',
            'You will receive {frequency} alerts for: {keywords}',
          )
            .replace('{frequency}', frequency)
            .replace('{keywords}', keywords.trim()),
        });
      } catch (err) {
        if (!(err instanceof APIError)) {
          // Tolerate network / unknown errors silently.
        }
      }
      setSuccess(true);
      setTimeout(() => onClose(), 1600);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${emailId}-title`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-surface-800 dark:bg-surface-900">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 pt-6 pb-4 dark:border-surface-800">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
              <BellRing className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id={`${emailId}-title`}
                className="text-base font-semibold text-gray-900 dark:text-white"
              >
                {t('public.jobs.alerts.title', 'Get job alerts')}
              </h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {jobTitle
                  ? t(
                      'public.jobs.alerts.subtitleJob',
                      'Be notified about roles similar to {title}.',
                    ).replace('{title}', jobTitle)
                  : t(
                      'public.jobs.alerts.subtitle',
                      'Tell us what you are looking for and we will email you new matching roles.',
                    )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.cancel', 'Close')}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-surface-800 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {success ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
              {t('public.jobs.alerts.successTitle', 'Alerts activated')}
            </h3>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
              {t(
                'public.jobs.alerts.successDescription',
                "We will email you when new matching roles open up. You can manage your alerts any time.",
              )}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5" noValidate>
            <Field
              id={emailId}
              label={t('public.jobs.alerts.emailLabel', 'Email address')}
              error={errors.email}
            >
              <input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="you@example.com"
                className={inputClass(!!errors.email)}
              />
            </Field>

            <Field
              id={keywordsId}
              label={t('public.jobs.alerts.keywordsLabel', 'Keywords or job title')}
              error={errors.keywords}
              hint={t(
                'public.jobs.alerts.keywordsHint',
                'e.g. "Senior React Engineer", "Product Designer"',
              )}
            >
              <input
                id={keywordsId}
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                required
                className={inputClass(!!errors.keywords)}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                id={locationId}
                label={t('public.jobs.alerts.locationLabel', 'Location (optional)')}
              >
                <input
                  id={locationId}
                  type="text"
                  value={locationVal}
                  onChange={(e) => setLocationVal(e.target.value)}
                  placeholder={t('public.jobs.filters.locationAll', 'All locations')}
                  className={inputClass(false)}
                />
              </Field>

              <Field
                id={frequencyId}
                label={t('public.jobs.alerts.frequencyLabel', 'Frequency')}
              >
                <select
                  id={frequencyId}
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(e.target.value as 'instant' | 'daily' | 'weekly')
                  }
                  className={inputClass(false)}
                >
                  <option value="instant">
                    {t('public.jobs.alerts.frequency.instant', 'Instant')}
                  </option>
                  <option value="daily">
                    {t('public.jobs.alerts.frequency.daily', 'Daily digest')}
                  </option>
                  <option value="weekly">
                    {t('public.jobs.alerts.frequency.weekly', 'Weekly digest')}
                  </option>
                </select>
              </Field>
            </div>

            <label
              htmlFor={remoteId}
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer"
            >
              <input
                id={remoteId}
                type="checkbox"
                checked={remote}
                onChange={(e) => setRemote(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              {t('public.jobs.alerts.remoteOnly', 'Remote roles only')}
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-surface-800"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-accent-600 px-4 text-sm font-semibold text-white shadow-md shadow-brand-500/30 hover:from-brand-600 hover:to-accent-700 disabled:opacity-60',
                )}
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {submitting
                  ? t('public.jobs.alerts.submitting', 'Saving…')
                  : t('public.jobs.alerts.submit', 'Create alert')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return cn(
    'block w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:bg-surface-800 dark:text-gray-100',
    hasError
      ? 'border-red-300 dark:border-red-500/50'
      : 'border-gray-200 dark:border-surface-700',
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}
