'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MapPin,
  Briefcase,
  Building2,
  Calendar,
  DollarSign,
  Globe2,
  Share2,
  ExternalLink,
  Users,
  Clock,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  useLocaleStore,
  translate,
  interpolate,
  formatRelativeTime,
  formatNumber,
} from '@/stores/locale-store';
import { useToast } from '@/hooks';

type JobDetail = {
  id: string;
  title: string;
  company?: string | null;
  department?: string | null;
  location: string;
  employment_type?: string | null;
  status?: string;
  applicants_count?: number;
  created_at?: string;
  updated_at?: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency?: string | null;
  description?: string;
  requirements?: string[] | string | null;
  nice_to_have?: string[] | null;
  benefits?: string[] | null;
  skills?: string[] | null;
  experience_years_min?: number | null;
  experience_years_max?: number | null;
  remote?: boolean;
};

function formatSalaryRange(
  min: number | null,
  max: number | null,
  currency: string | null,
  locale: string,
): string {
  if (!min && !max) return '';
  const code = (currency || 'USD').toUpperCase();
  const tag = locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : 'en-US';
  try {
    const fmt = new Intl.NumberFormat(tag, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    });
    if (min && max) return `${fmt.format(min)} – ${fmt.format(max)}`;
    if (min) return `${fmt.format(min)}+`;
    return `≤ ${fmt.format(max as number)}`;
  } catch {
    if (min && max) return `${code} ${min} – ${max}`;
    if (min) return `${code} ${min}+`;
    return `≤ ${code} ${max}`;
  }
}

function asList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((s) => s.replace(/^[\s\-*•]+/, '').trim())
      .filter(Boolean);
  }
  return [];
}

