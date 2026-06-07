'use client';

import { useState, useEffect, useCallback, useMemo, useId } from 'react';
import Link from 'next/link';
import {
  Plus,
  ClipboardList,
  Search,
  Filter,
  Calendar,
  Clock,
  Play,
  User,
  Briefcase,
  Send,
  Trash2,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  ErrorState,
  useToast,
  Breadcrumb,
  ConfirmDialog,
  Tabs,
  Progress,
} from '@/components';
import type { Tab } from '@/components/ui/tabs';
import { useLocaleStore, translate, interpolate, formatRelativeTime } from '@/stores/locale-store';
import type { AssessmentTypes } from '@/services/api/types';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'default' | 'danger' | 'purple'> = {
  draft: 'default',
  pending: 'info',
  sent: 'info',
  in_progress: 'warning',
  completed: 'success',
  expired: 'danger',
  cancelled: 'danger',
};

const DIFFICULTY_VARIANT: Record<string, 'success' | 'warning' | 'danger'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
};

const STATUS_ORDER: AssessmentTypes.AssessmentStatus[] = [
  'draft',
  'pending',
  'in_progress',
  'completed',
  'expired',
  'cancelled',
];

function statusLabel(s: string, locale: string): string {
  return translate(locale as any, `assessments.statuses.${s}`, s);
}

