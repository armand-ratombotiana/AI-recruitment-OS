'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Star,
  Briefcase,
  MapPin,
  DollarSign,
  Heart,
  Sparkles,
  RefreshCw,
  Loader2,
  TrendingUp,
  Award,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Briefcase as BriefcaseIcon,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import { Card, CardContent, Badge, Skeleton, useToast } from '@/components';
import { cn } from '@/lib/utils';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';

export type Recommendation =
  | 'STRONG_MATCH'
  | 'MATCH'
  | 'POSSIBLE'
  | 'WEAK'
  | 'NO_MATCH';

export interface ScoreBreakdown {
  skills: number;
  experience: number;
  location: number;
  salary: number;
  culture: number;
}

export interface ScoreCardJob {
  id: string;
  title: string;
  company?: string;
}

export interface ScoreCardData {
  job: ScoreCardJob;
  score: number;
  breakdown: ScoreBreakdown;
  recommendation: Recommendation;
  rationale?: string;
  matching_skills?: string[];
  missing_skills?: string[];
}

interface ScoreCardProps {
  candidateId: string;
  defaultJobId?: string;
  jobs?: ScoreCardJob[];
  onChangeJob?: (jobId: string) => void;
  className?: string;
}

const FACTOR_KEYS: Array<{ key: keyof ScoreBreakdown; labelKey: string; fallback: string; icon: typeof Star }> = [
  { key: 'skills', labelKey: 'scoreCard.factor.skills', fallback: 'Skills', icon: Star },
  { key: 'experience', labelKey: 'scoreCard.factor.experience', fallback: 'Experience', icon: Briefcase },
  { key: 'location', labelKey: 'scoreCard.factor.location', fallback: 'Location', icon: MapPin },
  { key: 'salary', labelKey: 'scoreCard.factor.salary', fallback: 'Salary', icon: DollarSign },
  { key: 'culture', labelKey: 'scoreCard.factor.culture', fallback: 'Culture', icon: Heart },
];

const RECOMMENDATION_META: Record<
  Recommendation,
  {
    variant: 'success' | 'info' | 'warning' | 'orange' | 'danger' | 'default';
    labelKey: string;
    fallback: string;
    descriptionKey: string;
    descriptionFallback: string;
    ringColor: string;
  }
> = {
  STRONG_MATCH: {
    variant: 'success',
    labelKey: 'scoreCard.recommendation.strongMatch',
    fallback: 'Strong match',
    descriptionKey: 'scoreCard.recommendation.strongMatchDesc',
    descriptionFallback: 'Highly recommended — proceed quickly.',
    ringColor: '#10b981',
  },
  MATCH: {
    variant: 'info',
    labelKey: 'scoreCard.recommendation.match',
    fallback: 'Match',
    descriptionKey: 'scoreCard.recommendation.matchDesc',
    descriptionFallback: 'Solid fit — worth pursuing.',
    ringColor: '#3b82f6',
  },
  POSSIBLE: {
    variant: 'warning',
    labelKey: 'scoreCard.recommendation.possible',
    fallback: 'Possible',
    descriptionKey: 'scoreCard.recommendation.possibleDesc',
    descriptionFallback: 'Could work with some training or context.',
    ringColor: '#f59e0b',
  },
  WEAK: {
    variant: 'orange',
    labelKey: 'scoreCard.recommendation.weak',
    fallback: 'Weak',
    descriptionKey: 'scoreCard.recommendation.weakDesc',
    descriptionFallback: 'Significant gaps — proceed with caution.',
    ringColor: '#f97316',
  },
  NO_MATCH: {
    variant: 'danger',
    labelKey: 'scoreCard.recommendation.noMatch',
    fallback: 'No match',
    descriptionKey: 'scoreCard.recommendation.noMatchDesc',
    descriptionFallback: 'Not a fit for this role.',
    ringColor: '#ef4444',
  },
};

function classifyRecommendation(score: number): Recommendation {
  if (score >= 85) return 'STRONG_MATCH';
  if (score >= 70) return 'MATCH';
  if (score >= 55) return 'POSSIBLE';
  if (score >= 40) return 'WEAK';
  return 'NO_MATCH';
}

