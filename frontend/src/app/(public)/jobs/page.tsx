'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  MapPin,
  Briefcase,
  Building2,
  Calendar,
  DollarSign,
  Globe2,
  Filter,
  X,
  ArrowUpRight,
  Sparkles,
  Users,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  useLocaleStore,
  translate,
  interpolate,
  formatRelativeTime,
  formatNumber,
  pluralize,
} from '@/stores/locale-store';
import { cn } from '@/lib/utils';

type Job = {
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
  remote?: boolean;
  experience_years_min?: number | null;
  experience_years_max?: number | null;
  skills?: string[];
};

type SortKey = 'newest' | 'oldest' | 'salaryHigh' | 'salaryLow' | 'titleAsc';

const EMPLOYMENT_KEYS = ['full_time', 'part_time', 'contract', 'internship', 'temporary'];

const EXPERIENCE_BUCKETS = [
  { key: 'entry', min: 0, max: 1 },
  { key: 'mid', min: 2, max: 4 },
  { key: 'senior', min: 5, max: 7 },
  { key: 'lead', min: 8, max: 12 },
  { key: 'executive', min: 13, max: 99 },
] as const;

type ExperienceKey = (typeof EXPERIENCE_BUCKETS)[number]['key'];

const PAGE_SIZE = 12;

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

function experienceBucket(j: Job): ExperienceKey | null {
  const y = j.experience_years_min ?? j.experience_years_max ?? null;
  if (y == null) return null;
  const bucket = EXPERIENCE_BUCKETS.find((b) => y >= b.min && y <= b.max);
  return bucket?.key ?? null;
}

function isOpen(j: Job): boolean {
  const s = (j.status || 'open').toLowerCase();
  return s === 'open';
}

