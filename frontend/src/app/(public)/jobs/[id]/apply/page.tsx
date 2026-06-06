'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Mail,
  MapPin,
  Phone,
  Linkedin,
  Globe2,
  User,
  Upload,
  Briefcase,
  Sparkles,
  CircleDot,
  Save,
  Trash2,
  AlertCircle,
  Check,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';
import { useToast } from '@/hooks';
import { FileUpload } from '@/components/ui/file-upload';
import {
  useApplyDraft,
  useApplicationHistory,
} from '@/lib/public-job-store';
import { cn } from '@/lib/utils';

type JobDetail = {
  id: string;
  title: string;
  company?: string | null;
  department?: string | null;
  location: string;
  employment_type?: string | null;
  status?: string;
};

type ResumeMeta = { name: string; size: number; type: string };

const STEPS = [
  { key: 'personal', icon: User },
  { key: 'cover', icon: FileText },
  { key: 'questions', icon: Briefcase },
  { key: 'review', icon: Check },
] as const;

const PHONE_RE = /^[+]?[\d\s().-]{6,}$/;
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i;

const SCREENING_FIELDS = [
  { key: 'work_auth', labelKey: 'public.jobs.apply.questions.workAuth', type: 'radio', options: ['yes', 'no', 'sponsorship'] },
  { key: 'notice_period', labelKey: 'public.jobs.apply.questions.notice', type: 'select', options: ['immediate', 'two_weeks', 'one_month', 'two_months', 'other'] },
  { key: 'salary_expectation', labelKey: 'public.jobs.apply.questions.salary', type: 'text' },
  { key: 'referral_source', labelKey: 'public.jobs.apply.questions.referral', type: 'select', options: ['job_board', 'social', 'referral', 'search', 'company_site', 'other'] },
  { key: 'start_date', labelKey: 'public.jobs.apply.questions.startDate', type: 'text' },
] as const;

const TOTAL_STEPS = STEPS.length;