function normalizeFactor(value: number): number {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  if (value <= 1) return Math.max(0, Math.min(100, value * 100));
  return Math.max(0, Math.min(100, value));
}

function buildBreakdown(factors: Record<string, number> | undefined | null): ScoreBreakdown {
  const f = factors || {};
  return {
    skills: normalizeFactor(f.skills ?? f.skill ?? 0),
    experience: normalizeFactor(f.experience ?? f.experience_years ?? 0),
    location: normalizeFactor(f.location ?? 0),
    salary: normalizeFactor(f.salary ?? f.compensation ?? 0),
    culture: normalizeFactor(f.culture ?? f.culture_fit ?? 0),
  };
}

function averageBreakdown(b: ScoreBreakdown): number {
  const values = [b.skills, b.experience, b.location, b.salary, b.culture].filter(
    (v) => typeof v === 'number' && v > 0
  );
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

interface RadialProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  ariaLabel?: string;
}

const RadialProgress = React.memo(function RadialProgress({
  value,
  size = 160,
  strokeWidth = 12,
  color,
  ariaLabel,
}: RadialProgressProps) {
  const safe = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel || `Score ${Math.round(safe)} percent`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          className="text-gray-200 dark:text-surface-800"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
          {Math.round(safe)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          / 100
        </span>
      </div>
    </div>
  );
});

interface FactorBarProps {
  label: string;
  value: number;
  icon: React.ReactNode;
}