export default function PublicJobsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [department, setDepartment] = useState<string>('all');
  const [location, setLocation] = useState<string>('all');
  const [employmentType, setEmploymentType] = useState<string>('all');
  const [experience, setExperience] = useState<string>('all');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { status: 'open', limit: '100' };
      const res = await api.jobs.list(params);
      const list = ((res as any)?.data || (res as any)?.items || []) as Job[];
      setJobs(list.filter(isOpen));
    } catch (err) {
      const e = err as APIError;
      setError(e?.message || t('public.jobs.detail.loadJob', "We couldn't load jobs."));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const departments = useMemo(() => {
    const s = new Set<string>();
    jobs.forEach((j) => {
      const d = (j.department || j.company || '').trim();
      if (d) s.add(d);
    });
    return Array.from(s).sort();
  }, [jobs]);

  const locations = useMemo(() => {
    const s = new Set<string>();
    jobs.forEach((j) => {
      const l = (j.location || '').trim();
      if (l) s.add(l);
    });
    return Array.from(s).sort();
  }, [jobs]);

  const filtered = useMemo(() => {
    let result = jobs.slice();
    if (debouncedQuery) {
      result = result.filter((j) => {
        const haystack = [
          j.title,
          j.company || '',
          j.department || '',
          j.location || '',
          (j.skills || []).join(' '),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(debouncedQuery);
      });
    }
    if (department !== 'all') {
      result = result.filter((j) => (j.department || j.company || '').trim() === department);
    }
    if (location !== 'all') {
      result = result.filter((j) => (j.location || '').trim() === location);
    }
    if (employmentType !== 'all') {
      result = result.filter((j) => (j.employment_type || '').toLowerCase() === employmentType);
    }
    if (experience !== 'all') {
      result = result.filter((j) => experienceBucket(j) === experience);
    }
    if (remoteOnly) {
      result = result.filter((j) => !!j.remote);
    }

    result.sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        case 'salaryHigh':
          return (b.salary_max || 0) - (a.salary_max || 0);
        case 'salaryLow':
          return (a.salary_min || Number.MAX_SAFE_INTEGER) - (b.salary_min || Number.MAX_SAFE_INTEGER);
        case 'titleAsc':
          return a.title.localeCompare(b.title);
        case 'newest':
        default:
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
    });
    return result;
  }, [jobs, debouncedQuery, department, location, employmentType, experience, remoteOnly, sort]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, department, location, employmentType, experience, remoteOnly, sort]);

  const visible = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);
  const hasMore = visible.length < filtered.length;

  const activeFilterCount =
    (department !== 'all' ? 1 : 0) +
    (location !== 'all' ? 1 : 0) +
    (employmentType !== 'all' ? 1 : 0) +
    (experience !== 'all' ? 1 : 0) +
    (remoteOnly ? 1 : 0);

  const clearFilters = () => {
    setDepartment('all');
    setLocation('all');
    setEmploymentType('all');
    setExperience('all');
    setRemoteOnly(false);
    setQuery('');
  };

  const companiesCount = useMemo(
    () => new Set(jobs.map((j) => (j.company || j.department || '').trim()).filter(Boolean)).size,
    [jobs],
  );

  const resultsLabel = useMemo(() => {
    if (filtered.length === jobs.length) {
      return interpolate(t('public.jobs.resultsCount', '{count, plural, one {# open position} other {# open positions}}'), {
        count: filtered.length,
      });
    }
    return t('public.jobs.resultsCountFiltered', 'Showing {shown} of {total} positions')
      .replace('{shown}', String(filtered.length))
      .replace('{total}', String(jobs.length));
  }, [filtered.length, jobs.length, t]);

  const heroSubtitle = interpolate(
    t(
      'public.jobs.hero.subtitle',
      'Browse {count} open positions at companies using AI-ROS to hire smarter.',
    ),
    { count: jobs.length },
  );

  return (
    <div>
      <section className="relative overflow-hidden border-b border-gray-200 bg-gradient-to-b from-white via-brand-50/40 to-white dark:border-surface-800 dark:from-surface-950 dark:via-brand-950/30 dark:to-surface-950">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-mesh opacity-60"
        />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 backdrop-blur dark:border-brand-800 dark:bg-surface-900/60 dark:text-brand-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t('public.jobs.hero.eyebrow', 'Careers')}
            </div>
            <h1 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
              {t('public.jobs.hero.title', 'Find your next role')}
            </h1>
            <p className="mt-4 text-base sm:text-lg text-gray-600 dark:text-gray-300">
              {heroSubtitle}
            </p>

            <div className="mt-8">
              <label htmlFor="public-jobs-search" className="sr-only">
                {t('public.jobs.hero.searchAria', 'Search open positions')}
              </label>
              <div className="relative mx-auto max-w-2xl">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
                  aria-hidden="true"
                />
                <input
                  id="public-jobs-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t(
                    'public.jobs.hero.searchPlaceholder',
                    'Search by title, keyword…',
                  )}
                  className="w-full rounded-2xl border border-gray-200 bg-white/95 py-3.5 pl-12 pr-4 text-sm sm:text-base shadow-sm shadow-brand-500/5 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-surface-700 dark:bg-surface-900/80 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-brand-500 dark:focus:ring-brand-500/30"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-surface-800 dark:hover:text-gray-200"
                    aria-label={t('common.cancel', 'Cancel')}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                {formatNumber(jobs.length, locale as any)} {t('public.jobs.hero.eyebrow', 'open positions')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                {formatNumber(companiesCount, locale as any)} {t('public.footer.company', 'companies')}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <aside
            className={cn(
              'lg:w-72 lg:shrink-0',
              showFilters ? 'block' : 'hidden lg:block',
            )}
            aria-label={t('public.jobs.filters.title', 'Filters')}
          >
            <div className="lg:sticky lg:top-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
              <div className="flex items-center justify-between">
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  {t('public.jobs.filters.title', 'Filters')}
                </h2>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                  >
                    {t('public.jobs.filters.clearAll', 'Clear all')}
                  </button>
                )}
              </div>

              <div className="mt-5 space-y-5">
                <FilterSelect
                  label={t('public.jobs.filters.department', 'Department')}
                  value={department}
                  onChange={setDepartment}
                  options={departments.map((d) => ({ value: d, label: d }))}
                  allLabel={t('public.jobs.filters.departmentAll', 'All departments')}
                />
                <FilterSelect
                  label={t('public.jobs.filters.location', 'Location')}
                  value={location}
                  onChange={setLocation}
                  options={locations.map((l) => ({ value: l, label: l }))}
                  allLabel={t('public.jobs.filters.locationAll', 'All locations')}
                />
                <FilterSelect
                  label={t('public.jobs.filters.employmentType', 'Employment type')}
                  value={employmentType}
                  onChange={setEmploymentType}
                  options={EMPLOYMENT_KEYS.map((k) => ({
                    value: k,
                    label: t(`public.jobs.employment.${k}`, k.replace('_', ' ')),
                  }))}
                  allLabel={t('public.jobs.filters.employmentTypeAll', 'All types')}
                />
                <FilterSelect
                  label={t('public.jobs.filters.experienceLevel', 'Experience level')}
                  value={experience}
                  onChange={setExperience}
                  options={EXPERIENCE_BUCKETS.map((b) => ({
                    value: b.key,
                    label: t(`public.jobs.experience.${b.key}`, b.key),
                  }))}
                  allLabel={t('public.jobs.filters.experienceLevelAll', 'All levels')}
                />

                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remoteOnly}
                    onChange={(e) => setRemoteOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <Globe2 className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  {t('public.jobs.filters.remote', 'Remote only')}
                </label>
              </div>
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
                {resultsLabel}
                {activeFilterCount > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                    {t('public.jobs.filters.activeCount', '{count} active').replace(
                      '{count}',
                      String(activeFilterCount),
                    )}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilters((s) => !s)}
                  className="lg:hidden inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
                >
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  {t('public.jobs.filters.title', 'Filters')}
                </button>
                <SortControl sort={sort} onChange={setSort} />
              </div>
            </div>

            <div className="mt-6">
              {loading ? (
                <JobsGridSkeleton />
              ) : error ? (
                <ErrorState
                  message={error}
                  onRetry={load}
                  retryLabel={t('common.retry', 'Retry')}
                />
              ) : filtered.length === 0 ? (
                <NoResults onReset={clearFilters} />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {visible.map((j) => (
                      <JobCard key={j.id} job={j} />
                    ))}
                  </div>
                  {hasMore && (
                    <div className="mt-10 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setPage((p) => p + 1)}
                        className="inline-flex h-11 items-center rounded-lg border border-gray-200 bg-white px-6 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
                      >
                        {t('public.jobs.loadMore', 'Load more')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100"
      >
        <option value="all">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SortControl({
  sort,
  onChange,
}: {
  sort: SortKey;
  onChange: (s: SortKey) => void;
}) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const options: { value: SortKey; label: string }[] = [
    { value: 'newest', label: t('public.jobs.sort.newest', 'Newest') },
    { value: 'oldest', label: t('public.jobs.sort.oldest', 'Oldest') },
    { value: 'salaryHigh', label: t('public.jobs.sort.salaryHigh', 'Salary: high to low') },
    { value: 'salaryLow', label: t('public.jobs.sort.salaryLow', 'Salary: low to high') },
    { value: 'titleAsc', label: t('public.jobs.sort.titleAsc', 'Title: A→Z') },
  ];
  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
      <span className="hidden sm:inline">{t('public.jobs.sort.label', 'Sort by')}</span>
      <select
        value={sort}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function JobCard({ job }: { job: Job }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const salary = formatSalaryRange(job.salary_min, job.salary_max, job.currency || null, locale);
  const department = (job.department || job.company || '').trim();
  const isNew = useMemo(() => {
    if (!job.created_at) return false;
    const ageMs = Date.now() - new Date(job.created_at).getTime();
    return ageMs < 1000 * 60 * 60 * 24 * 7;
  }, [job.created_at]);
  const postedLabel = job.created_at
    ? t('public.jobs.card.posted', 'Posted {when}').replace('{when}', formatRelativeTime(job.created_at, locale))
    : '';
  const applicantsLabel = interpolate(
    t('public.jobs.card.applicants', '{count} applicants'),
    { count: job.applicants_count || 0 },
  );
  const employmentLabel = job.employment_type
    ? t(`public.jobs.employment.${job.employment_type}`, job.employment_type.replace('_', ' '))
    : null;

  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/10 dark:border-surface-800 dark:bg-surface-900 dark:hover:border-brand-500/50 dark:hover:shadow-brand-500/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="truncate font-medium">
              {department || t('public.jobs.card.departmentFallback', 'General')}
            </span>
            {job.remote && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Globe2 className="h-3 w-3" aria-hidden="true" />
                {t('public.jobs.remote', 'Remote')}
              </span>
            )}
            {isNew && (
              <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                {t('public.jobs.card.new', 'New')}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-gray-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">
            <Link href={`/jobs/${job.id}`} className="line-clamp-2 focus:outline-none focus-visible:underline">
              <span aria-hidden="true" className="absolute inset-0 rounded-2xl" />
              {job.title}
            </Link>
          </h3>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm text-gray-600 dark:text-gray-300">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <span className="truncate">{job.location}</span>
        </div>
        {employmentLabel && (
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <span>{employmentLabel}</span>
          </div>
        )}
        {salary ? (
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <span className="font-medium text-gray-800 dark:text-gray-100">{salary}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-gray-400">
            <DollarSign className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="italic">{t('public.jobs.card.salaryUndisclosed', 'Salary undisclosed')}</span>
          </div>
        )}
        {postedLabel && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{postedLabel}</span>
          </div>
        )}
      </dl>

      {(job.applicants_count ?? 0) > 0 && (
        <div className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-surface-800 dark:text-gray-300">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {applicantsLabel}
        </div>
      )}

      <div className="mt-6 flex items-center justify-end pt-4 border-t border-gray-100 dark:border-surface-800 relative z-10">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 group-hover:text-brand-700 dark:text-brand-400 dark:group-hover:text-brand-300">
          {t('public.jobs.card.viewDetails', 'View details')}
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

function JobsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-64 rounded-2xl border border-gray-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900 animate-pulse-soft"
        >
          <div className="h-3 w-24 rounded bg-gray-200 dark:bg-surface-800" />
          <div className="mt-3 h-5 w-3/4 rounded bg-gray-200 dark:bg-surface-800" />
          <div className="mt-6 space-y-2">
            <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-surface-800" />
            <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-surface-800" />
            <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-surface-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NoResults({ onReset }: { onReset: () => void }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center dark:border-surface-700 dark:bg-surface-900">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-surface-800">
        <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
        {t('public.jobs.noResults.title', 'No open positions match your filters')}
      </h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {t(
          'public.jobs.noResults.description',
          'Try adjusting your search or clearing the filters to see more roles.',
        )}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
      >
        {t('public.jobs.noResults.cta', 'Clear all filters')}
      </button>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center dark:border-red-900/50 dark:bg-red-950/20">
      <p className="text-sm font-medium text-red-800 dark:text-red-200">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-9 items-center rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
      >
        {retryLabel}
      </button>
    </div>
  );
}
