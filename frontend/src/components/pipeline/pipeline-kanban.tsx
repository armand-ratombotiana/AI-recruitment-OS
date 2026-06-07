'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Briefcase,
  Calendar,
  ExternalLink,
  Filter,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  X,
  XCircle,
  Users,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import { Button, Card, CardContent, Skeleton, EmptyState, ConfirmDialog, ErrorState, useToast } from '@/components';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';
import {
  APPLICATION_STAGES,
  ApplicationCard,
  normalizeApplicationStage,
  type ApplicationItem,
  type ApplicationStage,
} from './application-card';
import { StageSummary } from './stage-summary';

interface JobOption {
  id: string;
  title: string;
  company?: string | null;
  status?: string;
}

interface RecruiterOption {
  id: string;
  name: string;
  email?: string | null;
}

interface CandidateApiRecord {
  id: string;
  full_name?: string;
  name?: string;
  email?: string;
  status?: string;
  score?: number | null;
  created_at?: string;
  updated_at?: string | null;
  skills?: string[];
  location?: string | null;
  match_scores?: Record<string, number> | null;
  enrichment?: Record<string, unknown> | null;
  profile?: {
    contact?: { linkedin?: string | null; portfolio?: string | null };
  } | null;
  notes?: string | null;
  recruiter_id?: string | null;
  recruiter_name?: string | null;
  last_activity_at?: string | null;
}

interface PendingMove {
  id: string;
  name: string;
  from: ApplicationStage;
  to: ApplicationStage;
}

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

function normalizeListResponse<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj.data)) {
      const d = obj.data as unknown;
      if (Array.isArray(d)) return d as T[];
      if (d && typeof d === 'object' && Array.isArray((d as Record<string, unknown>).items)) {
        return (d as Record<string, unknown>).items as T[];
      }
    }
  }
  return [];
}

