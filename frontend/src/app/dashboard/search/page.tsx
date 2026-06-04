'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Users,
  Briefcase,
  Calendar,
  Workflow,
  X,
  Clock,
  TrendingUp,
  History,
  Hash,
  FileText,
} from 'lucide-react';
import { api } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  Breadcrumb,
  Avatar,
  useDebouncedValue,
  useLocalStorage,
} from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';

type Category = 'all' | 'candidates' | 'jobs' | 'interviews' | 'workflows';

interface CandidateResult {
  id: string;
  full_name?: string;
  name?: string;
  email?: string;
  status?: string;
  avatar?: string | null;
}

interface JobResult {
  id: string;
  title?: string;
  department?: string;
  location?: string;
  status?: string;
}

interface InterviewResult {
  id: string;
  candidate_name?: string;
  candidate?: { full_name?: string };
  scheduled_at?: string;
  type?: string;
  status?: string;
}

interface WorkflowResult {
  id: string;
  name?: string;
  is_active?: boolean;
  runs?: number;
  execution_count?: number;
}

interface Results {
  candidates: CandidateResult[];
  jobs: JobResult[];
  interviews: InterviewResult[];
  workflows: WorkflowResult[];
}

const EMPTY: Results = { candidates: [], jobs: [], interviews: [], workflows: [] };

const POPULAR_SUGGESTIONS = [
  'Frontend developer',
  'Senior engineer',
  'Remote',
  'Product manager',
  'Data scientist',
  'Engineering manager',
  'React',
  'Python',
];

