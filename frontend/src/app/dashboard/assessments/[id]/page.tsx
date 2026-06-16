'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ClipboardList,
  Play,
  Send,
  Trash2,
  User,
  Briefcase,
  Clock,
  CheckCircle2,
  Sparkles,
  Award,
  Target,
  ListChecks,
  Code2,
  Type,
  FileText,
  Calendar,
  AlertCircle,
  XCircle,
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
  Progress,
  ConfirmDialog,
} from '@/components';
import { useLocaleStore, translate, interpolate, formatDate, formatRelativeTime } from '@/stores/locale-store';
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

const TYPE_META: Record<AssessmentTypes.QuestionType, { icon: typeof ListChecks; label: string }> = {
  mcq: { icon: ListChecks, label: 'Multiple choice' },
  short_answer: { icon: Type, label: 'Short answer' },
  text: { icon: FileText, label: 'Long form' },
  coding: { icon: Code2, label: 'Coding' },
};

const RECOMMENDATION_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'default'> = {
  strong_hire: 'success',
  hire: 'success',
  neutral: 'info',
  no_hire: 'warning',
  strong_no_hire: 'danger',
};

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() || '')
    .join('');
}

export default function AssessmentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [assessment, setAssessment] = useState<AssessmentTypes.AssessmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { push } = useToast();
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data: any = await api.assessments.get(params.id);
      const detail: AssessmentTypes.AssessmentDetail | null = data?.id
        ? data
        : data?.data || null;
      if (!detail || !detail.id) {
        setNotFound(true);
        setAssessment(null);
        return;
      }
      setAssessment(detail);
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 404) {
        setNotFound(true);
      } else {
        setError(err?.message || t('assessments.couldntLoad', "Couldn't load assessment"));
      }
      setAssessment(null);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [params.id, t]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  const handleSend = async () => {
    if (!assessment) return;
    setActionLoading('send');
    try {
      await api.assessments.send(assessment.id);
      push('success', t('assessments.sent', 'Assessment sent to candidate'));
      await load();
    } catch (err: any) {
      const e = err as APIError;
      push('error', e?.message || t('assessments.sendFailed', 'Failed to send assessment'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!assessment) return;
    setActionLoading('cancel');
    try {
      await api.assessments.cancel(assessment.id);
      push('success', t('assessments.cancelled', 'Assessment cancelled'));
      await load();
    } catch (err: any) {
      const e = err as APIError;
      push('error', e?.message || t('assessments.cancelFailed', 'Failed to cancel assessment'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!assessment) return;
    setActionLoading('delete');
    try {
      await api.assessments.delete(assessment.id);
      push('success', t('assessments.deleted', 'Assessment deleted'));
      setConfirmDelete(false);
      router.push('/dashboard/assessments');
    } catch (err: any) {
      const e = err as APIError;
      push('error', e?.message || t('assessments.deleteFailed', 'Failed to delete assessment'));
    } finally {
      setActionLoading(null);
    }
  };

  const status = assessment?.status;
  const canTake = status === 'pending' || status === 'in_progress';
  const canSend = status === 'draft' || status === 'pending';
  const canCancel = status !== 'completed' && status !== 'cancelled' && status !== 'expired';
  const canDelete = status === 'draft' || status === 'cancelled';
  const isCompleted = status === 'completed';

  const answeredCount = useMemo(() => {
    if (!assessment?.answers) return 0;
    return assessment.answers.filter((a) => {
      if (a.selected_option_id) return true;
      if (a.text && a.text.trim().length > 0) return true;
      if (a.code && a.code.trim().length > 0) return true;
      return false;
    }).length;
  }, [assessment]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton height={32} width="40%" />
        <Skeleton height={120} />
        <Skeleton height={300} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <Breadcrumb />
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title={t('assessments.notFoundTitle', 'Assessment not found')}
          description={t('assessments.notFoundDesc', 'This assessment may have been deleted or never existed.')}
          action={
            <Link href="/dashboard/assessments">
              <Button variant="primary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                {t('assessments.backToList', 'Back to assessments')}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="space-y-4">
        <Breadcrumb />
      <ErrorState
        title={t('assessments.couldntLoad', "Couldn't load assessment")}
        description={error || ''}
        onRetry={() => load()}
        retryLabel={t('common.retry', 'Retry')}
      />
      </div>
    );
  }

  return (
    <div className="space-y-6">
<Link
        href="/dashboard/assessments"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('assessments.backToList', 'Back to assessments')}
      </Link>

      <Breadcrumb />

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {assessment.title}
            </h1>
            <Badge variant={STATUS_VARIANT[assessment.status] || 'default'} size="md" dot>
              {t(`assessments.statuses.${assessment.status}`, assessment.status)}
            </Badge>
          </div>
          <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <User className="h-4 w-4" aria-hidden="true" />
              <span>{assessment.candidate_name || assessment.candidate_id}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Briefcase className="h-4 w-4" aria-hidden="true" />
              <span>{assessment.job_title || assessment.job_id}</span>
            </span>
            {assessment.created_at && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" aria-hidden="true" />
                  <span>{formatDate(assessment.created_at, locale, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canTake && (
            <Link href={`/dashboard/assessments/${assessment.id}/take`}>
              <Button variant="primary" leftIcon={<Play className="h-4 w-4" />}>
                {assessment.status === 'in_progress'
                  ? t('assessments.actions.continue', 'Continue')
                  : t('assessments.actions.take', 'Take assessment')}
              </Button>
            </Link>
          )}
          {canSend && (
            <Button
              variant="secondary"
              loading={actionLoading === 'send'}
              disabled={!!actionLoading}
              leftIcon={<Send className="h-4 w-4" />}
              onClick={handleSend}
            >
              {t('assessments.actions.send', 'Send to candidate')}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="ghost"
              loading={actionLoading === 'cancel'}
              disabled={!!actionLoading}
              leftIcon={<XCircle className="h-4 w-4" />}
              onClick={handleCancel}
            >
              {t('assessments.actions.cancel', 'Cancel')}
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              loading={actionLoading === 'delete'}
              disabled={!!actionLoading}
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => setConfirmDelete(true)}
              aria-label={t('common.delete', 'Delete')}
            >
              {t('common.delete', 'Delete')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label={t('assessments.stats.questions', 'Questions')}
          value={String(assessment.questions.length || assessment.question_count)}
          icon={<ListChecks className="h-4 w-4" aria-hidden="true" />}
        />
        <StatCard
          label={t('assessments.stats.difficulty', 'Difficulty')}
          value={t(`assessments.difficulty.${assessment.difficulty}`, assessment.difficulty)}
          icon={<Target className="h-4 w-4" aria-hidden="true" />}
          badgeVariant={DIFFICULTY_VARIANT[assessment.difficulty]}
        />
        <StatCard
          label={t('assessments.stats.timeLimit', 'Time limit')}
          value={
            assessment.time_limit_minutes
              ? t('assessments.minutesShort', '{n} min').replace('{n}', String(assessment.time_limit_minutes))
              : t('assessments.unlimited', 'Untimed')
          }
          icon={<Clock className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      {isCompleted && typeof assessment.score_percent === 'number' && (
        <Card padding="lg" className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-brand-500/10 dark:via-accent-500/10 dark:to-pink-500/10 border-blue-100 dark:border-brand-500/30">
          <CardContent padding="none">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-blue-700 dark:text-brand-300">
                  {t('assessments.results.finalScore', 'Final score')}
                </p>
                <p className="text-4xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {Math.round(assessment.score_percent)}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('assessments.results.scoreRaw', '{earned} of {total} points').replace('{earned}', String(assessment.score ?? 0)).replace('{total}', String(assessment.total_points))}
                </p>
              </div>
              {assessment.recommendation && (
                <Badge
                  variant={RECOMMENDATION_VARIANT[assessment.recommendation] || 'default'}
                  size="lg"
                  icon={<Award className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {t(`assessments.recommendation.${assessment.recommendation}`, assessment.recommendation.replace('_', ' '))}
                </Badge>
              )}
            </div>
            <div className="mt-4">
              <Progress
                value={assessment.score_percent}
                variant={
                  (assessment.score_percent ?? 0) >= 70
                    ? 'success'
                    : (assessment.score_percent ?? 0) >= 40
                      ? 'warning'
                      : 'danger'
                }
                size="lg"
              />
            </div>
            {assessment.ai_feedback && (
              <div className="mt-4 p-3 bg-white/70 dark:bg-surface-900/70 rounded-lg border border-blue-100 dark:border-brand-500/20">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600 dark:text-brand-400 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-1">
                      {t('assessments.results.aiFeedback', 'AI feedback')}
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {assessment.ai_feedback}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {assessment.due_at && assessment.status !== 'completed' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            {t('assessments.dueNotice', 'This assessment is due {when}.').replace(
              '{when}',
              formatRelativeTime(assessment.due_at, locale)
            )}
          </p>
        </div>
      )}

      {assessment.description && (
        <Card padding="md">
          <CardContent padding="none">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              {t('assessments.descriptionLabel', 'Instructions')}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
              {assessment.description}
            </p>
          </CardContent>
        </Card>
      )}

      <Card padding="lg">
        <CardContent padding="none">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('assessments.questionsLabel', 'Questions')}
            </h2>
            {canTake && (
              <Badge variant="info" size="sm">
                {interpolate(t('assessments.progressSummary', '{answered} of {total} answered'), {
                  answered: String(answeredCount),
                  total: String(assessment.questions.length),
                })}
              </Badge>
            )}
          </div>

          {assessment.questions.length === 0 ? (
            <EmptyState
              icon={<ListChecks className="h-10 w-10" />}
              title={t('assessments.noQuestionsTitle', 'No questions yet')}
              description={t('assessments.noQuestionsDesc', 'Questions will appear here once the assessment is generated.')}
            />
          ) : (
            <ol className="space-y-4">
              {assessment.questions.map((q, idx) => {
                const score = assessment.scores?.find((s) => s.question_id === q.id);
                const meta = TYPE_META[q.type];
                const Icon = meta?.icon || ListChecks;
                return (
                  <li
                    key={q.id}
                    className="rounded-lg border border-gray-200 dark:border-surface-700 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 text-xs font-bold dark:bg-brand-500/20 dark:text-brand-300">
                        {q.order ?? idx + 1}
                      </span>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="purple" size="sm" icon={<Icon className="h-3 w-3" aria-hidden="true" />}>
                            {t(`assessments.types.${q.type}`, meta?.label || q.type)}
                          </Badge>
                          {q.difficulty && (
                            <Badge variant={DIFFICULTY_VARIANT[q.difficulty] || 'default'} size="sm">
                              {t(`assessments.difficulty.${q.difficulty}`, q.difficulty)}
                            </Badge>
                          )}
                          <Badge variant="outline" size="sm">
                            {t('assessments.points', '{n} pts').replace('{n}', String(q.points))}
                          </Badge>
                          {score && (
                            <Badge
                              variant={
                                score.is_correct === true
                                  ? 'success'
                                  : score.is_correct === false
                                    ? 'danger'
                                    : 'default'
                              }
                              size="sm"
                            >
                              {score.points_earned}/{score.points_possible}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                          {q.prompt}
                        </p>
                        {q.description && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                            {q.description}
                          </p>
                        )}
                        {q.type === 'mcq' && q.options && q.options.length > 0 && (
                          <ul className="space-y-1.5 pt-1">
                            {q.options.map((opt) => (
                              <li
                                key={opt.id}
                                className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                              >
                                <span className="inline-block h-4 w-4 rounded-full border border-gray-300 dark:border-surface-600 mt-0.5 shrink-0" aria-hidden="true" />
                                <span>{opt.label}</span>
                                {isCompleted && opt.is_correct && (
                                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 ml-auto shrink-0" aria-hidden="true" />
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {q.type === 'coding' && q.starter_code && (
                          <pre className="text-xs font-mono bg-gray-900 text-gray-100 rounded p-3 overflow-x-auto">
                            {q.starter_code}
                          </pre>
                        )}
                        {score?.feedback && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-surface-800 rounded p-2.5">
                            <strong className="block text-gray-700 dark:text-gray-200 mb-1">
                              {t('assessments.feedbackLabel', 'Feedback')}
                            </strong>
                            <p className="whitespace-pre-wrap">{score.feedback}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title={t('assessments.deleteTitle', 'Delete assessment?')}
        description={t(
          'assessments.deleteDesc',
          'This will permanently remove the assessment and its questions. This action cannot be undone.'
        )}
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        loading={actionLoading === 'delete'}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  badgeVariant,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  badgeVariant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
}) {
  return (
    <Card padding="md">
      <CardContent padding="none">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          <span className="text-gray-400" aria-hidden="true">{icon}</span>
          <span className="uppercase tracking-wide font-semibold">{label}</span>
        </div>
        {badgeVariant ? (
          <Badge variant={badgeVariant} size="md">
            {value}
          </Badge>
        ) : (
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