export default function ApplyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { push, ToastContainer } = useToast();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const { draft, update, clear, hydrated } = useApplyDraft(id || '');
  const { addEntry } = useApplicationHistory();

  const [step, setStep] = useState(0);
  const [resumeFile, setResumeFile] = useState<ResumeMeta | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string; refCode: string } | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const res = await api.jobs.get(id);
        const j = res as JobDetail;
        const status = (j.status || '').toLowerCase();
        if (status && status !== 'open') {
          setNotFound(true);
          setJob(null);
          return;
        }
        setJob(j);
      } catch (err) {
        const e = err as APIError;
        if (e?.status === 404) {
          setNotFound(true);
        } else {
          push(
            'error',
            e?.message ||
              t('public.jobs.apply.errors.loadJob', "We couldn't load this job."),
          );
        }
        setJob(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, push, t]);

  useEffect(() => {
    if (hydrated && draft) {
      setStep(Math.min(Math.max(0, draft.step || 0), TOTAL_STEPS - 1));
      setResumeFile(draft.resumeMeta || null);
      if (draft.consent) setConsent(draft.consent);
    }
  }, [hydrated, draft]);

  useEffect(() => {
    if (!hydrated || !draft || submitted) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      update({
        step,
        personal: draft.personal,
        resumeMeta: resumeFile,
        coverLetter: draft.coverLetter,
        answers: draft.answers,
        consent,
      });
    }, 400);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, consent, resumeFile, draft?.coverLetter, draft?.personal, draft?.answers]);

  const personal = draft?.personal || {};
  const coverLetter = draft?.coverLetter || '';
  const answers = draft?.answers || {};

  const setPersonal = (patch: Partial<NonNullable<typeof draft>['personal']>) => {
    update({ personal: { ...personal, ...patch } });
  };
  const setCoverLetter = (v: string) => update({ coverLetter: v });
  const setAnswer = (key: string, value: string) => {
    update({ answers: { ...answers, [key]: value } });
  };

  const step1Valid = useMemo(() => {
    if (!personal.full_name || personal.full_name.trim().length < 2) return false;
    if (!personal.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email.trim())) return false;
    if (personal.phone && !PHONE_RE.test(personal.phone.trim())) return false;
    if (personal.linkedin && !URL_RE.test(personal.linkedin.trim())) return false;
    if (personal.portfolio && !URL_RE.test(personal.portfolio.trim())) return false;
    return true;
  }, [personal]);

  const step2Valid = useMemo(() => {
    return coverLetter.trim().length === 0 || coverLetter.trim().length >= 30;
  }, [coverLetter]);

  const step3Valid = useMemo(() => {
    return !!answers.work_auth;
  }, [answers]);

  const stepValid = (s: number) => {
    if (s === 0) return step1Valid;
    if (s === 1) return step2Valid;
    if (s === 2) return step3Valid;
    if (s === 3) return consent;
    return false;
  };

  const goNext = () => {
    if (!stepValid(step)) return;
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      handleSubmit();
    }
  };

  const goBack = () => {
    if (step === 0) {
      router.push(`/jobs/${id}`);
    } else {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    if (!job || !personal.full_name || !personal.email) return;
    setSubmitting(true);
    try {
      const candidate = await api.candidates.create({
        full_name: personal.full_name.trim(),
        email: personal.email.trim(),
        location: personal.location?.trim() || undefined,
        headline: personal.headline?.trim() || job.title,
        source: 'public_apply',
        profile: {
          contact: {
            email: personal.email.trim(),
            phone: personal.phone?.trim() || undefined,
            location: personal.location?.trim() || undefined,
            linkedin: personal.linkedin?.trim() || undefined,
            portfolio: personal.portfolio?.trim() || undefined,
          },
          summary: coverLetter.trim() || undefined,
          skills: [],
          experience: [],
        } as unknown as Parameters<typeof api.candidates.create>[0]['profile'],
        ...(coverLetter.trim() ||
        answers.notice_period ||
        answers.work_auth ||
        answers.salary_expectation ||
        answers.start_date ||
        answers.referral_source
          ? {
              extras: {
                cover_letter: coverLetter.trim() || undefined,
                notice_period: answers.notice_period || undefined,
                work_authorization:
                  answers.work_auth === 'yes'
                    ? 'authorized'
                    : answers.work_auth === 'sponsorship'
                      ? 'needs_sponsorship'
                      : answers.work_auth === 'no'
                        ? 'not_authorized'
                        : undefined,
                salary_expectation: answers.salary_expectation?.trim() || undefined,
                start_date: answers.start_date?.trim() || undefined,
                referral_source: answers.referral_source || undefined,
              },
            }
          : {}),
      } as unknown as Parameters<typeof api.candidates.create>[0]);
      let resumeId: string | undefined;
      if (resumeFile && candidate?.id) {
        try {
          const content = await fileToBase64(resumeFile as unknown as File & ResumeMeta);
          const res = await api.resumes.upload({
            candidate_id: candidate.id,
            file_name: resumeFile.name,
            mime_type: resumeFile.type,
            content_base64: content,
          });
          resumeId = res?.id;
        } catch (err) {
          // Resume upload failure shouldn't block the application — log and continue.
          // eslint-disable-next-line no-console
          console.warn('Resume upload failed', err);
        }
      }
      const record = addEntry({
        jobId: job.id,
        jobTitle: job.title,
        company: job.company ?? job.department ?? null,
        email: personal.email.trim(),
        status: 'received',
        candidateId: candidate?.id,
        ...(resumeId ? { resumeId } : {}),
      });
      setSubmitted({ id: record.id, refCode: record.id.slice(-8).toUpperCase() });
      clear();
      push('success', t('public.jobs.apply.success.title', 'Application submitted'));
    } catch (err) {
      const e = err as APIError;
      push(
        'error',
        e?.message || t('public.jobs.apply.errors.submit', "We couldn't submit your application."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDiscard = () => {
    if (!window.confirm(t('public.jobs.apply.discardConfirm', 'Discard this draft?'))) return;
    clear();
    setStep(0);
    setResumeFile(null);
    setConsent(false);
    router.push(`/jobs/${id}`);
  };

  if (loading) {
    return <ApplySkeleton />;
  }

  if (notFound || !job) {
    return (
      <section className="mx-auto max-w-2xl px-4 sm:px-6 py-24 text-center">
        <Briefcase className="mx-auto h-10 w-10 text-gray-400" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
          {t('public.jobs.apply.notFound', 'This job is no longer accepting applications.')}
        </h1>
        <Link
          href="/jobs"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {t('public.jobs.detail.backToJobs', '← Back to all open positions')}
        </Link>
      </section>
    );
  }

  if (submitted) {
    return <SuccessScreen job={job} refCode={submitted.refCode} />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {step === 0
          ? t('public.jobs.detail.backToJobs', '← Back to job')
          : t('public.jobs.apply.back', '← Back')}
      </button>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">
          {t('public.jobs.apply.eyebrow', 'Apply')}
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          {job.title}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {job.company || job.department || ''} · {job.location}
        </p>
      </div>

      <ProgressBar current={step} />

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-surface-800 dark:bg-surface-900 sm:p-8">
        {step === 0 && (
          <StepPersonal
            personal={personal}
            onChange={setPersonal}
            resumeFile={resumeFile}
            onResumeFile={(f) => setResumeFile(f)}
            t={t}
          />
        )}
        {step === 1 && (
          <StepCover
            value={coverLetter}
            onChange={setCoverLetter}
            jobTitle={job.title}
            t={t}
          />
        )}
        {step === 2 && (
          <StepQuestions
            answers={answers}
            onChange={setAnswer}
            t={t}
          />
        )}
        {step === 3 && (
          <StepReview
            personal={personal}
            coverLetter={coverLetter}
            answers={answers}
            consent={consent}
            onConsentChange={setConsent}
            t={t}
            job={job}
          />
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleDiscard}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t('public.jobs.apply.discard', 'Discard draft')}
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {t('public.jobs.apply.draft', 'Auto-saved')}
            </span>
            <button
              type="button"
              onClick={goBack}
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('public.jobs.apply.back', 'Back')}
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!stepValid(step) || submitting}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-accent-600 px-5 text-sm font-semibold text-white shadow-md shadow-brand-500/30 hover:from-brand-600 hover:to-accent-700 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {step < TOTAL_STEPS - 1
                ? t('public.jobs.apply.continue', 'Continue')
                : submitting
                  ? t('public.jobs.apply.submitting', 'Submitting…')
                  : t('public.jobs.apply.submit', 'Submit application')}
              {step < TOTAL_STEPS - 1 ? (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}

function ProgressBar({ current }: { current: number }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  return (
    <ol
      role="list"
      aria-label={t('public.jobs.apply.steps.label', 'Application steps')}
      className="mt-8 flex items-center justify-between gap-2"
    >
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const state = i < current ? 'done' : i === current ? 'active' : 'pending';
        return (
          <li key={s.key} className="flex-1 flex items-center gap-2 min-w-0">
            <div
              aria-current={state === 'active' ? 'step' : undefined}
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                state === 'done' &&
                  'border-brand-500 bg-brand-500 text-white',
                state === 'active' &&
                  'border-brand-500 bg-white text-brand-600 dark:bg-surface-900 dark:text-brand-300',
                state === 'pending' &&
                  'border-gray-200 bg-white text-gray-400 dark:border-surface-700 dark:bg-surface-900',
              )}
            >
              {state === 'done' ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Icon className="h-4 w-4" aria-hidden="true" />
              )}
            </div>
            <span
              className={cn(
                'hidden sm:block text-xs font-medium truncate',
                state === 'pending'
                  ? 'text-gray-400 dark:text-gray-500'
                  : 'text-gray-700 dark:text-gray-200',
              )}
            >
              {t(`public.jobs.apply.steps.${s.key}`, s.key)}
            </span>
            {i < STEPS.length - 1 && (
              <div
                aria-hidden="true"
                className={cn(
                  'hidden sm:block h-px flex-1',
                  i < current ? 'bg-brand-500' : 'bg-gray-200 dark:bg-surface-800',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepPersonal({
  personal,
  onChange,
  resumeFile,
  onResumeFile,
  t,
}: {
  personal: NonNullable<ReturnType<typeof useApplyDraft>['draft']>['personal'];
  onChange: (patch: Partial<NonNullable<ReturnType<typeof useApplyDraft>['draft']>['personal']>) => void;
  resumeFile: ResumeMeta | null;
  onResumeFile: (f: ResumeMeta | null) => void;
  t: (key: string, fb?: string) => string;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        {t('public.jobs.apply.steps.personal', 'Your details')}
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t(
          'public.jobs.apply.personalHelp',
          'We will use these to contact you about this application.',
        )}
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          id="apply-full-name"
          label={t('public.jobs.apply.fields.fullName', 'Full name')}
          required
        >
          <input
            id="apply-full-name"
            type="text"
            autoComplete="name"
            value={personal.full_name || ''}
            onChange={(e) => onChange({ full_name: e.target.value })}
            className={inputClass()}
            required
          />
        </Field>
        <Field
          id="apply-email"
          label={t('public.jobs.apply.fields.email', 'Email')}
          required
        >
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              id="apply-email"
              type="email"
              autoComplete="email"
              value={personal.email || ''}
              onChange={(e) => onChange({ email: e.target.value })}
              className={cn(inputClass(), 'pl-9')}
              required
            />
          </div>
        </Field>
        <Field id="apply-phone" label={t('public.jobs.apply.fields.phone', 'Phone')}>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              id="apply-phone"
              type="tel"
              autoComplete="tel"
              value={personal.phone || ''}
              onChange={(e) => onChange({ phone: e.target.value })}
              className={cn(inputClass(), 'pl-9')}
            />
          </div>
        </Field>
        <Field id="apply-location" label={t('public.jobs.apply.fields.location', 'Location')}>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              id="apply-location"
              type="text"
              autoComplete="address-level2"
              value={personal.location || ''}
              onChange={(e) => onChange({ location: e.target.value })}
              className={cn(inputClass(), 'pl-9')}
            />
          </div>
        </Field>
        <Field id="apply-headline" label={t('public.jobs.apply.fields.headline', 'Headline')}>
          <input
            id="apply-headline"
            type="text"
            value={personal.headline || ''}
            onChange={(e) => onChange({ headline: e.target.value })}
            placeholder={t('public.jobs.apply.fields.headlinePlaceholder', 'e.g. Senior Frontend Engineer')}
            className={inputClass()}
          />
        </Field>
        <Field id="apply-linkedin" label="LinkedIn">
          <div className="relative">
            <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              id="apply-linkedin"
              type="url"
              value={personal.linkedin || ''}
              onChange={(e) => onChange({ linkedin: e.target.value })}
              className={cn(inputClass(), 'pl-9')}
              placeholder="https://linkedin.com/in/…"
            />
          </div>
        </Field>
        <Field
          id="apply-portfolio"
          label={t('public.jobs.apply.fields.portfolio', 'Portfolio or website')}
          fullWidth
        >
          <div className="relative">
            <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              id="apply-portfolio"
              type="url"
              value={personal.portfolio || ''}
              onChange={(e) => onChange({ portfolio: e.target.value })}
              className={cn(inputClass(), 'pl-9')}
              placeholder="https://…"
            />
          </div>
        </Field>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('public.jobs.apply.resume.title', 'Resume')}
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t(
            'public.jobs.apply.resume.help',
            'PDF, DOC, or DOCX — up to 5 MB. Optional but recommended.',
          )}
        </p>
        <div className="mt-3">
          {resumeFile ? (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-surface-700 dark:bg-surface-800">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {resumeFile.name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatSize(resumeFile.size)} · {resumeFile.type || 'file'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onResumeFile(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-surface-700"
                aria-label={t('public.jobs.apply.resume.remove', 'Remove resume')}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <FileUpload
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              maxSize={5 * 1024 * 1024}
              maxFiles={1}
              onFilesSelected={(files) => {
                const f = files[0];
                if (f) onResumeFile({ name: f.name, size: f.size, type: f.type });
              }}
              label={t('public.jobs.apply.resume.uploadLabel', 'Upload resume')}
              description={t(
                'public.jobs.apply.resume.uploadDesc',
                'Drag and drop or click to browse',
              )}
            />
          )}
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
            <AlertCircle className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function StepCover({
  value,
  onChange,
  jobTitle,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  jobTitle: string;
  t: (key: string, fb?: string) => string;
}) {
  const length = value.trim().length;
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        {t('public.jobs.apply.steps.cover', 'Cover letter')}
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t(
          'public.jobs.apply.coverHelp',
          'Optional. A short note about why you are a great fit for {title}.',
        ).replace('{title}', jobTitle)}
      </p>
      <div className="mt-4">
        <label htmlFor="apply-cover-letter" className="sr-only">
          {t('public.jobs.apply.fields.coverLetter', 'Cover letter')}
        </label>
        <textarea
          id="apply-cover-letter"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={10}
          placeholder={t(
            'public.jobs.apply.coverPlaceholder',
            'Tell the team what excites you about this role…',
          )}
          className={cn(inputClass(), 'min-h-[180px] resize-y leading-relaxed')}
        />
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            {interpolate(
              t('public.jobs.apply.coverCount', '{count} characters'),
              { count: length },
            )}
          </span>
          {length > 0 && length < 30 && (
            <span className="text-amber-600 dark:text-amber-400">
              {t('public.jobs.apply.coverMin', 'Minimum 30 characters to enable submission.')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StepQuestions({
  answers,
  onChange,
  t,
}: {
  answers: Record<string, string>;
  onChange: (key: string, value: string) => void;
  t: (key: string, fb?: string) => string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        {t('public.jobs.apply.steps.questions', 'A few quick questions')}
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t(
          'public.jobs.apply.questionsHelp',
          'These help the team evaluate your application.',
        )}
      </p>

      <div className="mt-6 space-y-6">
        <Field
          id="q-work-auth"
          label={t('public.jobs.apply.questions.workAuth', 'Are you legally authorized to work in the role\'s location?')}
          required
        >
          <div className="grid gap-2">
            {(['yes', 'no', 'sponsorship'] as const).map((opt) => (
              <label
                key={opt}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer',
                  answers.work_auth === opt
                    ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/10'
                    : 'border-gray-200 dark:border-surface-700',
                )}
              >
                <input
                  type="radio"
                  name="work_auth"
                  value={opt}
                  checked={answers.work_auth === opt}
                  onChange={() => onChange('work_auth', opt)}
                  className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                />
                {t(`public.jobs.apply.questions.workAuthOptions.${opt}`, opt)}
              </label>
            ))}
          </div>
        </Field>

        <Field
          id="q-notice"
          label={t('public.jobs.apply.questions.notice', 'Notice period')}
        >
          <select
            id="q-notice"
            value={answers.notice_period || ''}
            onChange={(e) => onChange('notice_period', e.target.value)}
            className={inputClass()}
          >
            <option value="">—</option>
            {(['immediate', 'two_weeks', 'one_month', 'two_months', 'other'] as const).map((opt) => (
              <option key={opt} value={opt}>
                {t(`public.jobs.apply.questions.noticeOptions.${opt}`, opt)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="q-salary"
          label={t('public.jobs.apply.questions.salary', 'Salary expectation (annual, optional)')}
        >
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
            <input
              id="q-salary"
              type="text"
              inputMode="numeric"
              value={answers.salary_expectation || ''}
              onChange={(e) => onChange('salary_expectation', e.target.value)}
              className={cn(inputClass(), 'pl-7')}
              placeholder="80000"
            />
          </div>
        </Field>

        <Field
          id="q-start"
          label={t('public.jobs.apply.questions.startDate', 'Earliest start date')}
        >
          <input
            id="q-start"
            type="text"
            value={answers.start_date || ''}
            onChange={(e) => onChange('start_date', e.target.value)}
            placeholder="e.g. March 15, 2026"
            className={inputClass()}
          />
        </Field>

        <Field
          id="q-referral"
          label={t('public.jobs.apply.questions.referral', 'How did you hear about us?')}
        >
          <select
            id="q-referral"
            value={answers.referral_source || ''}
            onChange={(e) => onChange('referral_source', e.target.value)}
            className={inputClass()}
          >
            <option value="">—</option>
            {(['job_board', 'social', 'referral', 'search', 'company_site', 'other'] as const).map((opt) => (
              <option key={opt} value={opt}>
                {t(`public.jobs.apply.questions.referralOptions.${opt}`, opt)}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

function StepReview({
  personal,
  coverLetter,
  answers,
  consent,
  onConsentChange,
  job,
  t,
}: {
  personal: NonNullable<ReturnType<typeof useApplyDraft>['draft']>['personal'];
  coverLetter: string;
  answers: Record<string, string>;
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  job: JobDetail;
  t: (key: string, fb?: string) => string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        {t('public.jobs.apply.steps.review', 'Review & submit')}
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t(
          'public.jobs.apply.reviewHelp',
          'Take a moment to confirm everything looks right before submitting.',
        )}
      </p>

      <dl className="mt-6 space-y-5">
        <ReviewSection
          title={t('public.jobs.apply.review.personal', 'Personal details')}
          onEdit={() => null}
          t={t}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <ReviewItem label={t('public.jobs.apply.fields.fullName', 'Full name')} value={personal.full_name} />
            <ReviewItem label={t('public.jobs.apply.fields.email', 'Email')} value={personal.email} />
            <ReviewItem label={t('public.jobs.apply.fields.phone', 'Phone')} value={personal.phone} />
            <ReviewItem label={t('public.jobs.apply.fields.location', 'Location')} value={personal.location} />
            <ReviewItem label="LinkedIn" value={personal.linkedin} />
            <ReviewItem label={t('public.jobs.apply.fields.portfolio', 'Portfolio')} value={personal.portfolio} />
          </div>
        </ReviewSection>

        <ReviewSection title={t('public.jobs.apply.review.cover', 'Cover letter')} t={t}>
          {coverLetter.trim() ? (
            <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">
              {coverLetter}
            </p>
          ) : (
            <p className="text-sm italic text-gray-500 dark:text-gray-400">
              {t('public.jobs.apply.review.coverEmpty', 'Not provided.')}
            </p>
          )}
        </ReviewSection>

        <ReviewSection title={t('public.jobs.apply.review.questions', 'Your answers')} t={t}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <ReviewItem
              label={t('public.jobs.apply.questions.workAuth', 'Work authorization')}
              value={
                answers.work_auth
                  ? t(`public.jobs.apply.questions.workAuthOptions.${answers.work_auth}`, answers.work_auth)
                  : '—'
              }
            />
            <ReviewItem
              label={t('public.jobs.apply.questions.notice', 'Notice period')}
              value={
                answers.notice_period
                  ? t(`public.jobs.apply.questions.noticeOptions.${answers.notice_period}`, answers.notice_period)
                  : '—'
              }
            />
            <ReviewItem
              label={t('public.jobs.apply.questions.salary', 'Salary expectation')}
              value={answers.salary_expectation}
            />
            <ReviewItem
              label={t('public.jobs.apply.questions.startDate', 'Start date')}
              value={answers.start_date}
            />
            <ReviewItem
              label={t('public.jobs.apply.questions.referral', 'Referral source')}
              value={
                answers.referral_source
                  ? t(`public.jobs.apply.questions.referralOptions.${answers.referral_source}`, answers.referral_source)
                  : '—'
              }
            />
          </div>
        </ReviewSection>

        <ReviewSection
          title={t('public.jobs.apply.review.target', 'Applying for')}
          t={t}
        >
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <p className="font-semibold">{job.title}</p>
            <p className="text-gray-500 dark:text-gray-400">
              {job.company || job.department || ''} · {job.location}
            </p>
          </div>
        </ReviewSection>
      </dl>

      <label
        htmlFor="apply-consent"
        className="mt-6 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 cursor-pointer"
      >
        <input
          id="apply-consent"
          type="checkbox"
          checked={consent}
          onChange={(e) => onConsentChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          {t(
            'public.jobs.apply.consent',
            'I confirm the information above is accurate and consent to the hiring team processing my application.',
          )}
        </span>
      </label>
    </div>
  );
}

function ReviewSection({
  title,
  t: _t,
  onEdit: _onEdit,
  children,
}: {
  title: string;
  t: (key: string, fb?: string) => string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-surface-700">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-gray-800 dark:text-gray-100">
        {value && value.trim() ? value : <span className="italic text-gray-400">—</span>}
      </dd>
    </div>
  );
}

function SuccessScreen({ job, refCode }: { job: JobDetail; refCode: string }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-16">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center dark:border-emerald-500/30 dark:bg-emerald-500/5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">
          {t('public.jobs.apply.success.title', 'Application submitted!')}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t(
            'public.jobs.apply.success.description',
            'Thanks for applying to {title}. The team will review your application and reach out if there is a match.',
          ).replace('{title}', job.title)}
        </p>
        <div className="mt-6 inline-flex flex-col items-center rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm dark:border-surface-700 dark:bg-surface-900">
          <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('public.jobs.apply.success.reference', 'Reference code')}
          </span>
          <span className="mt-1 font-mono text-base font-semibold text-gray-900 dark:text-white">
            {refCode}
          </span>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/jobs"
            className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t('public.jobs.apply.success.viewJobs', 'Browse more roles')}
          </Link>
          <Link
            href="/jobs/saved"
            className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
          >
            {t('public.jobs.apply.success.viewSaved', 'View saved jobs')}
          </Link>
        </div>

        <div className="mt-8 text-left rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-300">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            {t('public.jobs.apply.success.statusTitle', 'What happens next?')}
          </h2>
          <ol className="mt-3 space-y-2">
            <li className="flex items-start gap-2">
              <CircleDot className="mt-0.5 h-4 w-4 text-brand-500" aria-hidden="true" />
              <span>
                {t('public.jobs.apply.status.received', 'Application received')} —{' '}
                {t(
                  'public.jobs.apply.status.receivedHelp',
                  "We've logged your submission and the recruiter will see it shortly.",
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CircleDot className="mt-0.5 h-4 w-4 text-gray-300" aria-hidden="true" />
              <span>
                {t('public.jobs.apply.status.reviewing', 'Initial review')} —{' '}
                {t(
                  'public.jobs.apply.status.reviewingHelp',
                  'A recruiter reviews your background and decides on next steps.',
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CircleDot className="mt-0.5 h-4 w-4 text-gray-300" aria-hidden="true" />
              <span>
                {t('public.jobs.apply.status.interview', 'Interview loop')} —{' '}
                {t(
                  'public.jobs.apply.status.interviewHelp',
                  'Selected candidates are invited to chat with the team.',
                )}
              </span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  required,
  fullWidth,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
      >
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function inputClass(): string {
  return cn(
    'block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100',
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf('base64,');
      resolve(idx >= 0 ? result.slice(idx + 'base64,'.length) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function ApplySkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 animate-pulse-soft">
      <div className="h-3 w-24 rounded bg-gray-200 dark:bg-surface-800" />
      <div className="mt-6 h-7 w-1/2 rounded bg-gray-200 dark:bg-surface-800" />
      <div className="mt-2 h-3 w-1/3 rounded bg-gray-200 dark:bg-surface-800" />
      <div className="mt-8 h-10 w-full rounded-lg bg-gray-200 dark:bg-surface-800" />
      <div className="mt-8 h-72 w-full rounded-2xl bg-gray-200 dark:bg-surface-800" />
    </div>
  );
}