export default function AssessmentsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [assessments, setAssessments] = useState<AssessmentTypes.AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [candidateFilter, setCandidateFilter] = useState<string>('all');
  const [jobFilter, setJobFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [candidates, setCandidates] = useState<Array<{ id: string; label: string }>>([]);
  const [jobs, setJobs] = useState<Array<{ id: string; label: string }>>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AssessmentTypes.AssessmentSummary | null>(null);
  const { push, ToastContainer } = useToast();
  const searchId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page_size: '100' };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res: any = await api.assessments.list(params);
      const items: AssessmentTypes.AssessmentSummary[] = Array.isArray(res)
        ? res
        : res?.data || [];
      setAssessments(items);
    } catch (err: any) {
      setError(err?.message || t('assessments.couldntLoad', "Couldn't load assessments"));
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([api.candidates.list({ page_size: '200' } as any), api.jobs.list({ page_size: '200' } as any)])
      .then((results) => {
        if (!mounted) return;
        const candRes = results[0];
        if (candRes.status === 'fulfilled') {
          const data = (candRes.value as any)?.data || candRes.value;
          setCandidates(
            (Array.isArray(data) ? data : []).map((c: any) => ({
              id: c.id,
              label: c.full_name || c.name || c.email || c.id,
            }))
          );
        }
        const jobRes = results[1];
        if (jobRes.status === 'fulfilled') {
          const data = (jobRes.value as any)?.data || jobRes.value;
          setJobs(
            (Array.isArray(data) ? data : []).map((j: any) => ({
              id: j.id,
              label: j.title || j.id,
            }))
          );
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return assessments.filter((a) => {
      if (activeTab !== 'all' && a.status !== activeTab) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (candidateFilter !== 'all' && a.candidate_id !== candidateFilter) return false;
      if (jobFilter !== 'all' && a.job_id !== jobFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          a.title,
          a.candidate_name || '',
          a.job_title || '',
          a.candidate_id,
          a.job_id,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [assessments, activeTab, statusFilter, candidateFilter, jobFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: assessments.length };
    STATUS_ORDER.forEach((s) => {
      c[s] = assessments.filter((a) => a.status === s).length;
    });
    return c;
  }, [assessments]);

  const handleSend = async (id: string) => {
    setActionLoading(id);
    try {
      await api.assessments.send(id);
      push('success', t('assessments.sent', 'Assessment sent to candidate'));
      await load();
    } catch (err: any) {
      const e = err as APIError;
      push('error', e?.message || t('assessments.sendFailed', 'Failed to send assessment'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setActionLoading(id);
    try {
      await api.assessments.delete(id);
      push('success', t('assessments.deleted', 'Assessment deleted'));
      setConfirmDelete(null);
      await load();
    } catch (err: any) {
      const e = err as APIError;
      push('error', e?.message || t('assessments.deleteFailed', 'Failed to delete assessment'));
    } finally {
      setActionLoading(null);
    }
  };

  const tabs: Tab[] = useMemo(
    () => [
      {
        id: 'all',
        label: interpolate(t('assessments.tabs.all', 'All ({n})'), { n: String(counts.all) }),
      },
      ...STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => ({
        id: s,
        label: `${t(`assessments.statuses.${s}`, s)} (${counts[s]})`,
      })),
    ],
    [counts, t]
  );

  return (
    <div className="space-y-6">
      <ToastContainer />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-blue-600 dark:text-brand-400" aria-hidden="true" />
            {t('assessments.title', 'Assessments')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {interpolate(t('assessments.subtitle', '{total} total assessments'), { total: String(assessments.length) })}
          </p>
        </div>
        <Link href="/dashboard/assessments/new">
          <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
            {t('assessments.create', 'New assessment')}
          </Button>
        </Link>
      </div>

      <Breadcrumb />

      <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              id={searchId}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('assessments.search', 'Search by title, candidate, or job…')}
              aria-label={t('assessments.searchAria', 'Search assessments')}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400 shrink-0" aria-hidden="true" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t('assessments.filterByStatus', 'Filter by status')}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
            >
              <option value="all">{t('assessments.statuses.all', 'All statuses')}</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {t(`assessments.statuses.${s}`, s)}
                </option>
              ))}
            </select>
            <select
              value={candidateFilter}
              onChange={(e) => setCandidateFilter(e.target.value)}
              aria-label={t('assessments.filterByCandidate', 'Filter by candidate')}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
            >
              <option value="all">{t('assessments.allCandidates', 'All candidates')}</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              aria-label={t('assessments.filterByJob', 'Filter by job')}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
            >
              <option value="all">{t('assessments.allJobs', 'All jobs')}</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 border-t border-gray-100 dark:border-surface-700 pt-3">
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={setActiveTab}
            variant="pills"
            size="sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title={t('assessments.couldntLoad', "Couldn't load assessments")}
          description={error}
          onRetry={() => load()}
          retryLabel={t('common.retry', 'Retry')}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title={
            assessments.length === 0
              ? t('assessments.emptyTitle', 'No assessments yet')
              : t('assessments.emptyFiltered', 'No assessments match your filters')
          }
          description={
            assessments.length === 0
              ? t(
                  'assessments.emptyDesc',
                  'Create your first assessment to evaluate candidates for a job.'
                )
              : t('assessments.tryAdjusting', 'Try adjusting your filters.')
          }
          action={
            assessments.length === 0 ? (
              <Link href="/dashboard/assessments/new">
                <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
                  {t('assessments.create', 'New assessment')}
                </Button>
              </Link>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setCandidateFilter('all');
                  setJobFilter('all');
                  setActiveTab('all');
                }}
              >
                {t('assessments.clearFilters', 'Clear filters')}
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((a) => (
            <AssessmentCard
              key={a.id}
              assessment={a}
              locale={locale}
              t={t}
              actionLoading={actionLoading === a.id}
              onSend={() => handleSend(a.id)}
              onDelete={() => setConfirmDelete(a)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title={t('assessments.deleteTitle', 'Delete assessment?')}
        description={t(
          'assessments.deleteDesc',
          'This will permanently remove the assessment and its questions. This action cannot be undone.'
        )}
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        loading={!!actionLoading}
      />
    </div>
  );
}

function AssessmentCard({
  assessment,
  locale,
  t,
  actionLoading,
  onSend,
  onDelete,
}: {
  assessment: AssessmentTypes.AssessmentSummary;
  locale: string;
  t: (k: string, fb?: string) => string;
  actionLoading: boolean;
  onSend: () => void;
  onDelete: () => void;
}) {
  const status = assessment.status;
  const variant = STATUS_VARIANT[status] || 'default';
  const showScore = status === 'completed' && typeof assessment.score_percent === 'number';
  const canTake = status === 'pending' || status === 'in_progress';
  const canSend = status === 'draft' || status === 'pending';
  return (
    <Card padding="md" className="flex flex-col h-full">
      <CardContent className="flex-1 space-y-3" padding="none">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Link
              href={`/dashboard/assessments/${assessment.id}`}
              className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-brand-400 transition">
                {assessment.title}
              </h3>
            </Link>
            <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" aria-hidden="true" />
                <span className="truncate max-w-[140px]">
                  {assessment.candidate_name || t('assessments.unknownCandidate', 'Unknown candidate')}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3 w-3" aria-hidden="true" />
                <span className="truncate max-w-[140px]">
                  {assessment.job_title || t('assessments.unknownJob', 'Unknown job')}
                </span>
              </span>
            </div>
          </div>
          <Badge variant={variant} size="sm" dot>
            {statusLabel(status, locale)}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <Badge variant={DIFFICULTY_VARIANT[assessment.difficulty] || 'default'} size="sm">
            {t(`assessments.difficulty.${assessment.difficulty}`, assessment.difficulty)}
          </Badge>
          <Badge variant="outline" size="sm">
            {t('assessments.questionsCount', '{n} questions').replace('{n}', String(assessment.question_count))}
          </Badge>
          {typeof assessment.time_limit_minutes === 'number' && (
            <Badge variant="outline" size="sm">
              <Clock className="h-3 w-3 mr-0.5" aria-hidden="true" />
              {t('assessments.minutesShort', '{n} min').replace('{n}', String(assessment.time_limit_minutes))}
            </Badge>
          )}
        </div>

        {showScore && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                {t('assessments.score', 'Score')}
              </span>
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {Math.round(assessment.score_percent ?? 0)}%
              </span>
            </div>
            <Progress
              value={assessment.score_percent ?? 0}
              variant={
                (assessment.score_percent ?? 0) >= 70
                  ? 'success'
                  : (assessment.score_percent ?? 0) >= 40
                    ? 'warning'
                    : 'danger'
              }
            />
          </div>
        )}

        {assessment.due_at && status !== 'completed' && (
          <p className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            {t('assessments.due', 'Due {when}').replace('{when}', formatRelativeTime(assessment.due_at, locale as any))}
          </p>
        )}
      </CardContent>
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-surface-700 flex items-center justify-between gap-2">
        <Link
          href={`/dashboard/assessments/${assessment.id}`}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-brand-400 dark:hover:text-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          {t('common.viewDetails', 'View details')}
        </Link>
        <div className="flex items-center gap-1.5">
          {canTake && (
            <Link href={`/dashboard/assessments/${assessment.id}/take`}>
              <Button size="sm" variant="primary" leftIcon={<Play className="h-3 w-3" />}>
                {status === 'in_progress'
                  ? t('assessments.actions.continue', 'Continue')
                  : t('assessments.actions.take', 'Take')}
              </Button>
            </Link>
          )}
          {canSend && (
            <Button
              size="sm"
              variant="secondary"
              loading={actionLoading}
              disabled={actionLoading}
              leftIcon={<Send className="h-3 w-3" />}
              onClick={onSend}
            >
              {t('assessments.actions.send', 'Send')}
            </Button>
          )}
          {status === 'draft' && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('common.delete', 'Delete')}
              loading={actionLoading}
              disabled={actionLoading}
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
