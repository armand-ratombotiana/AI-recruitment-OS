'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Star, Search, Filter } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  ErrorState,
  Breadcrumb,
  InputField,
  SelectField,
} from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import type { ReviewTypes } from '@/services/api/types';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'default' | 'danger' | 'purple'> = {
  draft: 'default',
  in_progress: 'info',
  completed: 'success',
  archived: 'warning',
};

export default function PerformanceReviewsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);

  const [reviews, setReviews] = useState<ReviewTypes.ReviewSummary[]>([]);
  const [cycles, setCycles] = useState<ReviewTypes.ReviewCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cycleFilter, setCycleFilter] = useState<string>('all');
  const [reviewerFilter, setReviewerFilter] = useState<string>('all');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.reviews.list(),
      api.reviews.listCycles(),
    ])
      .then(([reviewRes, cycleRes]) => {
        setReviews(reviewRes.data || []);
        setCycles((cycleRes as any).data || []);
      })
      .catch((err) => {
        setError(err instanceof APIError ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uniqueReviewers = useMemo(() => {
    const map = new Map<string, string>();
    reviews.forEach((r) => map.set(r.reviewer_id, r.reviewer_name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [reviews]);

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (cycleFilter !== 'all' && r.cycle_id !== cycleFilter) return false;
      if (reviewerFilter !== 'all' && r.reviewer_id !== reviewerFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.reviewee_name.toLowerCase().includes(q) ||
          r.reviewer_name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [reviews, statusFilter, cycleFilter, reviewerFilter, search]);

  const statusOptions = [
    { value: 'all', label: t('performanceReviews.allStatuses', 'All statuses') },
    { value: 'draft', label: t('performanceReviews.statuses.draft', 'Draft') },
    { value: 'in_progress', label: t('performanceReviews.statuses.in_progress', 'In Progress') },
    { value: 'completed', label: t('performanceReviews.statuses.completed', 'Completed') },
    { value: 'archived', label: t('performanceReviews.statuses.archived', 'Archived') },
  ];

  const cycleOptions = [
    { value: 'all', label: t('performanceReviews.allCycles', 'All cycles') },
    ...cycles.map((c) => ({ value: c.id, label: c.name })),
  ];

  const reviewerOptions = [
    { value: 'all', label: t('performanceReviews.allReviewers', 'All reviewers') },
    ...uniqueReviewers.map((r) => ({ value: r.id, label: r.name })),
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('performanceReviews.title', 'Performance Reviews')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {reviews.length} {t('performanceReviews.totalReviews', 'total reviews')}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/performance-reviews/questions">
            <Button variant="outline">
              {t('performanceReviews.questions.title', 'Questions')}
            </Button>
          </Link>
          <Link href="/dashboard/performance-reviews/cycles">
            <Button variant="outline">
              {t('performanceReviews.cycles.title', 'Cycles')}
            </Button>
          </Link>
          <Link href="/dashboard/performance-reviews/new">
            <Button variant="primary">
              <Plus className="h-4 w-4 mr-2" />
              {t('performanceReviews.createReview', 'Create review')}
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <InputField
                id="search-reviews"
                type="text"
                placeholder={t('performanceReviews.search', 'Search by reviewee or reviewer…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <SelectField
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={statusOptions}
              className="sm:w-40"
            />
            <SelectField
              id="filter-cycle"
              value={cycleFilter}
              onChange={(e) => setCycleFilter(e.target.value)}
              options={cycleOptions}
              className="sm:w-48"
            />
            <SelectField
              id="filter-reviewer"
              value={reviewerFilter}
              onChange={(e) => setReviewerFilter(e.target.value)}
              options={reviewerOptions}
              className="sm:w-48"
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState
              title={t('performanceReviews.couldntLoad', "Couldn't load reviews")}
              error={error}
              onRetry={load}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Star className="h-12 w-12" />}
              title={
                reviews.length === 0
                  ? t('performanceReviews.noReviewsYet', 'No reviews yet')
                  : t('performanceReviews.noReviewsFound', 'No reviews found')
              }
              description={
                reviews.length === 0
                  ? t('performanceReviews.noReviewsDesc', 'Create your first performance review to get started.')
                  : t('performanceReviews.tryAdjusting', 'Try adjusting your filters.')
              }
              action={
                reviews.length === 0 ? (
                  <Link href="/dashboard/performance-reviews/new">
                    <Button variant="primary">
                      <Plus className="h-4 w-4 mr-2" />
                      {t('performanceReviews.createReview', 'Create review')}
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((review) => (
                <Link
                  key={review.id}
                  href={`/dashboard/performance-reviews/${review.id}`}
                  className="block p-4 rounded-lg border border-gray-200 dark:border-surface-700 hover:border-blue-300 dark:hover:border-brand-500 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {review.reviewee_name}
                        </h3>
                        <Badge variant={STATUS_VARIANT[review.status] || 'default'}>
                          {t(`performanceReviews.statuses.${review.status}`, review.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>{t('performanceReviews.fields.reviewer', 'Reviewer')}: {review.reviewer_name}</span>
                        <span>{t('performanceReviews.fields.cycle', 'Cycle')}: {review.cycle_name}</span>
                      </div>
                    </div>
                    {review.overall_score != null && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('performanceReviews.fields.overallScore', 'Overall Score')}
                        </p>
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {review.overall_score.toFixed(1)}/5
                        </p>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
