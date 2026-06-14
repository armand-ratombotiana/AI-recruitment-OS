'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Send,
  Check,
  PenTool,
  Trash2,
  Clock,
  Target,
  TrendingUp,
  Star,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  ErrorState,
  Breadcrumb,
  useToast,
  ConfirmDialog,
  Timeline,
} from '@/components';
import type { TimelineItem } from '@/components';
import { useLocaleStore, translate, formatDate } from '@/stores/locale-store';
import type { ReviewTypes } from '@/services/api/types';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'default' | 'danger' | 'purple'> = {
  draft: 'default',
  in_progress: 'info',
  completed: 'success',
  archived: 'warning',
};

function ScoreCircle({ score }: { score: number }) {
  const pct = (score / 5) * 100;
  const color = score >= 4 ? 'text-green-500' : score >= 3 ? 'text-amber-500' : 'text-red-500';
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-200 dark:text-surface-700" />
        <circle
          cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeDasharray={`${pct} 100`} strokeLinecap="round"
          className={color}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-xl font-bold ${color}`}>{score.toFixed(1)}</span>
      </div>
    </div>
  );
}

export default function ReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reviewId = params.id as string;
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { push: showToast } = useToast();

  const [review, setReview] = useState<ReviewTypes.Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; desc: string; action: () => void } | null>(null);

  const loadReview = useCallback(() => {
    setLoading(true);
    setError(null);
    api.reviews.get(reviewId)
      .then((data) => setReview(data))
      .catch((err) => setError(err instanceof APIError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [reviewId]);

  useEffect(() => {
    loadReview();
  }, [loadReview]);

  const handleSubmit = async () => {
    if (!review) return;
    setActionLoading(true);
    try {
      await api.reviews.submit(reviewId, {
        answers: review.answers,
        strengths: review.strengths,
        improvements: review.improvements,
        goals: review.goals,
      });
      showToast('success', t('performanceReviews.detail.reviewSubmitted', 'Review submitted'));
      loadReview();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('performanceReviews.detail.submitFailed', 'Failed to submit'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    setActionLoading(true);
    try {
      await api.reviews.update(reviewId, { status: 'completed' });
      showToast('success', t('performanceReviews.detail.reviewCompleted', 'Review completed'));
      loadReview();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('performanceReviews.detail.saveFailed', 'Failed to save'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await api.reviews.delete(reviewId);
      showToast('success', t('common.deleted', 'Deleted'));
      router.push('/dashboard/performance-reviews');
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : String(err));
      setActionLoading(false);
    }
  };

  const timelineItems: TimelineItem[] = [];
  if (review) {
    timelineItems.push({
      id: 'created',
      title: t('performanceReviews.statuses.draft', 'Draft'),
      description: formatDate(review.created_at, locale),
      timestamp: review.created_at,
      icon: <Clock className="h-4 w-4" />,
    });
    if (review.submitted_at) {
      timelineItems.push({
        id: 'submitted',
        title: t('performanceReviews.statuses.in_progress', 'Submitted'),
        description: formatDate(review.submitted_at, locale),
        timestamp: review.submitted_at,
        icon: <Send className="h-4 w-4" />,
      });
    }
    if (review.status === 'completed') {
      timelineItems.push({
        id: 'completed',
        title: t('performanceReviews.statuses.completed', 'Completed'),
        description: formatDate(review.updated_at, locale),
        timestamp: review.updated_at,
        icon: <Check className="h-4 w-4" />,
      });
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <ErrorState
          title={t('performanceReviews.couldntLoad', "Couldn't load review")}
          error={error || 'Not found'}
          onRetry={loadReview}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {review.reviewee_name || t('performanceReviews.detail.reviewDetail', 'Review Detail')}
            </h1>
            <Badge variant={STATUS_VARIANT[review.status] || 'default'}>
              {t(`performanceReviews.statuses.${review.status}`, review.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('performanceReviews.fields.reviewer', 'Reviewer')}: {review.reviewer_name} · {t('performanceReviews.fields.cycle', 'Cycle')}: {review.cycle_name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(review.status === 'draft' || review.status === 'in_progress') && (
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard/performance-reviews/${review.id}`)}
              disabled={actionLoading}
            >
              <PenTool className="h-4 w-4 mr-2" />
              {t('performanceReviews.detail.edit', 'Edit')}
            </Button>
          )}
          {review.status === 'draft' && (
            <Button
              variant="primary"
              onClick={() =>
                setConfirmAction({
                  title: t('performanceReviews.detail.confirmSubmit', 'Submit this review?'),
                  desc: t('performanceReviews.detail.confirmSubmitDesc', 'Once submitted, answers may no longer be editable.'),
                  action: handleSubmit,
                })
              }
              disabled={actionLoading}
            >
              <Send className="h-4 w-4 mr-2" />
              {t('performanceReviews.detail.submit', 'Submit')}
            </Button>
          )}
          {review.status === 'in_progress' && (
            <Button
              variant="primary"
              onClick={() =>
                setConfirmAction({
                  title: t('performanceReviews.detail.confirmComplete', 'Complete this review?'),
                  desc: t('performanceReviews.detail.confirmCompleteDesc', 'This will mark the review as completed.'),
                  action: handleComplete,
                })
              }
              disabled={actionLoading}
            >
              <Check className="h-4 w-4 mr-2" />
              {t('performanceReviews.detail.complete', 'Complete')}
            </Button>
          )}
          {review.status === 'draft' && (
            <Button
              variant="secondary"
              onClick={() =>
                setConfirmAction({
                  title: t('common.delete', 'Delete'),
                  desc: t('offers.confirmDeleteDesc', 'This action cannot be undone.'),
                  action: handleDelete,
                })
              }
              disabled={actionLoading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('common.delete', 'Delete')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {review.overall_score != null && (
            <Card>
              <CardContent className="p-6 text-center">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
                  {t('performanceReviews.fields.overallScore', 'Overall Score')}
                </h2>
                <ScoreCircle score={review.overall_score} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('performanceReviews.detail.answers', 'Answers')}
              </h2>
              {review.answers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('performanceReviews.detail.noAnswers', 'No answers provided yet.')}
                </p>
              ) : (
                <div className="space-y-3">
                  {review.answers.map((a) => (
                    <div key={a.question_id} className="p-3 rounded-lg border border-gray-100 dark:border-surface-700">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {a.question_id}
                        </span>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3.5 w-3.5 ${i < a.score ? 'text-amber-400 fill-current' : 'text-gray-300 dark:text-gray-600'}`}
                            />
                          ))}
                        </div>
                      </div>
                      {a.comment && (
                        <p className="text-sm text-gray-700 dark:text-gray-300">{a.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-6 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  {t('performanceReviews.detail.strengths', 'Strengths')}
                </h3>
                {review.strengths.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('performanceReviews.detail.noStrengths', 'No strengths listed.')}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {review.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
                        {s.text}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-500 rotate-180" />
                  {t('performanceReviews.detail.improvements', 'Areas for Improvement')}
                </h3>
                {review.improvements.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('performanceReviews.detail.noImprovements', 'No improvements listed.')}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {review.improvements.map((imp, i) => (
                      <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        {imp.text}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-6 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-500" />
                {t('performanceReviews.detail.goals', 'Goals')}
              </h3>
              {review.goals.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('performanceReviews.detail.noGoals', 'No goals set.')}
                </p>
              ) : (
                <div className="space-y-2">
                  {review.goals.map((g, i) => (
                    <div key={i} className="p-3 rounded-lg border border-gray-100 dark:border-surface-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{g.title}</p>
                      {g.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{g.description}</p>}
                      {g.target_date && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {t('performanceReviews.targetDate', 'Target date')}: {formatDate(g.target_date, locale)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {t('performanceReviews.detail.statusTimeline', 'Status Timeline')}
              </h3>
              {timelineItems.length > 0 ? (
                <Timeline items={timelineItems} />
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('offers.timeline.empty', 'No events yet.')}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('offers.dates', 'Dates')}
              </h3>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>{t('offers.created', 'Created')}: {formatDate(review.created_at, locale)}</p>
                {review.submitted_at && (
                  <p>{t('performanceReviews.detail.submit', 'Submitted')}: {formatDate(review.submitted_at, locale)}</p>
                )}
                <p>{t('offers.updated', 'Updated')}: {formatDate(review.updated_at, locale)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {confirmAction && (
        <ConfirmDialog
          isOpen={!!confirmAction}
          title={confirmAction.title}
          description={confirmAction.desc}
          confirmLabel={t('common.confirm', 'Confirm')}
          cancelLabel={t('common.cancel', 'Cancel')}
          onConfirm={() => {
            confirmAction.action();
            setConfirmAction(null);
          }}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