export default function PublicJobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { push, ToastContainer } = useToast();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
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
          e?.message || t('public.jobs.apply.errors.loadJob', "We couldn't load this job."),
        );
      }
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [id, push, t]);

  useEffect(() => {
    load();
  }, [load]);

  const requirements = useMemo(() => asList(job?.requirements), [job?.requirements]);
  const niceToHave = useMemo(() => asList(job?.nice_to_have), [job?.nice_to_have]);
  const benefits = useMemo(() => asList(job?.benefits), [job?.benefits]);
  const skills = useMemo(() => (job?.skills || []).filter(Boolean), [job?.skills]);

  const department = (job?.department || job?.company || '').trim();
  const salary = job
    ? formatSalaryRange(job.salary_min, job.salary_max, job.currency || null, locale)
    : '';

  const experienceLabel = useMemo(() => {
    if (!job) return '';
    const min = job.experience_years_min ?? null;
    const max = job.experience_years_max ?? null;
    if (min == null && max == null) return '';
    if (min != null && max != null) {
      return t('public.jobs.detail.experienceYears', '{min}–{max} years')
        .replace('{min}', String(min))
        .replace('{max}', String(max));
    }
    if (min != null) return `${min}+ yrs`;
    return `≤ ${max} yrs`;
  }, [job, t]);

  const postedLabel = job?.created_at
    ? t('public.jobs.detail.posted', 'Posted {when}').replace(
        '{when}',
        formatRelativeTime(job.created_at, locale),
      )
    : '';

  const applicantsLabel =
    job?.applicants_count && job.applicants_count > 0
      ? interpolate(
          t(
            'public.jobs.detail.applicantsCount',
            '{count} applicants so far',
          ),
          { count: job.applicants_count },
        )
      : '';

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      if (navigator.share) {
        await navigator.share({ title: job?.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      push('success', t('public.jobs.detail.shareCopied', 'Link copied to clipboard'));
    } catch {
      /* noop */
    }
  };

  if (loading) {
    return <DetailSkeleton />;
  }

  if (notFound || !job) {
    return (
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-surface-800">
          <Briefcase className="h-7 w-7 text-gray-400" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">
          {t('public.jobs.detail.notFound', 'Job not found')}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {t('public.jobs.detail.notFoundDesc', 'This position may have been filled or removed.')}
        </p>
        <Link
          href="/jobs"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {t('public.jobs.detail.backToJobs', '← Back to all open positions')}
        </Link>
      </section>
    );
  }

  return (
    <article>
      <section className="border-b border-gray-200 bg-gradient-to-b from-white via-brand-50/40 to-white dark:border-surface-800 dark:from-surface-950 dark:via-brand-950/30 dark:to-surface-950">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <button
            type="button"
            onClick={() => router.push('/jobs')}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('public.jobs.detail.backToJobs', '← Back to all open positions')}
          </button>

          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                <span className="font-medium">
                  {department || t('public.jobs.detail.departmentFallback', 'General')}
                </span>
                {job.remote && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <Globe2 className="h-3 w-3" aria-hidden="true" />
                    {t('public.jobs.remote', 'Remote')}
                  </span>
                )}
              </div>
              <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
                {job.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600 dark:text-gray-300">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  {job.location}
                </span>
                {job.employment_type && (
                  <span className="inline-flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    {t(
                      `public.jobs.employment.${job.employment_type}`,
                      job.employment_type.replace('_', ' '),
                    )}
                  </span>
                )}
                {salary && (
                  <span className="inline-flex items-center gap-1.5 font-medium text-gray-800 dark:text-gray-100">
                    <DollarSign className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    {salary}
                  </span>
                )}
                {postedLabel && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    {postedLabel}
                  </span>
                )}
              </div>
              {applicantsLabel && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  {applicantsLabel}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:flex-col sm:items-stretch">
              <Link
                href={`/jobs/${job.id}/apply`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-accent-600 px-5 text-sm font-semibold text-white shadow-md shadow-brand-500/30 hover:from-brand-600 hover:to-accent-700"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {t('public.jobs.detail.applyCta', 'Apply now')}
              </Link>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                {t('public.jobs.detail.share', 'Share')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-10">
            {job.description && (
              <Block title={t('public.jobs.detail.section.description', 'About the role')}>
                <div className="prose prose-sm sm:prose-base max-w-none text-gray-700 dark:prose-invert dark:text-gray-200">
                  {job.description
                    .split(/\n\n+/)
                    .filter(Boolean)
                    .map((para, i) => (
                      <p key={i} className="whitespace-pre-line leading-relaxed">
                        {para}
                      </p>
                    ))}
                </div>
              </Block>
            )}

            {requirements.length > 0 && (
              <Block title={t('public.jobs.detail.section.requirements', 'Requirements')}>
                <ul className="space-y-2">
                  {requirements.map((r, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"
                        aria-hidden="true"
                      />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {niceToHave.length > 0 && (
              <Block title={t('public.jobs.detail.section.niceToHave', 'Nice to have')}>
                <ul className="space-y-2">
                  {niceToHave.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300"
                    >
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400"
                        aria-hidden="true"
                      />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {skills.length > 0 && (
              <Block title={t('public.jobs.detail.section.skills', 'Skills')}>
                <div className="flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </Block>
            )}

            {benefits.length > 0 && (
              <Block title={t('public.jobs.detail.section.benefits', 'Benefits')}>
                <ul className="space-y-2">
                  {benefits.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200"
                    >
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                        aria-hidden="true"
                      />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-surface-800 dark:bg-surface-900">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t('public.jobs.detail.employmentType', 'Employment')}
              </h2>
              <dl className="mt-4 space-y-4 text-sm">
                {job.employment_type && (
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">
                      {t('public.jobs.detail.employmentType', 'Employment')}
                    </dt>
                    <dd className="mt-0.5 font-medium text-gray-900 dark:text-white">
                      {t(
                        `public.jobs.employment.${job.employment_type}`,
                        job.employment_type.replace('_', ' '),
                      )}
                    </dd>
                  </div>
                )}
                {experienceLabel && (
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">
                      {t('public.jobs.detail.experience', 'Experience')}
                    </dt>
                    <dd className="mt-0.5 font-medium text-gray-900 dark:text-white">
                      {experienceLabel}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">
                    {t('public.jobs.detail.location', 'Location')}
                  </dt>
                  <dd className="mt-0.5 font-medium text-gray-900 dark:text-white">{job.location}</dd>
                </div>
                {department && (
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">
                      {t('public.jobs.detail.department', 'Department')}
                    </dt>
                    <dd className="mt-0.5 font-medium text-gray-900 dark:text-white">
                      {department}
                    </dd>
                  </div>
                )}
                {salary ? (
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">
                      {t('public.jobs.card.salaryUndisclosed', 'Salary')}
                    </dt>
                    <dd className="mt-0.5 font-medium text-gray-900 dark:text-white">{salary}</dd>
                  </div>
                ) : (
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">
                      {t('public.jobs.card.salaryUndisclosed', 'Salary')}
                    </dt>
                    <dd className="mt-0.5 italic text-gray-500 dark:text-gray-400">
                      {t('public.jobs.card.salaryUndisclosed', 'Salary undisclosed')}
                    </dd>
                  </div>
                )}
                {postedLabel && (
                  <div>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="inline h-3 w-3 mr-1" aria-hidden="true" />
                      {t('public.jobs.detail.posted', 'Posted').replace('Posted {when}', 'Posted')}
                    </dt>
                    <dd className="mt-0.5 text-gray-700 dark:text-gray-200">{postedLabel.replace(/^Posted\s+/i, '')}</dd>
                  </div>
                )}
              </dl>

              <Link
                href={`/jobs/${job.id}/apply`}
                className="mt-6 inline-flex w-full h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-accent-600 px-5 text-sm font-semibold text-white shadow-md shadow-brand-500/30 hover:from-brand-600 hover:to-accent-700"
              >
                {t('public.jobs.detail.applyCta', 'Apply now')}
              </Link>
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {t('public.jobs.detail.openInNewTab', 'Open in new tab')}
              </a>
            </div>
          </aside>
        </div>
      </section>
      <ToastContainer />
    </article>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-14 animate-pulse-soft">
      <div className="h-3 w-32 rounded bg-gray-200 dark:bg-surface-800" />
      <div className="mt-6 h-8 w-2/3 rounded bg-gray-200 dark:bg-surface-800" />
      <div className="mt-3 h-4 w-1/3 rounded bg-gray-200 dark:bg-surface-800" />
      <div className="mt-10 space-y-6">
        <div className="h-4 w-1/4 rounded bg-gray-200 dark:bg-surface-800" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-gray-200 dark:bg-surface-800" />
          <div className="h-3 w-5/6 rounded bg-gray-200 dark:bg-surface-800" />
          <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-surface-800" />
        </div>
      </div>
    </section>
  );
}
