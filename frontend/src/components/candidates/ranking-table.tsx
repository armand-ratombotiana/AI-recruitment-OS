'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Star,
  GitCompare,
  ExternalLink,
  Loader2,
  AlertCircle,
  Trophy,
  Mail,
  Briefcase,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Users,
  RefreshCw,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import { Card, CardContent, Skeleton, Badge, useToast, Button } from '@/components';
import { cn } from '@/lib/utils';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';

export type RankingRecommendation =
  | 'STRONG_MATCH'
  | 'MATCH'
  | 'POSSIBLE'
  | 'WEAK'
  | 'NO_MATCH'
  | string;

export interface RankingCandidate {
  id: string;
  full_name: string;
  email?: string;
  location?: string | null;
  status?: string;
  experience_years?: number | null;
  score: number;
  matched_skills?: string[];
  missing_skills?: string[];
  rationale?: string;
  recommendation?: RankingRecommendation;
}

type SortKey = 'rank' | 'name' | 'score' | 'experience' | 'status';
type SortDir = 'asc' | 'desc';

interface RankingTableProps {
  jobId: string;
  jobTitle?: string;
  limit?: number;
  initialCandidates?: RankingCandidate[];
  showCard?: boolean;
  className?: string;
  onCompare?: (selected: RankingCandidate[]) => void;
}

const STATUS_VARIANT: Record<
  string,
  'info' | 'warning' | 'success' | 'purple' | 'default' | 'danger' | 'orange' | 'teal'
> = {
  active: 'info',
  interviewing: 'purple',
  screening: 'warning',
  offer: 'success',
  hired: 'success',
  rejected: 'danger',
  new: 'default',
  applied: 'default',
  ppe: 'warning',
};

const RECOMMENDATION_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'orange' | 'danger' | 'default'> = {
  STRONG_MATCH: 'success',
  MATCH: 'info',
  POSSIBLE: 'warning',
  WEAK: 'orange',
  NO_MATCH: 'danger',
};

function classifyRecommendation(score: number): RankingRecommendation {
  if (score >= 85) return 'STRONG_MATCH';
  if (score >= 70) return 'MATCH';
  if (score >= 55) return 'POSSIBLE';
  if (score >= 40) return 'WEAK';
  return 'NO_MATCH';
}

function statusBadgeVariant(status?: string) {
  if (!status) return 'default' as const;
  return STATUS_VARIANT[status] || ('default' as const);
}

function recommendationBadgeVariant(rec?: RankingRecommendation) {
  if (!rec) return null;
  return RECOMMENDATION_VARIANT[rec] || ('default' as const);
}

interface SortIconProps {
  active: boolean;
  dir: SortDir;
}

function SortIcon({ active, dir }: SortIconProps) {
  if (!active) {
    return <ChevronsUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />;
  }
  return dir === 'asc' ? (
    <ChevronUp className="h-3 w-3" aria-hidden="true" />
  ) : (
    <ChevronDown className="h-3 w-3" aria-hidden="true" />
  );
}

interface SortableThProps {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

function SortableTh({ label, sortKey, current, onSort, align = 'left', className }: SortableThProps) {
  const active = current.key === sortKey;
  const ariaSort: 'ascending' | 'descending' | 'none' = active
    ? current.dir === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';
  const { locale } = useLocaleStore();
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        'px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 rounded transition hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-white',
          active && 'text-gray-900 dark:text-white'
        )}
        aria-label={interpolate(t('ranking.sortBy', 'Sort by {field}'), { field: label })}
      >
        {label}
        <SortIcon active={active} dir={current.dir} />
      </button>
    </th>
  );
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-600 dark:text-success-400';
  if (score >= 70) return 'text-blue-600 dark:text-brand-400';
  if (score >= 55) return 'text-amber-600 dark:text-warning-400';
  if (score >= 40) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-danger-400';
}

function scoreBg(score: number): string {
  if (score >= 85) return 'bg-emerald-500 dark:bg-success-500';
  if (score >= 70) return 'bg-blue-500 dark:bg-brand-500';
  if (score >= 55) return 'bg-amber-500 dark:bg-warning-500';
  if (score >= 40) return 'bg-orange-500 dark:bg-orange-500';
  return 'bg-red-500 dark:bg-danger-500';
}

