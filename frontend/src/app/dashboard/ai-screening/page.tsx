'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Plus,
  Sparkles,
  Loader2,
  Search,
  ArrowRight,
  Send,
  FileText,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Users,
  Briefcase,
  AlertCircle,
  BarChart3,
  Filter as FilterIcon,
  X,
  Check,
  Star,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Modal,
  Skeleton,
  EmptyState,
  ErrorState,
  Breadcrumb,
  useToast,
  HelpButton,
  StatsCard,
} from '@/components';
import { useLocaleStore, translate, formatNumber, formatRelativeTime } from '@/stores/locale-store';

type Recommendation = 'strong_hire' | 'hire' | 'neutral' | 'no_hire' | 'strong_no_hire';

interface Job {
  id: string;
  title: string;
  company?: string;
  location?: string;
  status?: string;
  applicants?: number;
}

interface Candidate {
  id: string;
  full_name: string;
  email?: string;
  headline?: string;
  location?: string;
  skills?: string[];
  status?: string;
  avatar?: string;
}

interface ScreeningResult {
  candidate_id: string;
  overall_score: number;
  recommendation: Recommendation;
  rationale?: string;
  strengths: string[];
  concerns: string[];
  scores?: Array<{ criterion: string; score: number; weight: number }>;
}

interface ScreeningRun {
  id: string;
  jobId: string;
  job?: Job;
  candidateIds: string[];
  candidates: Candidate[];
  results: ScreeningResult[];
  generatedAt: string;
  summary?: {
    averageScore: number;
    topScore: number;
    counts: Record<Recommendation, number>;
  };
}

const STORAGE_PREFIX = 'airos_screening_';

const RECOMMENDATION_KEYS: Recommendation[] = [
  'strong_hire',
  'hire',
  'neutral',
  'no_hire',
  'strong_no_hire',
];

const RECOMMENDATION_BADGE: Record<Recommendation, 'success' | 'info' | 'default' | 'warning' | 'danger'> = {
  strong_hire: 'success',
  hire: 'success',
  neutral: 'default',
  no_hire: 'warning',
  strong_no_hire: 'danger',
};

const RECOMMENDATION_BAR: Record<Recommendation, string> = {
  strong_hire: 'bg-green-500',
  hire: 'bg-emerald-500',
  neutral: 'bg-gray-400',
  no_hire: 'bg-amber-500',
  strong_no_hire: 'bg-red-500',
};

function scoreToPercent(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score > 1) return Math.min(100, Math.max(0, Math.round(score)));
  return Math.min(100, Math.max(0, Math.round(score * 100)));
}

function buildSummary(results: ScreeningResult[]): ScreeningRun['summary'] {
  if (results.length === 0) {
    return { averageScore: 0, topScore: 0, counts: { strong_hire: 0, hire: 0, neutral: 0, no_hire: 0, strong_no_hire: 0 } };
  }
  const scores = results.map((r) => scoreToPercent(r.overall_score));
  const averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const topScore = Math.max(...scores);
  const counts: Record<Recommendation, number> = {
    strong_hire: 0,
    hire: 0,
    neutral: 0,
    no_hire: 0,
    strong_no_hire: 0,
  };
  for (const r of results) {
    const rec = (r.recommendation || 'neutral') as Recommendation;
    if (counts[rec] !== undefined) counts[rec]++;
  }
  return { averageScore, topScore, counts };
}