const RECENT_KEY = 'airos_recent_searches';
const MAX_RECENT = 8;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(text: string | undefined | null, query: string): React.ReactNode {
  if (!text) return null;
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark
        key={i}
        className="bg-yellow-200 text-inherit rounded-sm px-0.5 dark:bg-yellow-400/30 dark:text-yellow-100"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default function SearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const initialQ = (params?.get('q') || '').trim();
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<Category>('all');
  const [recent, setRecent, hydrated] = useLocalStorage<string[]>(RECENT_KEY, []);

  const debounced = useDebouncedValue(query, 300);

  useEffect(() => {
    const q = debounced.trim();
    const currentQ = (params?.get('q') || '').trim();
    if (q === currentQ) return;
    const next = new URLSearchParams();
    if (q) next.set('q', q);
    const qs = next.toString();
    router.replace(qs ? `/dashboard/search?${qs}` : '/dashboard/search', { scroll: false });
  }, [debounced, params, router]);

  useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    Promise.allSettled([
      api.candidates.list({ q, limit: '20' }).catch(() => null),
      api.jobs.list({ q, limit: '20' }).catch(() => null),
      api.interviews.list({ q, limit: '20' }).catch(() => null),
      api.workflows.list({ q, limit: '20' }).catch(() => null),
    ]).then(([c, j, i, w]) => {
      if (cancelled) return;
      const pluck = (settled: PromiseSettledResult<any>): any[] => {
        const v: any = settled.status === 'fulfilled' ? settled.value : null;
        if (!v) return [];
        if (Array.isArray(v)) return v;
        return (v.data || v.items || v.results || []) as any[];
      };
      setResults({
        candidates: pluck(c) as CandidateResult[],
        jobs: pluck(j) as JobResult[],
        interviews: pluck(i) as InterviewResult[],
        workflows: pluck(w) as WorkflowResult[],
      });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const q = debounced.trim();
    if (!q || !hydrated) return;
    setRecent((prev) => {
      const filtered = prev.filter((s) => s.toLowerCase() !== q.toLowerCase());
      return [q, ...filtered].slice(0, MAX_RECENT);
    });
  }, [debounced, hydrated, setRecent]);

  const counts = useMemo(
    () => ({
      all:
        results.candidates.length +
        results.jobs.length +
        results.interviews.length +
        results.workflows.length,
      candidates: results.candidates.length,
      jobs: results.jobs.length,
      interviews: results.interviews.length,
      workflows: results.workflows.length,
    }),
    [results],
  );

  const showQuery = debounced.trim();
  const isIdle = !showQuery;
  const isEmpty = !loading && !!showQuery && counts.all === 0;

  const tabs: { id: Category; label: string; icon: React.ReactNode; count: number }[] = [
    {
      id: 'all',
      label: t('search.all', 'All'),
      icon: <Hash className="h-4 w-4" />,
      count: counts.all,
    },
    {
      id: 'candidates',
      label: t('nav.candidates', 'Candidates'),
      icon: <Users className="h-4 w-4" />,
      count: counts.candidates,
    },
    {
      id: 'jobs',
      label: t('nav.jobs', 'Jobs'),
      icon: <Briefcase className="h-4 w-4" />,
      count: counts.jobs,
    },
    {
      id: 'interviews',
      label: t('nav.interviews', 'Interviews'),
      icon: <Calendar className="h-4 w-4" />,
      count: counts.interviews,
    },
    {
      id: 'workflows',
      label: t('nav.workflows', 'Workflows'),
      icon: <Workflow className="h-4 w-4" />,
      count: counts.workflows,
    },
  ];

  const showCandidates =
    (category === 'all' || category === 'candidates') && results.candidates.length > 0;
  const showJobs = (category === 'all' || category === 'jobs') && results.jobs.length > 0;
  const showInterviews =
    (category === 'all' || category === 'interviews') && results.interviews.length > 0;
  const showWorkflows =
    (category === 'all' || category === 'workflows') && results.workflows.length > 0;

  const noneInCategory =
    !loading && !!showQuery && counts.all > 0 && category !== 'all' && counts[category] === 0;

  const clearRecent = () => setRecent([]);

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100">
          <Search className="h-7 w-7 text-blue-600 dark:text-brand-400" aria-hidden="true" />
          {t('search.title', 'Search')}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t(
            'search.subtitle',
            'Find candidates, jobs, interviews, and workflows in one place.',
          )}
        </p>
      </header>

      <Card>
        <CardContent className="p-4">
          <label htmlFor="global-search-input" className="sr-only">
            {t('common.search', 'Search')}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
            <input
              id="global-search-input"
              type="search"
              role="searchbox"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(
                'search.placeholder',
                'Search candidates, jobs, interviews, workflows...',
              )}
              aria-label={t('common.search', 'Search')}
              aria-busy={loading || undefined}
              aria-controls="search-results"
              className="h-12 w-full rounded-lg border border-gray-200 bg-gray-50 pl-11 pr-12 text-base text-gray-900 placeholder-gray-400 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:bg-surface-900"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('search.clear', 'Clear search')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-400 transition hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {!isIdle && (
        <div
          role="tablist"
          aria-label={t('search.categories', 'Result categories')}
          className="scrollbar-thin flex items-center gap-1 overflow-x-auto border-b border-gray-200 pb-1 dark:border-surface-700"
        >
          {tabs.map((tab) => {
            const active = category === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`search-tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`search-panel-${tab.id}`}
                onClick={() => setCategory(tab.id)}
                className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? 'border-blue-600 text-blue-600 dark:border-brand-400 dark:text-brand-400'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-surface-600 dark:hover:text-gray-200'
                }`}
              >
                <span aria-hidden="true">{tab.icon}</span>
                <span>{tab.label}</span>
                <Badge variant={active ? 'info' : 'default'} size="sm">
                  {tab.count}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      <div id="search-results">
        {isIdle ? (
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <History className="h-4 w-4" aria-hidden="true" />
                    {t('search.recent', 'Recent searches')}
                  </h2>
                  {hydrated && recent.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearRecent}>
                      {t('common.clear', 'Clear')}
                    </Button>
                  )}
                </div>
                {hydrated && recent.length === 0 ? (
                  <div className="py-6 text-center">
                    <FileText
                      className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('search.noRecent', 'Your recent searches will appear here.')}
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {recent.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => setQuery(s)}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-200 dark:hover:bg-surface-800"
                        >
                          <Clock
                            className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500"
                            aria-hidden="true"
                          />
                          <span className="truncate">{s}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                  {t('search.trending', 'Trending searches')}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setQuery(s)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20"
                    >
                      <Hash className="h-3 w-3" aria-hidden="true" />
                      {s}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : loading ? (
          <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{t('common.loading', 'Loading…')}</span>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton variant="circular" width={40} height={40} />
                    <div className="flex-1 space-y-2">
                      <Skeleton variant="text" width="40%" />
                      <Skeleton variant="text" width="65%" />
                    </div>
                    <Skeleton variant="rounded" width={60} height={20} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={<Search className="h-12 w-12" aria-hidden="true" />}
            title={t('search.noResults', 'No results found')}
            description={`${t('search.noResultsDesc', "We couldn't find anything matching")} “${showQuery}”. ${t('search.noResultsHint', 'Try a different keyword or check your spelling.')}`}
            action={
              <Button
                variant="secondary"
                onClick={() => setQuery('')}
                leftIcon={<X className="h-4 w-4" />}
              >
                {t('search.clear', 'Clear search')}
              </Button>
            }
          />
        ) : noneInCategory ? (
          <EmptyState
            icon={<FileText className="h-12 w-12" aria-hidden="true" />}
            title={t('search.noInCategory', 'No matches in this category')}
            description={t(
              'search.noInCategoryDesc',
              'Switch to another category to see more results.',
            )}
            action={
              <Button variant="secondary" onClick={() => setCategory('all')}>
                {t('search.viewAllResults', 'View all results')}
              </Button>
            }
          />
        ) : (
          <div
            className="space-y-8"
            role="region"
            aria-live="polite"
            aria-label={t('search.results', 'Search results')}
          >
            {showCandidates && (
              <ResultSection
                id={`search-panel-candidates`}
                icon={<Users className="h-5 w-5" />}
                title={t('nav.candidates', 'Candidates')}
                count={counts.candidates}
                viewAllHref="/dashboard/candidates"
                viewAllLabel={t('common.viewAll', 'View all')}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {results.candidates.map((c) => {
                    const name = c.full_name || c.name || 'Candidate';
                    return (
                      <Link
                        key={c.id}
                        href={`/dashboard/candidates/${c.id}`}
                        aria-label={`${t('nav.candidates', 'Candidate')}: ${name}`}
                        className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <Card className="h-full transition hover:border-blue-300 hover:shadow-md dark:hover:border-brand-500/40">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <Avatar src={c.avatar || undefined} name={name} size="md" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {highlight(name, showQuery)}
                                </p>
                                {c.email && (
                                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                    {highlight(c.email, showQuery)}
                                  </p>
                                )}
                              </div>
                              {c.status && (
                                <Badge
                                  variant={c.status === 'active' ? 'success' : 'default'}
                                  size="sm"
                                  dot
                                >
                                  {c.status}
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </ResultSection>
            )}

            {showJobs && (
              <ResultSection
                id={`search-panel-jobs`}
                icon={<Briefcase className="h-5 w-5" />}
                title={t('nav.jobs', 'Jobs')}
                count={counts.jobs}
                viewAllHref="/dashboard/jobs"
                viewAllLabel={t('common.viewAll', 'View all')}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {results.jobs.map((j) => {
                    const subtitle = [j.department, j.location].filter(Boolean).join(' · ');
                    return (
                      <Link
                        key={j.id}
                        href={`/dashboard/jobs/${j.id}`}
                        aria-label={`${t('nav.jobs', 'Job')}: ${j.title || ''}`}
                        className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <Card className="h-full transition hover:border-blue-300 hover:shadow-md dark:hover:border-brand-500/40">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400">
                                <Briefcase className="h-5 w-5" aria-hidden="true" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {highlight(j.title || 'Untitled', showQuery)}
                                </p>
                                {subtitle && (
                                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                    {highlight(subtitle, showQuery)}
                                  </p>
                                )}
                              </div>
                              {j.status && (
                                <Badge
                                  variant={
                                    j.status === 'open' || j.status === 'active'
                                      ? 'success'
                                      : 'default'
                                  }
                                  size="sm"
                                >
                                  {j.status}
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </ResultSection>
            )}

            {showInterviews && (
              <ResultSection
                id={`search-panel-interviews`}
                icon={<Calendar className="h-5 w-5" />}
                title={t('nav.interviews', 'Interviews')}
                count={counts.interviews}
                viewAllHref="/dashboard/interviews"
                viewAllLabel={t('common.viewAll', 'View all')}
              >
                <div className="space-y-2">
                  {results.interviews.map((iv) => {
                    const name =
                      iv.candidate_name || iv.candidate?.full_name || t('nav.interviews', 'Interview');
                    const when = iv.scheduled_at
                      ? new Date(iv.scheduled_at).toLocaleString()
                      : '—';
                    return (
                      <Link
                        key={iv.id}
                        href="/dashboard/interviews"
                        aria-label={`${t('nav.interviews', 'Interview')}: ${name}`}
                        className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <Card className="transition hover:border-blue-300 hover:shadow-md dark:hover:border-brand-500/40">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-accent-500/10 dark:text-accent-300">
                                <Calendar className="h-5 w-5" aria-hidden="true" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {highlight(name, showQuery)}
                                </p>
                                <p className="flex items-center gap-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                  <Clock className="h-3 w-3" aria-hidden="true" />
                                  {when}
                                </p>
                              </div>
                              {iv.type && (
                                <Badge variant="purple" size="sm">
                                  {iv.type}
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </ResultSection>
            )}

            {showWorkflows && (
              <ResultSection
                id={`search-panel-workflows`}
                icon={<Workflow className="h-5 w-5" />}
                title={t('nav.workflows', 'Workflows')}
                count={counts.workflows}
                viewAllHref="/dashboard/workflows"
                viewAllLabel={t('common.viewAll', 'View all')}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {results.workflows.map((w) => {
                    const runs = w.runs ?? w.execution_count ?? 0;
                    const name = w.name || 'Workflow';
                    return (
                      <Link
                        key={w.id}
                        href="/dashboard/workflows"
                        aria-label={`${t('nav.workflows', 'Workflow')}: ${name}`}
                        className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <Card className="h-full transition hover:border-blue-300 hover:shadow-md dark:hover:border-brand-500/40">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-brand-500/10 dark:text-brand-300">
                                <Workflow className="h-5 w-5" aria-hidden="true" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {highlight(name, showQuery)}
                                </p>
                                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                  {runs.toLocaleString()} {t('search.runs', 'runs')}
                                </p>
                              </div>
                              <Badge variant={w.is_active ? 'success' : 'default'} size="sm" dot>
                                {w.is_active
                                  ? t('search.active', 'Active')
                                  : t('search.paused', 'Paused')}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </ResultSection>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultSection({
  id,
  icon,
  title,
  count,
  viewAllHref,
  viewAllLabel,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  count: number;
  viewAllHref: string;
  viewAllLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-label={title}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <span aria-hidden="true">{icon}</span>
          {title}
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">({count})</span>
        </h2>
        <Link
          href={viewAllHref}
          className="rounded text-xs font-semibold text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-brand-400"
        >
          {viewAllLabel}
        </Link>
      </header>
      {children}
    </section>
  );
}