function deriveDaysInStage(updatedAt: string | null | undefined, createdAt: string | null | undefined): number {
  const ref = updatedAt || createdAt;
  if (!ref) return 0;
  const t = new Date(ref).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function pickPrimaryJobId(c: CandidateApiRecord): string | null {
  if (c.match_scores && typeof c.match_scores === 'object') {
    const keys = Object.keys(c.match_scores);
    if (keys.length > 0) return keys[0];
  }
  return null;
}

function pickPrimaryScore(c: CandidateApiRecord, jobId: string | null): number | null {
  if (typeof c.score === 'number') return c.score;
  if (jobId && c.match_scores && typeof c.match_scores === 'object') {
    const v = c.match_scores[jobId];
    if (typeof v === 'number') {
      return v <= 1 ? v * 100 : v;
    }
  }
  return null;
}

export function PipelineKanban() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fb?: string) => translate(locale, key, fb),
    [locale]
  );
  const { push, ToastContainer } = useToast();

  const [candidates, setCandidates] = useState<CandidateApiRecord[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [recruiters, setRecruiters] = useState<RecruiterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ApplicationStage | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  const initialJobId = (searchParams?.get('job_id') || '').trim();
  const initialRecruiterId = (searchParams?.get('recruiter_id') || '').trim();

  const [jobFilter, setJobFilter] = useState<string>(initialJobId || 'all');
  const [recruiterFilter, setRecruiterFilter] = useState<string>(initialRecruiterId || 'all');
  const [search, setSearch] = useState<string>('');

  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      setError(null);
      try {
        const [cRes, jRes, uRes] = await Promise.allSettled([
          api.candidates.list({ page_size: '300' }),
          api.jobs.list({ limit: '300' }),
          api.users.list({ limit: '200' }),
        ]);

        if (cRes.status === 'fulfilled') {
          setCandidates(normalizeListResponse<CandidateApiRecord>(cRes.value));
        } else {
          setCandidates([]);
          const e = cRes.reason as APIError;
          throw e || new Error('Failed to load candidates');
        }

        if (jRes.status === 'fulfilled') {
          setJobs(normalizeListResponse<JobOption>(jRes.value));
        } else {
          setJobs([]);
        }
        if (uRes.status === 'fulfilled') {
          const list = normalizeListResponse<{
            id: string;
            full_name?: string;
            email?: string;
          }>(uRes.value);
          setRecruiters(
            list
              .filter((u) => u && u.id)
              .map((u) => ({
                id: String(u.id),
                name: u.full_name || u.email || u.id,
                email: u.email ?? null,
              }))
          );
        } else {
          setRecruiters([]);
        }
      } catch (err) {
        const e = err as APIError;
        setError(e?.message || t('pipeline.v2.couldntLoad', "Couldn't load the global pipeline"));
        setCandidates([]);
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => load(true), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const jobsById = useMemo(() => {
    const map = new Map<string, JobOption>();
    for (const j of jobs) map.set(String(j.id), j);
    return map;
  }, [jobs]);

  const applications: ApplicationItem[] = useMemo(() => {
    return candidates.map((c) => {
      const stage = normalizeApplicationStage(c.status);
      const jobId = pickPrimaryJobId(c);
      const job = jobId ? jobsById.get(jobId) : null;
      const score = pickPrimaryScore(c, jobId);
      return {
        id: c.id,
        candidate_id: c.id,
        candidate_name: c.full_name || c.name || c.email || c.id,
        candidate_email: c.email ?? null,
        candidate_location: c.location ?? null,
        candidate_skills: c.skills,
        job_id: jobId || '',
        job_title: job?.title || t('pipeline.v2.filterJobAll', 'All jobs'),
        job_company: job?.company ?? null,
        stage,
        status_raw: c.status,
        score,
        days_in_stage: deriveDaysInStage(c.updated_at, c.created_at),
        applied_at: c.created_at || null,
        last_activity_at: c.updated_at || c.last_activity_at || c.created_at || null,
        recruiter_id: c.recruiter_id || null,
        recruiter_name: c.recruiter_name || null,
      };
    });
  }, [candidates, jobsById, t]);

  const filteredApplications = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((a) => {
      if (jobFilter !== 'all' && a.job_id !== jobFilter) return false;
      if (recruiterFilter !== 'all' && a.recruiter_id !== recruiterFilter) return false;
      if (!q) return true;
      const hay = [
        a.candidate_name,
        a.candidate_email || '',
        a.job_title,
        a.job_company || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [applications, jobFilter, recruiterFilter, search]);

  const byStage = useMemo(() => {
    const map: Record<ApplicationStage, ApplicationItem[]> = {
      active: [],
      screening: [],
      interview: [],
      offer: [],
      hired: [],
      rejected: [],
    };
    for (const app of filteredApplications) {
      map[app.stage].push(app);
    }
    for (const k of Object.keys(map) as ApplicationStage[]) {
      map[k].sort((a, b) => {
        const aScore = typeof a.score === 'number' ? a.score : -1;
        const bScore = typeof b.score === 'number' ? b.score : -1;
        if (bScore !== aScore) return bScore - aScore;
        return new Date(b.applied_at || 0).getTime() - new Date(a.applied_at || 0).getTime();
      });
    }
    return map;
  }, [filteredApplications]);

  const totalCount = filteredApplications.length;

  const hasActiveFilters = jobFilter !== 'all' || recruiterFilter !== 'all' || search.trim() !== '';

  const clearFilters = useCallback(() => {
    setJobFilter('all');
    setRecruiterFilter('all');
    setSearch('');
  }, []);

  const updateUrl = useCallback(
    (next: { jobId?: string; recruiterId?: string }) => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams();
      const jId = next.jobId ?? jobFilter;
      const rId = next.recruiterId ?? recruiterFilter;
      if (jId && jId !== 'all') params.set('job_id', jId);
      if (rId && rId !== 'all') params.set('recruiter_id', rId);
      const qs = params.toString();
      router.replace(qs ? `/dashboard/pipeline?${qs}` : '/dashboard/pipeline', { scroll: false });
    },
    [jobFilter, recruiterFilter, router]
  );

  const handleJobFilterChange = useCallback(
    (val: string) => {
      setJobFilter(val);
      updateUrl({ jobId: val });
    },
    [updateUrl]
  );

  const handleRecruiterFilterChange = useCallback(
    (val: string) => {
      setRecruiterFilter(val);
      updateUrl({ recruiterId: val });
    },
    [updateUrl]
  );

  const persistMove = useCallback(
    async (id: string, newStage: ApplicationStage) => {
      const prev = candidates.find((c) => c.id === id)?.status;
      const nowIso = new Date().toISOString();
      setCandidates((p) =>
        p.map((c) => (c.id === id ? { ...c, status: newStage, updated_at: nowIso } : c))
      );
      try {
        await api.candidates.update(id, { status: newStage } as any);
        const stageDef = APPLICATION_STAGES.find((s) => s.id === newStage);
        push(
          'success',
          interpolate(t('pipeline.v2.subtitle', '{count} applications across {stages} stages.'), {
            count: '✓',
            stages: stageDef ? t(stageDef.titleKey, stageDef.defaultTitle) : newStage,
          })
        );
      } catch (err) {
        const e = err as APIError;
        setCandidates((p) =>
          p.map((c) =>
            c.id === id ? { ...c, status: prev ?? c.status } : c
          )
        );
        push(
          'error',
          e?.message || t('pipeline.v2.moveFailed', 'Failed to move application')
        );
      }
    },
    [candidates, push, t]
  );

  const handleDropToStage = useCallback(
    (id: string, toStage: ApplicationStage) => {
      const candidate = candidates.find((c) => c.id === id);
      if (!candidate) return;
      const fromStage = normalizeApplicationStage(candidate.status);
      if (fromStage === toStage) return;
      const name = candidate.full_name || candidate.name || candidate.email || id;
      if (toStage === 'hired' || toStage === 'rejected') {
        setPendingMove({ id, name, from: fromStage, to: toStage });
        return;
      }
      setMovingId(id);
      persistMove(id, toStage).finally(() => setMovingId(null));
    },
    [candidates, persistMove]
  );

  const confirmPendingMove = useCallback(async () => {
    if (!pendingMove) return;
    const { id, to } = pendingMove;
    setPendingMove(null);
    setMovingId(id);
    try {
      await persistMove(id, to);
    } finally {
      setMovingId(null);
    }
  }, [pendingMove, persistMove]);

  const onCardOpen = useCallback(
    (app: ApplicationItem) => {
      if (typeof window === 'undefined') return;
      window.location.href = `/dashboard/candidates/${app.candidate_id}`;
    },
    []
  );

  const onDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverStage(null);
  }, []);

  const onColumnDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, stage: ApplicationStage) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragOverStage !== stage) setDragOverStage(stage);
    },
    [dragOverStage]
  );

  const onColumnDragLeave = useCallback(
    (stage: ApplicationStage) => {
      if (dragOverStage === stage) setDragOverStage(null);
    },
    [dragOverStage]
  );

  const onColumnDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, stage: ApplicationStage) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      setDraggingId(null);
      setDragOverStage(null);
      if (!id) return;
      handleDropToStage(id, stage);
    },
    [handleDropToStage]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <ToastContainer />
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton height={32} width={220} />
              <Skeleton height={32} width={180} />
              <Skeleton height={32} width={180} />
              <Skeleton height={32} width={100} className="ml-auto" />
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {APPLICATION_STAGES.map((s) => (
            <Skeleton key={s.id} height={88} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {APPLICATION_STAGES.map((s) => (
            <Skeleton key={s.id} variant="rounded" height={320} />
          ))}
        </div>
      </div>
    );
  }

  if (error && candidates.length === 0) {
    return (
      <div className="space-y-4">
        <ToastContainer />
        <Card>
          <CardContent className="p-0">
            <ErrorState
              title={t('pipeline.v2.couldntLoad', "Couldn't load the global pipeline")}
              description={error}
              onRetry={() => load(false)}
              retryLabel={t('common.retry', 'Retry')}
              fullHeight
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ToastContainer />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 inline-flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  {t('pipeline.v2.title', 'Application pipeline')}
                </h2>
                <p className="mt-0.5 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  {interpolate(
                    t(
                      'pipeline.v2.subtitle',
                      '{count} applications across {stages} stages. Drag to move between stages.'
                    ),
                    {
                      count: String(totalCount),
                      stages: String(APPLICATION_STAGES.length),
                    }
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={() => load(false)}
                  aria-label={t('common.refresh', 'Refresh')}
                >
                  {t('common.refresh', 'Refresh')}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
              <div className="md:col-span-4">
                <label
                  htmlFor="pipeline-search"
                  className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1"
                >
                  <Search className="inline h-3 w-3 mr-0.5" aria-hidden="true" />
                  {t('pipeline.v2.filterSearch', 'Search candidates')}
                </label>
                <div className="relative">
                  <Search
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="pipeline-search"
                    ref={searchRef}
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('pipeline.v2.filterSearch', 'Search candidates')}
                    className="w-full h-9 pl-8 pr-3 rounded-md text-sm bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-label={t('pipeline.v2.filterSearch', 'Search candidates')}
                  />
                </div>
              </div>
              <div className="md:col-span-4">
                <label
                  htmlFor="pipeline-job-filter"
                  className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1"
                >
                  <Briefcase className="inline h-3 w-3 mr-0.5" aria-hidden="true" />
                  {t('pipeline.v2.filterJob', 'Filter by job')}
                </label>
                <select
                  id="pipeline-job-filter"
                  value={jobFilter}
                  onChange={(e) => handleJobFilterChange(e.target.value)}
                  className="w-full h-9 px-2 rounded-md text-sm bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={t('pipeline.v2.filterJob', 'Filter by job')}
                >
                  <option value="all">{t('pipeline.v2.filterJobAll', 'All jobs')}</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                      {j.company ? ` — ${j.company}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3">
                <label
                  htmlFor="pipeline-recruiter-filter"
                  className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1"
                >
                  <Filter className="inline h-3 w-3 mr-0.5" aria-hidden="true" />
                  {t('pipeline.v2.filterRecruiter', 'Filter by recruiter')}
                </label>
                <select
                  id="pipeline-recruiter-filter"
                  value={recruiterFilter}
                  onChange={(e) => handleRecruiterFilterChange(e.target.value)}
                  className="w-full h-9 px-2 rounded-md text-sm bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={t('pipeline.v2.filterRecruiter', 'Filter by recruiter')}
                  disabled={recruiters.length === 0}
                >
                  <option value="all">{t('pipeline.v2.filterRecruiterAll', 'All recruiters')}</option>
                  {recruiters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-1 flex items-end">
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<X className="h-3.5 w-3.5" />}
                    onClick={clearFilters}
                    aria-label={t('pipeline.v2.clearFilters', 'Clear filters')}
                  >
                    {t('pipeline.v2.clearFilters', 'Clear filters')}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {APPLICATION_STAGES.map((s, idx) => (
              <StageSummary
                key={s.id}
                stage={s.id}
                applications={filteredApplications}
                previousStage={idx > 0 ? APPLICATION_STAGES[idx - 1].id : null}
                compact
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {totalCount === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title={t(
                'pipeline.v2.noApplications',
                'No applications match the current filters.'
              )}
              description={t(
                'pipeline.v2.noApplicationsDesc',
                'Adjust the filters above to see more candidates, or drag a card between stages to keep momentum.'
              )}
              action={
                hasActiveFilters ? (
                  <Button variant="primary" onClick={clearFilters}>
                    {t('pipeline.v2.clearFilters', 'Clear filters')}
                  </Button>
                ) : null
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {APPLICATION_STAGES.map((stage) => {
            const list = byStage[stage.id];
            const isDropTarget = dragOverStage === stage.id;
            return (
              <div
                key={stage.id}
                role="region"
                aria-label={interpolate(
                  t(
                    'jobKanban.columnAria',
                    'Drop candidate to move to {stage}'
                  ),
                  { stage: t(stage.titleKey, stage.defaultTitle) }
                )}
                onDragOver={(e) => onColumnDragOver(e, stage.id)}
                onDragLeave={() => onColumnDragLeave(stage.id)}
                onDrop={(e) => onColumnDrop(e, stage.id)}
                className={[
                  'flex flex-col rounded-lg border bg-white dark:bg-surface-900 transition-colors min-h-[260px]',
                  isDropTarget
                    ? 'border-blue-400 dark:border-blue-500/50 ring-2 ring-offset-1 ring-blue-400 dark:ring-offset-surface-900'
                    : 'border-gray-200 dark:border-surface-700',
                ].join(' ')}
              >
                <header className="flex items-center gap-2 p-2.5 border-b border-gray-100 dark:border-surface-700">
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${stage.color}`}
                    aria-hidden="true"
                  />
                  <h3 className="text-xs font-semibold uppercase tracking-wider truncate text-gray-900 dark:text-gray-100">
                    {t(stage.titleKey, stage.defaultTitle)}
                  </h3>
                  <span className="ml-auto text-[10px] font-bold bg-gray-100 dark:bg-surface-800 text-gray-700 dark:text-gray-300 rounded-full px-1.5 py-0.5">
                    {list.length}
                  </span>
                </header>
                <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[64vh]">
                  {list.length === 0 ? (
                    <p className="text-[11px] text-center text-gray-400 dark:text-gray-500 py-6">
                      {t('jobKanban.emptyColumn', 'No candidates in this stage')}
                    </p>
                  ) : (
                    list.map((app) => (
                      <div key={app.id} className="relative">
                        <ApplicationCard
                          application={app}
                          variant="kanban"
                          showJob
                          showRecruiter={recruiterFilter === 'all'}
                          onClick={onCardOpen}
                          draggable
                          onDragStart={onDragStart}
                          onDragEnd={onDragEnd}
                          isDragging={draggingId === app.id}
                        />
                        {movingId === app.id && (
                          <div
                            className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-surface-900/60 rounded-lg"
                            aria-hidden="true"
                          >
                            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Calendar className="h-3 w-3" aria-hidden="true" />
        <span>{t('pipeline.title', 'Pipeline')}</span>
        <span className="opacity-50">·</span>
        <span className="inline-flex items-center gap-1">
          <Mail className="h-3 w-3" aria-hidden="true" />
          {t('pipeline.v2.subtitle', '{count} applications across {stages} stages. Drag to move between stages.')
            .split('.')[0]}
        </span>
        <a
          href="/dashboard/candidates"
          className="ml-auto inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
          aria-label={t('candidateDetail.backToCandidates', 'Back to candidates')}
        >
          {t('candidateDetail.backToCandidates', 'Back to candidates')}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>

      <ConfirmDialog
        isOpen={!!pendingMove}
        onClose={() => setPendingMove(null)}
        onConfirm={confirmPendingMove}
        title={t('pipeline.v2.confirmMove.title', 'Confirm application move')}
        description={
          pendingMove
            ? interpolate(
                t(
                  'pipeline.v2.confirmMove.desc',
                  'Move {name} from {from} to {to}? This will update the candidate’s status across the platform.'
                ),
                {
                  name: pendingMove.name,
                  from: t(
                    `pipeline.stages.${pendingMove.from}`,
                    pendingMove.from
                  ),
                  to: t(
                    `pipeline.stages.${pendingMove.to}`,
                    pendingMove.to
                  ),
                }
              )
            : ''
        }
        confirmLabel={t('pipeline.confirmMove.confirm', 'Move candidate')}
        variant="warning"
        destructive={pendingMove?.to === 'rejected'}
        loading={movingId === pendingMove?.id}
      />

      {/* XCircle re-exported from lucide to keep parity with Kanban action set */}
      <span className="hidden" aria-hidden="true">
        <XCircle />
      </span>
    </div>
  );
}

export default PipelineKanban;