export function RankingTable({
  jobId,
  jobTitle,
  limit,
  initialCandidates,
  showCard = true,
  className,
  onCompare,
}: RankingTableProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const router = useRouter();
  const { push } = useToast();

  const [candidates, setCandidates] = useState<RankingCandidate[]>(initialCandidates || []);
  const [loading, setLoading] = useState<boolean>(!initialCandidates);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'rank', dir: 'desc' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.jobs.getMatchedCandidates(jobId);
      const raw: any[] = (res?.candidates || res?.data || res?.items || res || []) as any[];
      const normalized: RankingCandidate[] = raw
        .filter((c) => c && (c.candidate_id || c.id))
        .map((c) => {
          const id = String(c.candidate_id || c.id);
          const rawScore = typeof c.score === 'number' ? c.score : 0;
          const score = rawScore > 1 ? Math.round(rawScore) : Math.round(rawScore * 100);
          return {
            id,
            full_name: c.full_name || c.name || t('ranking.unnamed', 'Unnamed candidate'),
            email: c.email || undefined,
            location: c.location ?? null,
            status: c.status,
            experience_years:
              typeof c.experience_years === 'number'
                ? c.experience_years
                : typeof c.experience === 'number'
                  ? c.experience
                  : null,
            score,
            matched_skills: Array.isArray(c.matched_skills) ? c.matched_skills : [],
            missing_skills: Array.isArray(c.missing_skills) ? c.missing_skills : [],
            rationale: c.rationale || undefined,
            recommendation: c.recommendation || classifyRecommendation(score),
          };
        });
      normalized.sort((a, b) => b.score - a.score);
      setCandidates(normalized);
    } catch (err) {
      const e = err as APIError;
      const empty = e?.status === 404;
      if (empty) {
        try {
          const list: any = await api.listCandidates({ job_id: jobId, limit: String(limit || 25) });
          const items: any[] = list?.data || list?.items || list || [];
          const fallback: RankingCandidate[] = items
            .filter((c) => c && c.id)
            .map((c) => {
              const rawScore = typeof c.score === 'number' ? c.score : 0;
              const score = rawScore > 1 ? Math.round(rawScore) : Math.round(rawScore * 100);
              return {
                id: String(c.id),
                full_name: c.full_name || c.name || t('ranking.unnamed', 'Unnamed candidate'),
                email: c.email,
                location: c.location ?? null,
                status: c.status,
                experience_years:
                  typeof c.experience_years === 'number' ? c.experience_years : null,
                score,
                recommendation: classifyRecommendation(score),
              };
            });
          fallback.sort((a, b) => b.score - a.score);
          setCandidates(fallback);
          setError(null);
        } catch (err2) {
          const e2 = err2 as APIError;
          setError(e2?.message || t('ranking.couldntLoad', "Couldn't load ranking"));
          setCandidates([]);
        }
      } else {
        setError(e?.message || t('ranking.couldntLoad', "Couldn't load ranking"));
        setCandidates([]);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, limit]);

  useEffect(() => {
    if (!initialCandidates) load();
  }, [load, initialCandidates]);

  const sorted = useMemo(() => {
    const list = [...candidates];
    if (sort.key === 'rank') {
      list.sort((a, b) => (sort.dir === 'asc' ? a.score - b.score : b.score - a.score));
    } else if (sort.key === 'name') {
      list.sort((a, b) => {
        const cmp = a.full_name.localeCompare(b.full_name, locale, { sensitivity: 'base' });
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    } else if (sort.key === 'score') {
      list.sort((a, b) => (sort.dir === 'asc' ? a.score - b.score : b.score - a.score));
    } else if (sort.key === 'experience') {
      list.sort((a, b) => {
        const ax = a.experience_years ?? -1;
        const bx = b.experience_years ?? -1;
        return sort.dir === 'asc' ? ax - bx : bx - ax;
      });
    } else if (sort.key === 'status') {
      list.sort((a, b) => {
        const as = (a.status || '').toLowerCase();
        const bs = (b.status || '').toLowerCase();
        const cmp = as.localeCompare(bs);
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [candidates, sort, locale]);

  const visible = useMemo(() => {
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  }, [sorted, limit]);

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        if (prev.dir === 'desc') return { key, dir: 'asc' };
        if (prev.dir === 'asc') return { key: 'rank', dir: 'desc' };
      }
      return { key, dir: key === 'name' || key === 'status' ? 'asc' : 'desc' };
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= 4) {
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCompare = useCallback(() => {
    if (selected.size < 2) {
      push('info', t('ranking.compareHint', 'Select 2 to 4 candidates to compare.'));
      return;
    }
    const rows = candidates.filter((c) => selected.has(c.id));
    if (onCompare) {
      onCompare(rows);
      return;
    }
    const ids = Array.from(selected).join(',');
    router.push(`/dashboard/candidates/compare?ids=${ids}`);
  }, [selected, candidates, onCompare, push, router, t]);

  const handleViewProfile = useCallback(
    (id: string) => {
      router.push(`/dashboard/candidates/${id}`);
    },
    [router]
  );

  const renderHeader = () => (
    <thead className="border-b border-gray-200 bg-gray-50 dark:border-surface-700 dark:bg-surface-800">
      <tr>
        <th
          scope="col"
          className="w-10 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
        >
          <span className="sr-only">{t('ranking.select', 'Select')}</span>
        </th>
        <SortableTh
          label={t('ranking.table.rank', 'Rank')}
          sortKey="rank"
          current={sort}
          onSort={handleSort}
          align="left"
          className="w-16"
        />
        <SortableTh
          label={t('ranking.table.candidate', 'Candidate')}
          sortKey="name"
          current={sort}
          onSort={handleSort}
          align="left"
        />
        <SortableTh
          label={t('ranking.table.score', 'Score')}
          sortKey="score"
          current={sort}
          onSort={handleSort}
          align="center"
          className="w-32"
        />
        <SortableTh
          label={t('ranking.table.experience', 'Experience')}
          sortKey="experience"
          current={sort}
          onSort={handleSort}
          align="center"
          className="w-28"
        />
        <SortableTh
          label={t('ranking.table.status', 'Status')}
          sortKey="status"
          current={sort}
          onSort={handleSort}
          align="left"
          className="w-32"
        />
        <th
          scope="col"
          className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-44"
        >
          {t('ranking.table.actions', 'Actions')}
        </th>
      </tr>
    </thead>
  );

  const renderRow = (c: RankingCandidate, index: number) => {
    const isSelected = selected.has(c.id);
    const recVariant = recommendationBadgeVariant(c.recommendation);
    return (
      <tr
        key={c.id}
        className={cn(
          'border-b border-gray-100 transition last:border-b-0 hover:bg-blue-50/40 dark:border-surface-800 dark:hover:bg-brand-500/5',
          isSelected && 'bg-blue-50/60 dark:bg-brand-500/10'
        )}
      >
        <td className="px-3 py-3 align-middle">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(c.id)}
            disabled={!isSelected && selected.size >= 4}
            aria-label={interpolate(t('ranking.selectCandidate', 'Select {name} for comparison'), {
              name: c.full_name,
            })}
            className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40 dark:border-surface-600 dark:bg-surface-800"
          />
        </td>
        <td className="px-3 py-3 align-middle">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold',
                index === 0
                  ? 'bg-amber-100 text-amber-700 dark:bg-warning-500/20 dark:text-warning-300'
                  : index === 1
                    ? 'bg-gray-200 text-gray-700 dark:bg-surface-700 dark:text-gray-200'
                    : index === 2
                      ? 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-surface-800 dark:text-gray-400'
              )}
              aria-label={interpolate(t('ranking.rankAria', 'Rank {rank}'), { rank: String(index + 1) })}
            >
              {index === 0 ? <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
            </span>
          </div>
        </td>
        <td className="px-3 py-3 align-middle">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-xs font-bold text-white"
              aria-hidden="true"
            >
              {c.full_name
                .split(' ')
                .filter(Boolean)
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {c.full_name}
              </p>
              {c.email ? (
                <p className="flex items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400">
                  <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{c.email}</span>
                </p>
              ) : c.location ? (
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{c.location}</p>
              ) : null}
              {c.matched_skills && c.matched_skills.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.matched_skills.slice(0, 3).map((s) => (
                    <span
                      key={s}
                      className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-success-500/20 dark:text-success-300"
                    >
                      {s}
                    </span>
                  ))}
                  {c.matched_skills.length > 3 && (
                    <span className="text-[10px] text-gray-400">
                      +{c.matched_skills.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-3 align-middle">
          <div className="flex flex-col items-center gap-1">
            <span
              className={cn('text-lg font-bold tabular-nums', scoreColor(c.score))}
              aria-label={interpolate(t('ranking.scoreAria', 'Match score {score}'), {
                score: String(c.score),
              })}
            >
              {c.score}
            </span>
            <div
              className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-surface-800"
              role="progressbar"
              aria-valuenow={c.score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={interpolate(t('ranking.scoreBarAria', 'Score bar: {score} percent'), {
                score: String(c.score),
              })}
            >
              <div
                className={cn('h-full rounded-full transition-all', scoreBg(c.score))}
                style={{ width: `${c.score}%` }}
              />
            </div>
            {recVariant && c.recommendation && (
              <Badge variant={recVariant} size="sm">
                {c.recommendation.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-center align-middle text-sm text-gray-700 dark:text-gray-300">
          {typeof c.experience_years === 'number' ? (
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3 w-3 text-gray-400" aria-hidden="true" />
              {c.experience_years}y
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-3 py-3 align-middle">
          {c.status ? (
            <Badge variant={statusBadgeVariant(c.status)} size="sm" dot>
              {c.status}
            </Badge>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="px-3 py-3 align-middle">
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => handleViewProfile(c.id)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
              aria-label={interpolate(t('ranking.viewProfile', 'View profile of {name}'), { name: c.full_name })}
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              {t('ranking.viewProfileShort', 'View')}
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const body = (
    <>
      <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-surface-700 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-warning-500/20 dark:text-warning-300">
            <Trophy className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200">
              {t('ranking.title', 'Top Candidates')}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {jobTitle
                ? interpolate(t('ranking.subtitleWithJob', 'Ranked for {job}'), { job: jobTitle })
                : t('ranking.subtitle', 'Ranked by match score')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {interpolate(t('ranking.selectedCount', '{count} selected'), { count: String(selected.size) })}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<GitCompare className="h-3.5 w-3.5" />}
            onClick={handleCompare}
            disabled={selected.size < 2}
            aria-label={t('ranking.compare', 'Compare selected candidates')}
          >
            {t('ranking.compare', 'Compare')}
          </Button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
            aria-label={t('ranking.refresh', 'Refresh ranking')}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
            )}
            {t('ranking.refresh', 'Refresh')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-4" aria-busy="true" aria-live="polite">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={48} />
          ))}
        </div>
      ) : error ? (
        <div className="p-6">
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300"
          >
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">{t('ranking.couldntLoad', "Couldn't load ranking")}</p>
              <p className="mt-0.5 text-xs">{error}</p>
              <button
                type="button"
                onClick={load}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                {t('common.retry', 'Retry')}
              </button>
            </div>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="p-8 text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-surface-800 dark:text-gray-400">
            <Users className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            {t('ranking.empty', 'No candidates ranked yet')}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('ranking.emptyDesc', 'Run AI matching to populate the ranking for this job.')}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table">
            {renderHeader()}
            <tbody className="divide-y divide-gray-100 dark:divide-surface-800">
              {visible.map((c, i) => renderRow(c, i))}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-surface-700 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {interpolate(t('ranking.summary', 'Showing {shown} of {total} candidates'), {
              shown: String(visible.length),
              total: String(candidates.length),
            })}
          </span>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="self-start text-xs font-semibold text-blue-600 hover:underline dark:text-brand-300 sm:self-auto"
            >
              {t('ranking.clearSelection', 'Clear selection')}
            </button>
          )}
        </div>
      )}
    </>
  );

  if (!showCard) return <div className={className}>{body}</div>;

  return (
    <Card className={cn('overflow-hidden', className)}><CardContent className="p-0">{body}</CardContent>
    </Card>
  );
}

export default RankingTable;
