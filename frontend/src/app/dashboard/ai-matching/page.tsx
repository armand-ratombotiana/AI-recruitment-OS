'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Loader2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Briefcase,
  Users,
  Filter as FilterIcon,
  CalendarPlus,
  PlusCircle,
  AlertCircle,
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
  useToast,
  Tabs,
} from '@/components';
import type { Tab } from '@/components';
import { useLocaleStore, translate, formatNumber } from '@/stores/locale-store';
import { MatchResultCard } from '@/components/ai-matching/match-result-card';
import { MatchStats } from '@/components/ai-matching/match-stats';

interface Job {
  id: string;
  title: string;
  company?: string;
  location?: string;
  department?: string;
  status?: string;
}

interface Candidate {
  id: string;
  full_name: string;
  email?: string;
  headline?: string;
  location?: string;
  skills?: string[];
}

interface CandidateMatchResult {
  candidate_id: string;
  full_name: string;
  email?: string;
  score: number;
  semantic_score?: number;
  hybrid_score?: number;
  matched_skills: string[];
  missing_skills: string[];
  rationale: string;
}

interface JobMatchResult {
  job_id: string;
  title: string;
  company?: string;
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  rationale: string;
  department?: string;
  location?: string;
}

type SortField = 'score' | 'name';
type SortDir = 'asc' | 'desc';

function toPct(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score > 1) return Math.min(100, Math.max(0, Math.round(score)));
  return Math.min(100, Math.max(0, Math.round(score * 100)));
}