const FactorBar = React.memo(function FactorBar({ label, value, icon }: FactorBarProps) {
  const safe = Math.max(0, Math.min(100, value));
  const color =
    safe >= 80
      ? 'bg-emerald-500 dark:bg-success-500'
      : safe >= 60
        ? 'bg-blue-500 dark:bg-brand-500'
        : safe >= 40
          ? 'bg-amber-500 dark:bg-warning-500'
          : 'bg-red-500 dark:bg-danger-500';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
          <span className="text-gray-500 dark:text-gray-400" aria-hidden="true">
            {icon}
          </span>
          {label}
        </span>
        <span className="font-bold tabular-nums text-gray-900 dark:text-white">{Math.round(safe)}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-surface-800"
        role="progressbar"
        aria-valuenow={Math.round(safe)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${Math.round(safe)}%`}
      >
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
});

export function ScoreCard({
  candidateId,
  defaultJobId,
  jobs: jobsProp,
  onChangeJob,
  className,
}: ScoreCardProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { push } = useToast();

  const [jobs, setJobs] = useState<ScoreCardJob[]>(jobsProp || []);
  const [jobsLoading, setJobsLoading] = useState<boolean>(!jobsProp);
  const [selectedJobId, setSelectedJobId] = useState<string>(defaultJobId || '');
  const [data, setData] = useState<ScoreCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const loadJobs = useCallback(async () => {
    if (jobsProp) return;
    setJobsLoading(true);
    try {
      const res: any = await api.listJobs({ limit: '100' });
      const items = (res?.items || res?.data || res || []) as any[];
      const list: ScoreCardJob[] = items
        .filter((j) => j && j.id)
        .map((j) => ({ id: String(j.id), title: j.title || t('scoreCard.untitled', 'Untitled job'), company: j.company }));
      setJobs(list);
      if (!selectedJobId && list.length > 0) {
        setSelectedJobId(list[0].id);
      }
    } catch (err) {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsProp]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const runScore = useCallback(
    async (jobId: string, opts?: { silent?: boolean }) => {
      if (!jobId) return;
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        let jobMeta: ScoreCardJob | null = null;
        try {
          const j: any = await api.getJob(jobId);
          const detail = j?.data || j;
          jobMeta = {
            id: String(jobId),
            title: detail?.title || t('scoreCard.untitled', 'Untitled job'),
            company: detail?.company,
          };
        } catch {
          jobMeta = jobs.find((j) => j.id === jobId) || { id: jobId, title: t('scoreCard.untitled', 'Untitled job') };
        }

        const matchRes: any = await api.candidates.match(candidateId);
        const result = matchRes?.result || matchRes;
        const factors: Record<string, number> = result?.factors || {};
        const breakdown = buildBreakdown(factors);

        const candidates: any[] = Array.isArray(result?.matches) ? result.matches : [];
        const jobMatch = candidates.find((m) => String(m.job_id) === String(jobId));

        let score = 0;
        if (jobMatch && typeof jobMatch.score === 'number') {
          score = jobMatch.score > 1 ? jobMatch.score : jobMatch.score * 100;
        } else if (typeof result?.match_score === 'number') {
          score = result.match_score > 1 ? result.match_score : result.match_score * 100;
        } else {
          score = averageBreakdown(breakdown);
        }
        score = Math.max(0, Math.min(100, Math.round(score)));

        let recommendation: Recommendation =
          (result?.recommendation as Recommendation) ||
          (jobMatch?.recommendation as Recommendation) ||
          classifyRecommendation(score);
        if (!RECOMMENDATION_META[recommendation]) {
          recommendation = classifyRecommendation(score);
        }

        setData({
          job: jobMeta!,
          score,
          breakdown,
          recommendation,
          rationale:
            jobMatch?.rationale || result?.rationale || result?.summary || undefined,
          matching_skills: jobMatch?.matched_skills || result?.matching_skills || [],
          missing_skills: jobMatch?.missing_skills || result?.missing_skills || [],
        });
      } catch (err) {
        const e = err as APIError;
        setError(e?.message || t('scoreCard.error', "Couldn't load score"));
        setData(null);
        if (!opts?.silent) {
          push('error', e?.message || t('scoreCard.error', "Couldn't load score"));
        }
      } finally {
        if (!opts?.silent) setLoading(false);
        setScoring(false);
      }
    },
    [candidateId, jobs, push, t]
  );

  useEffect(() => {
    if (!selectedJobId) return;
    runScore(selectedJobId);
  }, [selectedJobId, runScore]);

  const handleChangeJob = (jobId: string) => {
    setSelectedJobId(jobId);
    setDropdownOpen(false);
    onChangeJob?.(jobId);
  };

  const handleRescore = async () => {
    if (!selectedJobId) return;
    setScoring(true);
    await runScore(selectedJobId);
    push('success', t('scoreCard.rescored', 'Score updated'));
  };

  const recMeta = data ? RECOMMENDATION_META[data.recommendation] : null;
  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) || data?.job || null,
    [jobs, selectedJobId, data]
  );

  return (
    <Card className={cn('overflow-hidden', className)}><CardContent className="p-0">
        <div className="flex flex-col gap-1 border-b border-gray-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-5 dark:border-surface-700 dark:from-brand-500/10 dark:via-accent-500/10 dark:to-purple-500/10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/70 text-blue-600 shadow-sm dark:bg-surface-900/70 dark:text-brand-300">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200">
                {t('scoreCard.title', 'AI Match Score')}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {t('scoreCard.subtitle', 'Detailed breakdown against a target job')}
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-auto sm:min-w-[260px]">
            <label className="sr-only" htmlFor="score-card-job">
              {t('scoreCard.jobSelectorLabel', 'Score for job')}
            </label>
            <button
              id="score-card-job"
              type="button"
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-surface-700 dark:bg-surface-800 dark:hover:border-brand-500"
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
              aria-label={t('scoreCard.jobSelectorLabel', 'Score for job')}
            >
              <span className="flex min-w-0 items-center gap-2">
                <BriefcaseIcon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                <span className="truncate font-medium text-gray-900 dark:text-white">
                  {selectedJob
                    ? `${selectedJob.title}${selectedJob.company ? ` · ${selectedJob.company}` : ''}`
                    : t('scoreCard.selectJob', 'Select a job…')}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400',
                  dropdownOpen && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </button>
            {dropdownOpen && (
              <ul
                role="listbox"
                className="absolute right-0 z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-surface-700 dark:bg-surface-800"
              >
                {jobsLoading ? (
                  <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                    {t('scoreCard.loadingJobs', 'Loading jobs…')}
                  </li>
                ) : jobs.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                    {t('scoreCard.noJobs', 'No jobs available')}
                  </li>
                ) : (
                  jobs.map((j) => (
                    <li key={j.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={j.id === selectedJobId}
                        onClick={() => handleChangeJob(j.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition',
                          j.id === selectedJobId
                            ? 'bg-blue-50 text-blue-700 dark:bg-brand-500/20 dark:text-brand-200'
                            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-700'
                        )}
                      >
                        <BriefcaseIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {j.title}
                          {j.company ? <span className="text-gray-500 dark:text-gray-400"> · {j.company}</span> : null}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-3" aria-busy="true" aria-live="polite">
            <div className="flex justify-center md:justify-start">
              <Skeleton variant="circular" width={160} height={160} />
            </div>
            <div className="md:col-span-2 space-y-3">
              <Skeleton height={20} width="60%" />
              <Skeleton height={12} />
              <Skeleton height={12} />
              <Skeleton height={12} />
              <Skeleton height={12} />
            </div>
          </div>
        ) : error && !data ? (
          <div className="p-6">
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300"
            >
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">{t('scoreCard.errorTitle', 'Could not compute score')}</p>
                <p className="mt-0.5 text-xs">{error}</p>
                <button
                  type="button"
                  onClick={() => selectedJobId && runScore(selectedJobId)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  {t('common.retry', 'Retry')}
                </button>
              </div>
            </div>
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-3">
            <div className="flex flex-col items-center gap-3 text-center">
              <RadialProgress
                value={data.score}
                color={recMeta?.ringColor || '#3b82f6'}
                ariaLabel={interpolate(t('scoreCard.scoreAria', 'Overall match score {score} out of 100'), {
                  score: String(data.score),
                })}
              />
              {recMeta && (
                <Badge variant={recMeta.variant} size="md" dot>
                  {t(recMeta.labelKey, recMeta.fallback)}
                </Badge>
              )}
              <p className="max-w-[220px] text-xs text-gray-500 dark:text-gray-400">
                {recMeta
                  ? t(recMeta.descriptionKey, recMeta.descriptionFallback)
                  : t('scoreCard.recommendation.weakDesc', 'Significant gaps — proceed with caution.')}
              </p>
              <button
                type="button"
                onClick={handleRescore}
                disabled={scoring}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
                aria-label={t('scoreCard.rescore', 'Re-compute score')}
              >
                {scoring ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                )}
                {t('scoreCard.rescore', 'Re-compute')}
              </button>
            </div>

            <div className="space-y-4 md:col-span-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {t('scoreCard.breakdownTitle', 'Score breakdown')}
                </h3>
                <div className="mt-3 space-y-3.5">
                  {FACTOR_KEYS.map(({ key, labelKey, fallback, icon: Icon }) => (
                    <FactorBar
                      key={key}
                      label={t(labelKey, fallback)}
                      value={data.breakdown[key]}
                      icon={<Icon className="h-3.5 w-3.5" />}
                    />
                  ))}
                </div>
              </div>

              {(data.matching_skills?.length || data.missing_skills?.length) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {data.matching_skills && data.matching_skills.length > 0 && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-success-500/30 dark:bg-success-500/10">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-success-300 inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        {t('scoreCard.matchingSkills', 'Matching skills')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {data.matching_skills.slice(0, 10).map((s) => (
                          <span
                            key={s}
                            className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-surface-900 dark:text-success-300"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.missing_skills && data.missing_skills.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-warning-500/30 dark:bg-warning-500/10">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-warning-300 inline-flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" aria-hidden="true" />
                        {t('scoreCard.missingSkills', 'Missing skills')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {data.missing_skills.slice(0, 10).map((s) => (
                          <span
                            key={s}
                            className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-surface-900 dark:text-warning-300"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-surface-800 dark:text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />
                  {interpolate(t('scoreCard.scoredFor', 'Scored for {job}'), { job: data.job.title })}
                </span>
                {data.job.id && (
                  <Link
                    href={`/dashboard/jobs/${data.job.id}`}
                    className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline dark:text-brand-300"
                  >
                    <Award className="h-3 w-3" aria-hidden="true" />
                    {t('scoreCard.viewJob', 'View job')}
                  </Link>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {t('scoreCard.empty', 'No scoring data yet. Pick a job to score this candidate.')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ScoreCard;