function loadRun(jobId: string): ScreeningRun | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${jobId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScreeningRun;
    if (!parsed || !parsed.jobId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveRun(run: ScreeningRun) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${run.jobId}`, JSON.stringify(run));
  } catch {
    /* noop */
  }
}

export default function AIScreeningPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [runs, setRuns] = useState<ScreeningRun[]>([]);
  const [runsById, setRunsById] = useState<Record<string, ScreeningRun>>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [candidateMode, setCandidateMode] = useState<'all' | 'select'>('all');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [candidateSearch, setCandidateSearch] = useState('');

  const [running, setRunning] = useState(false);
  const [progressDone, setProgressDone] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  const [recommendationFilter, setRecommendationFilter] = useState<Recommendation | 'all'>('all');
  const [resultsSearch, setResultsSearch] = useState('');
  const [sending, setSending] = useState<string | null>(null);

  const { push, ToastContainer } = useToast();

  const loadData = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      const [jobsRes, candRes] = await Promise.all([
        api.listJobs().catch(() => ({ data: [] })),
        api.listCandidates().catch(() => ({ data: [] })),
      ]);
      const jobsList: Job[] = (jobsRes as any)?.data || jobsRes || [];
      const candList: Candidate[] = (candRes as any)?.data || candRes || [];
      setJobs(Array.isArray(jobsList) ? jobsList : []);
      setCandidates(Array.isArray(candList) ? candList : []);
    } catch (err: any) {
      setError(err?.message || t('aiScreening.summary', "Couldn't load screening data"));
    } finally {
      setLoadingData(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const collected: ScreeningRun[] = [];
    const byId: Record<string, ScreeningRun> = {};
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) {
          const r = loadRun(k.slice(STORAGE_PREFIX.length));
          if (r) {
            collected.push(r);
            byId[r.jobId] = r;
          }
        }
      }
    } catch {
      /* noop */
    }
    collected.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
    setRuns(collected);
    setRunsById(byId);
    if (!activeRunId && collected.length > 0) {
      setActiveRunId(collected[0].jobId);
    }
  }, []);

  const openJobs = useMemo(
    () => jobs.filter((j) => !j.status || j.status === 'open' || j.status === 'draft'),
    [jobs]
  );

  const filteredCandidatesForPicker = useMemo(() => {
    if (!candidateSearch.trim()) return candidates;
    const q = candidateSearch.toLowerCase();
    return candidates.filter(
      (c) =>
        c.full_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.headline?.toLowerCase().includes(q)
    );
  }, [candidates, candidateSearch]);

  const targetCandidateIds = useMemo<string[]>(() => {
    if (candidateMode === 'all') {
      return candidates.map((c) => c.id);
    }
    return Array.from(selectedCandidateIds);
  }, [candidateMode, candidates, selectedCandidateIds]);

  const activeRun = activeRunId ? runsById[activeRunId] || null : null;

  const filteredResults = useMemo(() => {
    if (!activeRun) return [];
    return activeRun.results
      .map((r, idx) => ({ result: r, candidate: activeRun.candidates.find((c) => c.id === r.candidate_id), idx }))
      .filter(({ result }) => {
        if (recommendationFilter !== 'all' && result.recommendation !== recommendationFilter) {
          return false;
        }
        if (resultsSearch.trim()) {
          const q = resultsSearch.toLowerCase();
          const cand = activeRun.candidates.find((c) => c.id === result.candidate_id);
          const matchesName = cand?.full_name?.toLowerCase().includes(q);
          const matchesStrength = result.strengths.some((s) => s.toLowerCase().includes(q));
          const matchesConcern = result.concerns.some((s) => s.toLowerCase().includes(q));
          if (!matchesName && !matchesStrength && !matchesConcern) return false;
        }
        return true;
      });
  }, [activeRun, recommendationFilter, resultsSearch]);

  const resetModal = () => {
    setSelectedJobId('');
    setCandidateMode('all');
    setSelectedCandidateIds(new Set());
    setCandidateSearch('');
  };

  const closeModal = () => {
    if (running) return;
    setModalOpen(false);
    setTimeout(resetModal, 200);
  };

  const runScreening = async () => {
    if (!selectedJobId) {
      push('error', t('aiScreening.selectJob', 'Select a job'));
      return;
    }
    if (targetCandidateIds.length === 0) {
      push('error', t('aiScreening.noCandidates', 'No candidates available'));
      return;
    }
    const job = jobs.find((j) => j.id === selectedJobId);
    if (!job) {
      push('error', t('aiScreening.noJobs', 'Job not found'));
      return;
    }
    setRunning(true);
    setProgressDone(0);
    setProgressTotal(targetCandidateIds.length);
    const selectedCandidates = candidates.filter((c) => targetCandidateIds.includes(c.id));
    const results: ScreeningResult[] = [];

    const queue = [...targetCandidateIds];
    const concurrency = 3;
    const workers: Array<Promise<void>> = [];

    const evaluateOne = async (candidateId: string) => {
      try {
        const r: any = await api.aiEvaluation.evaluate({
          candidate_id: candidateId,
          job_id: selectedJobId,
          include_explanations: true,
        });
        const data = r?.data || r;
        const rec: Recommendation = (data?.recommendation as Recommendation) || 'neutral';
        results.push({
          candidate_id: candidateId,
          overall_score: typeof data?.overall_score === 'number' ? data.overall_score : 0,
          recommendation: rec,
          rationale: data?.rationale,
          strengths: Array.isArray(data?.strengths) ? data.strengths : [],
          concerns: Array.isArray(data?.concerns) ? data.concerns : [],
          scores: Array.isArray(data?.scores) ? data.scores : undefined,
        });
      } catch (err: any) {
        const cand = candidates.find((c) => c.id === candidateId);
        results.push({
          candidate_id: candidateId,
          overall_score: 0,
          recommendation: 'neutral',
          rationale: err?.message || t('aiScreening.screeningFailed', 'Screening failed'),
          strengths: [],
          concerns: [
            cand?.full_name
              ? `${cand.full_name}: ${err?.message || t('aiScreening.screeningFailed', 'Screening failed')}`
              : (err?.message || t('aiScreening.screeningFailed', 'Screening failed')),
          ],
        });
      } finally {
        setProgressDone((d) => d + 1);
      }
    };

    const next = async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) break;
        await evaluateOne(id);
      }
    };

    for (let i = 0; i < Math.min(concurrency, targetCandidateIds.length); i++) {
      workers.push(next());
    }
    await Promise.all(workers);

    const summary = buildSummary(results);
    const run: ScreeningRun = {
      id: `run-${Date.now().toString(36)}`,
      jobId: selectedJobId,
      job,
      candidateIds: targetCandidateIds,
      candidates: selectedCandidates,
      results,
      generatedAt: new Date().toISOString(),
      summary,
    };

    saveRun(run);
    setRunsById((prev) => ({ ...prev, [run.jobId]: run }));
    setRuns((prev) => [run, ...prev.filter((r) => r.jobId !== run.jobId)]);
    setActiveRunId(run.jobId);
    setRunning(false);
    setModalOpen(false);
    setTimeout(resetModal, 200);
    push(
      'success',
      t('aiScreening.resultsCount', '{count} candidates evaluated').replace(
        '{count}',
        formatNumber(results.length, locale)
      )
    );
  };

  const sendToRecruiter = async (run: ScreeningRun) => {
    setSending(run.jobId);
    try {
      const top = [...run.results].sort(
        (a, b) => scoreToPercent(b.overall_score) - scoreToPercent(a.overall_score)
      )[0];
      const topName = run.candidates.find((c) => c.id === top?.candidate_id)?.full_name;
      const summary = run.summary || buildSummary(run.results);
      const title = `AI Screening — ${run.job?.title || t('aiScreening.jobLabel', 'Job')}`;
      const message = [
        `${run.results.length} ${t('aiScreening.candidateCount', 'candidates').toLowerCase()}.`,
        `${t('aiScreening.topScore', 'Top score')}: ${summary.topScore}%.`,
        topName ? `Top candidate: ${topName}.` : '',
        `${t('aiScreening.summary', 'Run summary')}: ${summary.counts.strong_hire} strong hire, ${summary.counts.hire} hire, ${summary.counts.neutral} neutral, ${summary.counts.no_hire} no hire, ${summary.counts.strong_no_hire} strong no hire.`,
      ]
        .filter(Boolean)
        .join(' ');

      const me = await api.auth.getMe().catch(() => null);
      const userId = (me as any)?.id || (me as any)?.user_id || '';

      await api.notifications.create({
        user_id: userId,
        title,
        body: message,
        type: 'screening_complete',
        link: `/dashboard/ai-screening/${run.jobId}`,
        meta: {
          job_id: run.jobId,
          run_id: run.id,
          top_candidate_id: top?.candidate_id,
          top_score: summary.topScore,
        },
      });
      push('success', t('aiScreening.actions.sent', 'Sent to recruiter'));
    } catch (err: any) {
      push('error', err?.message || t('aiScreening.screeningFailed', 'Screening failed'));
    } finally {
      setSending(null);
    }
  };

  const toggleCandidateSelection = (id: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loadingData) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <ToastContainer />
        <Breadcrumb />
        <Skeleton height={32} width={300} />
        <Skeleton height={20} width={500} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
        <Skeleton height={420} />
      </div>
    );
  }

  if (error && runs.length === 0) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Breadcrumb />
        <Card>
          <CardContent className="p-0">
            <ErrorState
              title={t('aiScreening.screeningFailed', "Couldn't load screening")}
              description={error}
              onRetry={loadData}
              retryLabel={t('common.retry', 'Retry')}
              fullHeight
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer />

      <Breadcrumb />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-brand-400" aria-hidden="true" />
            {t('aiScreening.title', 'AI Candidate Screening')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('aiScreening.subtitle', 'Run multi-dimensional AI evaluations across your candidate pool.')}
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          onClick={() => setModalOpen(true)}
          aria-label={t('aiScreening.newScreeningAria', 'Start a new AI screening run')}
        >
          {t('aiScreening.newScreening', 'New screening')}
        </Button>
      </div>

      {runs.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Sparkles className="h-12 w-12" />}
              title={t('aiScreening.noScreenings', 'No screenings yet')}
              description={t(
                'aiScreening.noScreeningsDesc',
                'Pick a job and a pool of candidates to launch your first AI screening run.'
              )}
              action={
                <Button
                  variant="primary"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => setModalOpen(true)}
                >
                  {t('aiScreening.runFirst', 'Run your first screening')}
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {activeRun && activeRun.summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                label={t('aiScreening.candidateCount', 'Candidates')}
                value={formatNumber(activeRun.results.length, locale)}
                icon={Users}
                tone="info"
              />
              <StatsCard
                label={t('aiScreening.avgScore', 'Average score')}
                value={`${activeRun.summary.averageScore}%`}
                icon={BarChart3}
                tone="purple"
              />
              <StatsCard
                label={t('aiScreening.topScore', 'Top score')}
                value={`${activeRun.summary.topScore}%`}
                icon={TrendingUp}
                tone="success"
              />
              <StatsCard
                label={t('aiScreening.strongHireCount', 'Strong hire')}
                value={formatNumber(activeRun.summary.counts.strong_hire, locale)}
                icon={Star}
                tone="warning"
              />
            </div>
          )}

          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {t('aiScreening.summary', 'Run summary')}
                  </span>
                  {runs.map((r) => {
                    const isActive = r.jobId === activeRunId;
                    return (
                      <button
                        key={r.jobId}
                        type="button"
                        onClick={() => setActiveRunId(r.jobId)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          isActive
                            ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-200'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-300 dark:hover:bg-surface-700'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Briefcase className="h-3 w-3" aria-hidden="true" />
                          {r.job?.title || r.jobId.slice(0, 8)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {activeRun && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/ai-screening/${activeRun.jobId}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-brand-400 dark:hover:text-brand-300"
                    >
                      {t('aiScreening.actions.viewReport', 'View full report')}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={
                        sending === activeRun.jobId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )
                      }
                      onClick={() => sendToRecruiter(activeRun)}
                      loading={sending === activeRun.jobId}
                    >
                      {t('aiScreening.actions.sendToRecruiter', 'Send to recruiter')}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {activeRun && (
            <Card>
              <CardContent className="p-0">
                <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-surface-700 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-semibold text-gray-700 dark:text-gray-200">
                      {activeRun.job?.title || t('aiScreening.jobLabel', 'Job')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {t('aiScreening.ranAt', 'Ran')} {formatRelativeTime(activeRun.generatedAt, locale)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {t('aiScreening.resultsCount', '{count} candidates evaluated').replace(
                        '{count}',
                        formatNumber(activeRun.results.length, locale)
                      )}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={resultsSearch}
                        onChange={(e) => setResultsSearch(e.target.value)}
                        placeholder={t('aiScreening.searchResults', 'Search results…')}
                        aria-label={t('aiScreening.searchResults', 'Search results…')}
                        className="w-full sm:w-64 rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100"
                      />
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 dark:border-surface-700 dark:bg-surface-800">
                      <FilterIcon className="ml-1 h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                      <select
                        value={recommendationFilter}
                        onChange={(e) => setRecommendationFilter(e.target.value as Recommendation | 'all')}
                        aria-label={t('aiScreening.filterByRecommendation', 'Filter by recommendation')}
                        className="bg-transparent py-1 pr-2 text-xs text-gray-700 focus:outline-none dark:text-gray-200"
                      >
                        <option value="all">{t('aiScreening.all', 'All recommendations')}</option>
                        {RECOMMENDATION_KEYS.map((rec) => (
                          <option key={rec} value={rec}>
                            {t(`aiScreening.recommendations.${rec}`, rec)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {filteredResults.length === 0 ? (
                  <div className="p-8 text-center">
                    <AlertCircle className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" aria-hidden="true" />
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                      {t('aiScreening.noResults', 'No results match the current filter.')}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-surface-800 dark:text-gray-400">
                        <tr>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            {t('aiScreening.table.candidate', 'Candidate')}
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            {t('aiScreening.table.score', 'Score')}
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            {t('aiScreening.table.recommendation', 'Recommendation')}
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            {t('aiScreening.table.strengths', 'Key strengths')}
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            {t('aiScreening.table.concerns', 'Key concerns')}
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold text-right">
                            {t('aiScreening.table.actions', 'Actions')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
                        {filteredResults.map(({ result, candidate }) => {
                          if (!candidate) return null;
                          const pct = scoreToPercent(result.overall_score);
                          return (
                            <tr
                              key={result.candidate_id}
                              className="transition hover:bg-gray-50 dark:hover:bg-surface-800/50"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white"
                                    aria-hidden="true"
                                  >
                                    {candidate.full_name
                                      ?.split(' ')
                                      .map((n) => n[0])
                                      .filter(Boolean)
                                      .slice(0, 2)
                                      .join('')
                                      .toUpperCase() || '?'}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                                      {candidate.full_name}
                                    </p>
                                    {candidate.headline && (
                                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                        {candidate.headline}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center gap-2">
                                  <span className="w-10 text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                                    {pct}%
                                  </span>
                                  <div
                                    className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-surface-700"
                                    role="progressbar"
                                    aria-valuenow={pct}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                  >
                                    <div
                                      className={`h-full ${RECOMMENDATION_BAR[result.recommendation] || 'bg-gray-400'}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <Badge variant={RECOMMENDATION_BADGE[result.recommendation] || 'default'} size="sm">
                                  {t(
                                    `aiScreening.recommendations.${result.recommendation}`,
                                    result.recommendation
                                  )}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 align-top">
                                {result.strengths.length === 0 ? (
                                  <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                                ) : (
                                  <ul className="space-y-1 text-xs text-gray-700 dark:text-gray-300">
                                    {result.strengths.slice(0, 2).map((s, i) => (
                                      <li key={i} className="flex items-start gap-1.5">
                                        <CheckCircle2
                                          className="mt-0.5 h-3 w-3 shrink-0 text-green-500"
                                          aria-hidden="true"
                                        />
                                        <span className="line-clamp-2">{s}</span>
                                      </li>
                                    ))}
                                    {result.strengths.length > 2 && (
                                      <li className="text-[10px] text-gray-400">
                                        +{result.strengths.length - 2} {t('common.more', 'more')}
                                      </li>
                                    )}
                                  </ul>
                                )}
                              </td>
                              <td className="px-4 py-3 align-top">
                                {result.concerns.length === 0 ? (
                                  <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                                ) : (
                                  <ul className="space-y-1 text-xs text-gray-700 dark:text-gray-300">
                                    {result.concerns.slice(0, 2).map((s, i) => (
                                      <li key={i} className="flex items-start gap-1.5">
                                        <XCircle
                                          className="mt-0.5 h-3 w-3 shrink-0 text-red-500"
                                          aria-hidden="true"
                                        />
                                        <span className="line-clamp-2">{s}</span>
                                      </li>
                                    ))}
                                    {result.concerns.length > 2 && (
                                      <li className="text-[10px] text-gray-400">
                                        +{result.concerns.length - 2} {t('common.more', 'more')}
                                      </li>
                                    )}
                                  </ul>
                                )}
                              </td>
                              <td className="px-4 py-3 align-top text-right">
                                <div className="inline-flex items-center gap-1">
                                  <Link
                                    href={`/dashboard/ai-screening/${activeRun.jobId}#candidate-${result.candidate_id}`}
                                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
                                  >
                                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                                    {t('aiScreening.actions.viewReport', 'Report')}
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={t('aiScreening.newScreening', 'New screening')}
        description={t(
          'aiScreening.subtitle',
          'Run multi-dimensional AI evaluations across your candidate pool.'
        )}
        size="lg"
        closeOnEscape={!running}
        closeOnBackdropClick={!running}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {running
                ? t('aiScreening.progress', '{done} of {total} evaluated')
                    .replace('{done}', formatNumber(progressDone, locale))
                    .replace('{total}', formatNumber(progressTotal, locale))
                : targetCandidateIds.length > 0
                  ? t('aiScreening.selectedCount', '{count} selected').replace(
                      '{count}',
                      formatNumber(targetCandidateIds.length, locale)
                    )
                  : ''}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={closeModal} disabled={running}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={runScreening}
                loading={running}
                disabled={!selectedJobId || targetCandidateIds.length === 0}
                leftIcon={!running ? <Sparkles className="h-4 w-4" /> : undefined}
              >
                {running
                  ? t('aiScreening.running', 'Running…')
                  : t('aiScreening.runScreening', 'Run screening')}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {running && (
            <div
              className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span className="font-medium">
                  {t('aiScreening.running', 'Running…')} {progressTotal > 0 && `(${progressDone}/${progressTotal})`}
                </span>
              </div>
              <p className="mt-1 text-xs text-blue-800 dark:text-brand-300">
                {t(
                  'aiScreening.runningHint',
                  'The AI is evaluating each candidate against the job. This may take up to a minute.'
                )}
              </p>
            </div>
          )}

          <section aria-labelledby="screening-job-label">
            <label
              id="screening-job-label"
              htmlFor="screening-job"
              className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
            >
              {t('aiScreening.selectJob', 'Select a job')}
            </label>
            <select
              id="screening-job"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              disabled={running || openJobs.length === 0}
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100"
            >
              <option value="">{t('aiScreening.selectJobPh', 'Choose a job to screen against…')}</option>
              {openJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                  {j.company ? ` — ${j.company}` : ''}
                </option>
              ))}
            </select>
            {openJobs.length === 0 && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                {t('aiScreening.noJobsDesc', 'Create a job first to run a screening against it.')}
              </p>
            )}
          </section>

          <section aria-labelledby="screening-candidates-label">
            <p
              id="screening-candidates-label"
              className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
            >
              {t('aiScreening.candidatePool', 'Candidate pool')}
            </p>
            <div className="mt-1.5 inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-surface-700 dark:bg-surface-800">
              <button
                type="button"
                onClick={() => setCandidateMode('all')}
                disabled={running}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  candidateMode === 'all'
                    ? 'bg-blue-100 text-blue-700 dark:bg-brand-500/20 dark:text-brand-200'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-surface-700'
                }`}
              >
                {t('aiScreening.allCandidates', 'All candidates')}
              </button>
              <button
                type="button"
                onClick={() => setCandidateMode('select')}
                disabled={running}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  candidateMode === 'select'
                    ? 'bg-blue-100 text-blue-700 dark:bg-brand-500/20 dark:text-brand-200'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-surface-700'
                }`}
              >
                {t('aiScreening.selectCandidates', 'Pick specific candidates')}
              </button>
            </div>

            {candidateMode === 'select' && (
              <div className="mt-3 rounded-lg border border-gray-200 dark:border-surface-700">
                <div className="border-b border-gray-200 p-2 dark:border-surface-700">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      placeholder={t('aiScreening.selectCandidatesPh', 'Choose candidates…')}
                      aria-label={t('aiScreening.selectCandidatesPh', 'Choose candidates…')}
                      disabled={running}
                      className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filteredCandidatesForPicker.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400">
                      {t('aiScreening.noCandidatesDesc', 'No candidates available.')}
                    </div>
                  ) : (
                    <ul role="list" className="divide-y divide-gray-100 dark:divide-surface-700">
                      {filteredCandidatesForPicker.map((c) => {
                        const checked = selectedCandidateIds.has(c.id);
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => toggleCandidateSelection(c.id)}
                              disabled={running}
                              className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-gray-50 focus:outline-none focus-visible:bg-blue-50 disabled:opacity-50 dark:hover:bg-surface-800 dark:focus-visible:bg-brand-500/10"
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  checked
                                    ? 'border-blue-500 bg-blue-500 text-white dark:border-brand-400 dark:bg-brand-500'
                                    : 'border-gray-300 bg-white dark:border-surface-600 dark:bg-surface-800'
                                }`}
                                aria-hidden="true"
                              >
                                {checked && <Check className="h-3 w-3" />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {c.full_name}
                                </p>
                                {c.email && (
                                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                    {c.email}
                                  </p>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </Modal>
    </div>
  );
}