export default function AIMatchingPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);

  const [activeTab, setActiveTab] = useState(0);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [runningMatch, setRunningMatch] = useState(false);

  const [candidateResults, setCandidateResults] = useState<CandidateMatchResult[]>([]);
  const [jobResults, setJobResults] = useState<JobMatchResult[]>([]);

  const [scoreThreshold, setScoreThreshold] = useState(0);
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  const [deptFilter, setDeptFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { push, ToastContainer } = useToast();

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [jobsRes, candRes] = await Promise.all([
        api.listJobs().catch(() => ({ data: [] })),
        api.listCandidates().catch(() => ({ data: [] })),
      ]);
      const jobsList: Job[] = (jobsRes as any)?.data || jobsRes || [];
      const candList: Candidate[] = (candRes as any)?.data || candRes || [];
      setJobs(Array.isArray(jobsList) ? jobsList : []);
      setCandidates(Array.isArray(candList) ? candList : []);
    } catch {
      push('error', t('aiMatching.loadError', "Couldn't load data"));
    } finally {
      setLoadingData(false);
    }
  }, [t, push]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openJobs = useMemo(
    () => jobs.filter((j) => !j.status || j.status === 'open' || j.status === 'draft'),
    [jobs]
  );

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      if (j.department) set.add(j.department);
    }
    return Array.from(set).sort();
  }, [jobs]);

  const runMatchCandidatesToJob = async () => {
    if (!selectedJobId) {
      push('error', t('aiMatching.selectJob', 'Select a job first'));
      return;
    }
    setRunningMatch(true);
    setCandidateResults([]);
    setSelectedIds(new Set());
    try {
      const res: any = await api.jobs.getMatchedCandidates(selectedJobId);
      const data = res?.data || res;
      const items: CandidateMatchResult[] = (data?.candidates || data || []).map((c: any) => ({
        candidate_id: c.candidate_id || c.id,
        full_name: c.full_name || c.name || 'Unknown',
        email: c.email,
        score: typeof c.score === 'number' ? c.score : typeof c.match_score === 'number' ? c.match_score : 0,
        semantic_score: typeof c.semantic_score === 'number' ? c.semantic_score : undefined,
        hybrid_score: typeof c.hybrid_score === 'number' ? c.hybrid_score : undefined,
        matched_skills: Array.isArray(c.matched_skills) ? c.matched_skills : [],
        missing_skills: Array.isArray(c.missing_skills) ? c.missing_skills : [],
        rationale: c.rationale || '',
      }));
      setCandidateResults(items);
      push(
        'success',
        t('aiMatching.matchComplete', '{count} matches found').replace(
          '{count}',
          formatNumber(items.length, locale)
        )
      );
    } catch (err: any) {
      push('error', err?.message || t('aiMatching.matchFailed', 'Matching failed'));
    } finally {
      setRunningMatch(false);
    }
  };

  const runMatchJobsToCandidate = async () => {
    if (!selectedCandidateId) {
      push('error', t('aiMatching.selectCandidate', 'Select a candidate first'));
      return;
    }
    setRunningMatch(true);
    setJobResults([]);
    try {
      const res: any = await api.candidates.match(selectedCandidateId);
      const data = res?.data || res;
      const matches = data?.matches || data?.result?.matches || [];
      const items: JobMatchResult[] = matches.map((m: any) => {
        const job = jobs.find((j) => j.id === (m.job_id || m.id));
        return {
          job_id: m.job_id || m.id,
          title: m.title || job?.title || 'Unknown',
          company: m.company || job?.company,
          score: typeof m.score === 'number' ? m.score : 0,
          matched_skills: Array.isArray(m.matched_skills) ? m.matched_skills : [],
          missing_skills: Array.isArray(m.missing_skills) ? m.missing_skills : [],
          rationale: m.rationale || '',
          department: job?.department,
          location: job?.location,
        };
      });
      setJobResults(items);
      push(
        'success',
        t('aiMatching.matchComplete', '{count} matches found').replace(
          '{count}',
          formatNumber(items.length, locale)
        )
      );
    } catch (err: any) {
      push('error', err?.message || t('aiMatching.matchFailed', 'Matching failed'));
    } finally {
      setRunningMatch(false);
    }
  };

  const filteredCandidateResults = useMemo(() => {
    let results = candidateResults.filter((r) => toPct(r.score) >= scoreThreshold);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter(
        (r) =>
          r.full_name?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.matched_skills.some((s) => s.toLowerCase().includes(q))
      );
    }
    results.sort((a, b) => {
      if (sortField === 'score') {
        return sortDir === 'desc' ? toPct(b.score) - toPct(a.score) : toPct(a.score) - toPct(b.score);
      }
      const cmp = (a.full_name || '').localeCompare(b.full_name || '');
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return results;
  }, [candidateResults, scoreThreshold, searchQuery, sortField, sortDir]);

  const filteredJobResults = useMemo(() => {
    let results = [...jobResults];
    if (deptFilter !== 'all') {
      results = results.filter((r) => r.department === deptFilter);
    }
    if (locationFilter.trim()) {
      const q = locationFilter.toLowerCase();
      results = results.filter((r) => r.location?.toLowerCase().includes(q));
    }
    results.sort((a, b) => toPct(b.score) - toPct(a.score));
    return results;
  }, [jobResults, deptFilter, locationFilter]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCandidateResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCandidateResults.map((r) => r.candidate_id)));
    }
  };

  const handleBulkAddToPipeline = () => {
    if (selectedIds.size === 0) return;
    push(
      'success',
      t('aiMatching.addedToPipeline', '{count} candidates added to pipeline').replace(
        '{count}',
        formatNumber(selectedIds.size, locale)
      )
    );
    setSelectedIds(new Set());
  };

  const handleBulkScheduleInterview = () => {
    if (selectedIds.size === 0) return;
    push(
      'success',
      t('aiMatching.interviewScheduled', '{count} interviews queued').replace(
        '{count}',
        formatNumber(selectedIds.size, locale)
      )
    );
    setSelectedIds(new Set());
  };

  const candidateScores = candidateResults.map((r) => r.score);
  const avgCandidateScore =
    candidateScores.length > 0
      ? candidateScores.reduce((a, b) => a + toPct(b), 0) / candidateScores.length
      : 0;
  const topCandidateScore = candidateScores.length > 0 ? Math.max(...candidateScores.map(toPct)) : 0;
  const topCandidateMatches = candidateScores.filter((s) => toPct(s) >= 80).length;

  const tabs: Tab[] = [
    { id: 'candidates', label: t('aiMatching.tabCandidates', 'Match Candidates to Job') },
    { id: 'jobs', label: t('aiMatching.tabJobs', 'Match Jobs to Candidate') },
  ];

  const SortIcon = sortField === 'score' ? (sortDir === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
  const NameSortIcon = sortField === 'name' ? (sortDir === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;

  if (loadingData) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <ToastContainer />
        <Breadcrumb />
        <Skeleton height={32} width={300} />
        <Skeleton height={20} width={500} />
        <Skeleton height={48} />
        <Skeleton height={420} />
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
            <Sparkles className="h-6 w-6 text-blue-600 dark:text-brand-400" aria-hidden="true" />
            {t('aiMatching.title', 'AI Matching Dashboard')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('aiMatching.subtitle', 'Semantic + hybrid scoring to find the perfect match.')}
          </p>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 0 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 items-center gap-3">
                <Briefcase className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  disabled={runningMatch}
                  aria-label={t('aiMatching.selectJob', 'Select a job')}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100 sm:max-w-xs"
                >
                  <option value="">{t('aiMatching.selectJobPh', 'Choose a job…')}</option>
                  {openJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                      {j.company ? ` — ${j.company}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="primary"
                size="md"
                leftIcon={runningMatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                onClick={runMatchCandidatesToJob}
                loading={runningMatch}
                disabled={!selectedJobId}
              >
                {runningMatch ? t('aiMatching.running', 'Matching…') : t('aiMatching.runMatch', 'Run matching')}
              </Button>
            </CardContent>
          </Card>

          {candidateResults.length > 0 && (
            <MatchStats
              totalMatches={candidateResults.length}
              avgScore={avgCandidateScore}
              topScore={topCandidateScore}
              topMatches={topCandidateMatches}
              scores={candidateScores}
            />
          )}

          {candidateResults.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-surface-700 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('aiMatching.searchCandidates', 'Search candidates…')}
                        aria-label={t('aiMatching.searchCandidates', 'Search candidates…')}
                        className="w-full sm:w-64 rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100"
                      />
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 dark:border-surface-700 dark:bg-surface-800">
                      <FilterIcon className="ml-1 h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                      <label htmlFor="score-threshold" className="sr-only">
                        {t('aiMatching.scoreThreshold', 'Min score')}
                      </label>
                      <select
                        id="score-threshold"
                        value={scoreThreshold}
                        onChange={(e) => setScoreThreshold(Number(e.target.value))}
                        aria-label={t('aiMatching.scoreThreshold', 'Min score')}
                        className="bg-transparent py-1 pr-2 text-xs text-gray-700 focus:outline-none dark:text-gray-200"
                      >
                        <option value={0}>{t('aiMatching.allScores', 'All scores')}</option>
                        <option value={20}>20%+</option>
                        <option value={40}>40%+</option>
                        <option value={60}>60%+</option>
                        <option value={80}>80%+</option>
                      </select>
                    </div>
                  </div>

                  {selectedIds.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('aiMatching.selectedCount', '{count} selected').replace(
                          '{count}',
                          formatNumber(selectedIds.size, locale)
                        )}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<PlusCircle className="h-3.5 w-3.5" />}
                        onClick={handleBulkAddToPipeline}
                      >
                        {t('aiMatching.addToPipeline', 'Add to pipeline')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<CalendarPlus className="h-3.5 w-3.5" />}
                        onClick={handleBulkScheduleInterview}
                      >
                        {t('aiMatching.scheduleInterview', 'Schedule interview')}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-surface-800 dark:text-gray-400">
                      <tr>
                        <th scope="col" className="w-10 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.size === filteredCandidateResults.length && filteredCandidateResults.length > 0}
                            onChange={toggleSelectAll}
                            aria-label={t('aiMatching.selectAll', 'Select all')}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-surface-600"
                          />
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          <button
                            type="button"
                            onClick={() => toggleSort('name')}
                            className="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            {t('aiMatching.table.candidate', 'Candidate')}
                            <NameSortIcon className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          <button
                            type="button"
                            onClick={() => toggleSort('score')}
                            className="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                          >
                            {t('aiMatching.table.matchScore', 'Match')}
                            <SortIcon className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          {t('aiMatching.table.semanticScore', 'Semantic')}
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          {t('aiMatching.table.hybridScore', 'Hybrid')}
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          {t('aiMatching.table.topSkills', 'Top skills')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
                      {filteredCandidateResults.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center">
                            <AlertCircle className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" aria-hidden="true" />
                            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                              {t('aiMatching.noResults', 'No results match the current filter.')}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredCandidateResults.map((r) => {
                          const pct = toPct(r.score);
                          const semPct = r.semantic_score != null ? toPct(r.semantic_score) : null;
                          const hybPct = r.hybrid_score != null ? toPct(r.hybrid_score) : null;
                          const checked = selectedIds.has(r.candidate_id);
                          return (
                            <tr
                              key={r.candidate_id}
                              className="transition hover:bg-gray-50 dark:hover:bg-surface-800/50"
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSelect(r.candidate_id)}
                                  aria-label={t('aiMatching.selectCandidateRow', 'Select {name}').replace('{name}', r.full_name)}
                                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-surface-600"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white"
                                    aria-hidden="true"
                                  >
                                    {r.full_name
                                      ?.split(' ')
                                      .map((n) => n[0])
                                      .filter(Boolean)
                                      .slice(0, 2)
                                      .join('')
                                      .toUpperCase() || '?'}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-gray-900 dark:text-gray-100">{r.full_name}</p>
                                    {r.email && (
                                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{r.email}</p>
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
                                      className={`h-full ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                {semPct != null ? (
                                  <Badge variant={semPct >= 70 ? 'success' : semPct >= 40 ? 'default' : 'warning'} size="sm">
                                    {semPct}%
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 align-top">
                                {hybPct != null ? (
                                  <Badge variant={hybPct >= 70 ? 'success' : hybPct >= 40 ? 'default' : 'warning'} size="sm">
                                    {hybPct}%
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 align-top">
                                {r.matched_skills.length === 0 ? (
                                  <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {r.matched_skills.slice(0, 3).map((s) => (
                                      <span
                                        key={s}
                                        className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-brand-500/15 dark:text-brand-300"
                                      >
                                        {s}
                                      </span>
                                    ))}
                                    {r.matched_skills.length > 3 && (
                                      <span className="text-[10px] text-gray-400">
                                        +{r.matched_skills.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {candidateResults.length === 0 && !runningMatch && (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={<Sparkles className="h-12 w-12" />}
                  title={t('aiMatching.noMatches', 'No matches yet')}
                  description={t(
                    'aiMatching.noMatchesDesc',
                    'Select a job and run matching to find the best candidates.'
                  )}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 1 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 items-center gap-3">
                <Users className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <select
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  disabled={runningMatch}
                  aria-label={t('aiMatching.selectCandidate', 'Select a candidate')}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100 sm:max-w-xs"
                >
                  <option value="">{t('aiMatching.selectCandidatePh', 'Choose a candidate…')}</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                      {c.email ? ` — ${c.email}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="primary"
                size="md"
                leftIcon={runningMatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                onClick={runMatchJobsToCandidate}
                loading={runningMatch}
                disabled={!selectedCandidateId}
              >
                {runningMatch ? t('aiMatching.running', 'Matching…') : t('aiMatching.runMatch', 'Run matching')}
              </Button>
            </CardContent>
          </Card>

          {jobResults.length > 0 && (
            <Card>
              <CardContent className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-surface-700 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 dark:border-surface-700 dark:bg-surface-800">
                    <FilterIcon className="ml-1 h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                    <label htmlFor="dept-filter" className="sr-only">
                      {t('aiMatching.filterDepartment', 'Department')}
                    </label>
                    <select
                      id="dept-filter"
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="bg-transparent py-1 pr-2 text-xs text-gray-700 focus:outline-none dark:text-gray-200"
                    >
                      <option value="all">{t('aiMatching.allDepartments', 'All departments')}</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                    <input
                      type="search"
                      value={locationFilter}
                      onChange={(e) => setLocationFilter(e.target.value)}
                      placeholder={t('aiMatching.filterLocation', 'Filter by location…')}
                      aria-label={t('aiMatching.filterLocation', 'Filter by location…')}
                      className="w-full sm:w-48 rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100"
                    />
                  </div>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t('aiMatching.showingCount', '{count} matches').replace(
                    '{count}',
                    formatNumber(filteredJobResults.length, locale)
                  )}
                </span>
              </CardContent>
            </Card>
          )}

          {filteredJobResults.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredJobResults.map((r) => (
                <MatchResultCard
                  key={r.job_id}
                  title={r.title}
                  subtitle={[r.company, r.location].filter(Boolean).join(' · ')}
                  overallScore={r.score}
                  scores={[
                    { label: 'Match', value: r.score, color: 'bg-blue-500' },
                    ...(r.matched_skills.length > 0
                      ? [
                          {
                            label: 'Skills',
                            value: Math.min(100, (r.matched_skills.length / Math.max(1, r.matched_skills.length + r.missing_skills.length)) * 100),
                            color: 'bg-emerald-500',
                          },
                        ]
                      : []),
                  ]}
                  matchedSkills={r.matched_skills}
                  missingSkills={r.missing_skills}
                  rationale={r.rationale}
                />
              ))}
            </div>
          ) : jobResults.length > 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" aria-hidden="true" />
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  {t('aiMatching.noResults', 'No results match the current filter.')}
                </p>
              </CardContent>
            </Card>
          ) : (
            !runningMatch && (
              <Card>
                <CardContent className="p-0">
                  <EmptyState
                    icon={<Sparkles className="h-12 w-12" />}
                    title={t('aiMatching.noMatches', 'No matches yet')}
                    description={t(
                      'aiMatching.noMatchesJobsDesc',
                      'Select a candidate and run matching to find the best jobs.'
                    )}
                  />
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}
