'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  BookmarkX,
  Briefcase,
  MapPin,
  Building2,
  Globe2,
  DollarSign,
  Calendar,
  ArrowRight,
  BellRing,
  Search,
  X,
  Trash2,
} from 'lucide-react';
import { useSavedJobs } from '@/lib/public-job-store';
import {
  useLocaleStore,
  translate,
  formatRelativeTime,
  interpolate,
} from '@/stores/locale-store';
import { useToast } from '@/hooks';
import { SaveJobButton } from '@/components/public/save-job-button';
import { ShareMenu } from '@/components/public/share-menu';
import { JobAlertsDialog } from '@/components/public/job-alerts-dialog';
import { cn } from '@/lib/utils';

function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined,
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

export default function SavedJobsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { push, ToastContainer } = useToast();
  const { list, clear, hydrated } = useSavedJobs();

  const [query, setQuery] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((j) => {
      const haystack = [j.title, j.company || '', j.department || '', j.location || '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [list, query]);

  const handleClearAll = () => {
    if (!window.confirm(t('public.jobs.saved.clearConfirm', 'Remove all saved jobs?'))) return;
    clear();
    push('success', t('public.jobs.saved.cleared', 'All saved jobs removed.'));
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">
            {t('public.jobs.saved.eyebrow', 'Your shortlist')}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            {t('public.jobs.saved.title', 'Saved jobs')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {hydrated
              ? interpolate(
                  t(
                    'public.jobs.saved.subtitle',
                    '{count, plural, one {# job saved} other {# jobs saved}}',
                  ),
                  { count: list.length },
                )
              : '…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAlertsOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20"
          >
            <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
            {t('public.jobs.alertsCta', 'Create job alert')}
          </button>
          {list.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('public.jobs.saved.clearAll', 'Clear all')}
            </button>
          )}
        </div>
      </header>

      {hydrated && list.length > 0 && (
        <div className="mt-6">
          <label htmlFor="saved-search" className="sr-only">
            {t('public.jobs.saved.searchAria', 'Search saved jobs')}
          </label>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
              aria-hidden="true"
            />
            <input
              id="saved-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('public.jobs.saved.searchPlaceholder', 'Filter by title, company, location…')}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm text-gray-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('common.cancel', 'Clear')}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-surface-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-8">
        {!hydrated ? (
          <Skeleton />
        ) : list.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <NoMatches query={query} onClear={() => setQuery('')} t={t} />
        ) : (
          <ul
            role="list"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {filtered.map((j) => {
              const salary = formatSalaryRange(j.salary_min, j.salary_max, j.currency, locale);
              const department = (j.department || j.company || '').trim();
              const url = origin ? `${origin}/jobs/${j.id}` : `/jobs/${j.id}`;
              return (
                <li
                  key={j.id}
                  className="group relative flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-brand-300 hover:shadow-md dark:border-surface-800 dark:bg-surface-900 dark:hover:border-brand-500/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="truncate font-medium">
                          {department || t('public.jobs.card.departmentFallback', 'General')}
                        </span>
                        {j.remote && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <Globe2 className="h-3 w-3" aria-hidden="true" />
                            {t('public.jobs.remote', 'Remote')}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-gray-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">
                        <Link href={`/jobs/${j.id}`} className="line-clamp-2">
                          <span aria-hidden="true" className="absolute inset-0 rounded-2xl" />
                          {j.title}
                        </Link>
                      </h3>
                    </div>
                    <SaveJobButton job={j} size="sm" stopPropagation />
                  </div>

                  <dl className="mt-3 space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                      <span className="truncate">{j.location}</span>
                    </div>
                    {salary ? (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                        <span className="font-medium text-gray-800 dark:text-gray-100">
                          {salary}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-400">
                        <DollarSign className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="italic">
                          {t('public.jobs.card.salaryUndisclosed', 'Salary undisclosed')}
                        </span>
                      </div>
                    )}
                    {j.savedAt && (
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          {t('public.jobs.saved.savedOn', 'Saved {when}').replace(
                            '{when}',
                            formatRelativeTime(j.savedAt, locale),
                          )}
                        </span>
                      </div>
                    )}
                  </dl>

                  <div className="mt-4 flex items-center justify-between pt-3 border-t border-gray-100 dark:border-surface-800 relative z-10">
                    <ShareMenu
                      url={url}
                      title={j.title}
                      description={j.location}
                      align="left"
                      size="sm"
                    />
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 group-hover:text-brand-700 dark:text-brand-400 dark:group-hover:text-brand-300">
                      {t('public.jobs.card.viewDetails', 'View')}
                      <ArrowRight
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <JobAlertsDialog open={alertsOpen} onClose={() => setAlertsOpen(false)} />
      <ToastContainer />
    </div>
  );
}

function EmptyState() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-20 text-center dark:border-surface-700 dark:bg-surface-900">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
        <BookmarkX className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-gray-900 dark:text-white">
        {t('public.jobs.saved.empty.title', 'No saved jobs yet')}
      </h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {t(
          'public.jobs.saved.empty.description',
          'Tap the bookmark icon on any role to keep track of it here.',
        )}
      </p>
      <Link
        href="/jobs"
        className="mt-6 inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <Briefcase className="h-4 w-4" aria-hidden="true" />
        {t('public.jobs.saved.empty.cta', 'Browse open roles')}
      </Link>
    </div>
  );
}

function NoMatches({
  query,
  onClear,
  t,
}: {
  query: string;
  onClear: () => void;
  t: (key: string, fb?: string) => string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-surface-800 dark:bg-surface-900">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t('public.jobs.saved.noMatches', 'No saved jobs match "{query}".').replace(
          '{query}',
          query,
        )}
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
      >
        {t('public.jobs.saved.clearSearch', 'Clear search')}
      </button>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-44 rounded-2xl border border-gray-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900 animate-pulse-soft"
        >
          <div className="h-3 w-20 rounded bg-gray-200 dark:bg-surface-800" />
          <div className="mt-3 h-4 w-3/4 rounded bg-gray-200 dark:bg-surface-800" />
          <div className="mt-4 space-y-2">
            <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-surface-800" />
            <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-surface-800" />
          </div>
        </div>
      ))}
    </div>
  );
}
