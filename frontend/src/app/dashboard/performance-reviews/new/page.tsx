'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Send, Plus, Trash2, Target } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Breadcrumb,
  useToast,
  SelectField,
  InputField,
  TextareaField,
} from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { ReviewQuestion } from '@/components/performance-reviews/review-question';
import type { ReviewTypes } from '@/services/api/types';

export default function NewReviewPage() {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const { push: showToast } = useToast();

  const [users, setUsers] = useState<Array<{ id: string; label: string }>>([]);
  const [cycles, setCycles] = useState<ReviewTypes.ReviewCycle[]>([]);
  const [questions, setQuestions] = useState<ReviewTypes.ReviewQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [revieweeId, setRevieweeId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [cycleId, setCycleId] = useState('');

  const [answers, setAnswers] = useState<Record<string, ReviewTypes.ReviewAnswer>>({});
  const [strengths, setStrengths] = useState<ReviewTypes.ReviewStrength[]>([]);
  const [improvements, setImprovements] = useState<ReviewTypes.ReviewImprovement[]>([]);
  const [goals, setGoals] = useState<ReviewTypes.ReviewGoal[]>([]);
  const [newStrength, setNewStrength] = useState('');
  const [newImprovement, setNewImprovement] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalDate, setGoalDate] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.users.list(),
      api.reviews.listCycles(),
    ])
      .then(([userRes, cycleRes]) => {
        if (cancelled) return;
        setUsers(
          ((userRes as any)?.data || []).map((u: any) => ({
            id: u.id,
            label: u.full_name || u.email || 'Unknown',
          }))
        );
        setCycles((cycleRes as any).data || []);
      })
      .catch(() => {
        if (!cancelled) showToast('error', t('performanceReviews.createFailed', 'Failed to load data'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [showToast, t]);

  useEffect(() => {
    if (!cycleId) {
      setQuestions([]);
      return;
    }
    api.reviews.getCycleQuestions(cycleId)
      .then((qs) => setQuestions(qs))
      .catch(() => setQuestions([]));
  }, [cycleId]);

  const handleAnswerChange = (answer: ReviewTypes.ReviewAnswer) => {
    setAnswers((prev) => ({ ...prev, [answer.question_id]: answer }));
  };

  const addStrength = () => {
    if (!newStrength.trim()) return;
    setStrengths([...strengths, { text: newStrength.trim() }]);
    setNewStrength('');
  };

  const addImprovement = () => {
    if (!newImprovement.trim()) return;
    setImprovements([...improvements, { text: newImprovement.trim() }]);
    setNewImprovement('');
  };

  const addGoal = () => {
    if (!goalTitle.trim()) return;
    setGoals([...goals, { title: goalTitle.trim(), description: goalDesc.trim() || null, target_date: goalDate || null }]);
    setGoalTitle('');
    setGoalDesc('');
    setGoalDate('');
  };

  const removeStrength = (idx: number) => setStrengths(strengths.filter((_, i) => i !== idx));
  const removeImprovement = (idx: number) => setImprovements(improvements.filter((_, i) => i !== idx));
  const removeGoal = (idx: number) => setGoals(goals.filter((_, i) => i !== idx));

  const buildPayload = (): ReviewTypes.ReviewSubmitRequest => ({
    answers: Object.values(answers),
    strengths,
    improvements,
    goals,
  });

  const handleSaveDraft = async () => {
    if (!revieweeId || !reviewerId || !cycleId) return;
    setSubmitting(true);
    try {
      const review = await api.reviews.create({ cycle_id: cycleId, reviewee_id: revieweeId, reviewer_id: reviewerId });
      await api.reviews.update(review.id, {
        status: 'draft',
        answers: Object.values(answers),
        strengths,
        improvements,
        goals,
      });
      showToast('success', t('performanceReviews.detail.reviewSaved', 'Review saved'));
      router.push(`/dashboard/performance-reviews/${review.id}`);
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('performanceReviews.saveFailed', 'Failed to save review'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!revieweeId || !reviewerId || !cycleId) return;
    setSubmitting(true);
    try {
      const review = await api.reviews.create({ cycle_id: cycleId, reviewee_id: revieweeId, reviewer_id: reviewerId });
      await api.reviews.submit(review.id, buildPayload());
      showToast('success', t('performanceReviews.detail.reviewSubmitted', 'Review submitted'));
      router.push(`/dashboard/performance-reviews/${review.id}`);
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('performanceReviews.submitFailed', 'Failed to submit review'));
    } finally {
      setSubmitting(false);
    }
  };

  const userOptions = [
    { value: '', label: t('performanceReviews.fields.selectReviewee', 'Select reviewee…') },
    ...users.map((u) => ({ value: u.id, label: u.label })),
  ];

  const reviewerOptions = [
    { value: '', label: t('performanceReviews.fields.selectReviewer', 'Select reviewer…') },
    ...users.map((u) => ({ value: u.id, label: u.label })),
  ];

  const cycleOptions = [
    { value: '', label: t('performanceReviews.fields.selectCycle', 'Select cycle…') },
    ...cycles.map((c) => ({ value: c.id, label: c.name })),
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {t('common.loading', 'Loading…')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('performanceReviews.newReview', 'New review')}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('performanceReviews.newReviewDesc', 'Create a new performance review for an employee.')}
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              id="reviewee"
              label={t('performanceReviews.fields.reviewee', 'Reviewee *')}
              required
              value={revieweeId}
              onChange={(e) => setRevieweeId(e.target.value)}
              options={userOptions}
            />
            <SelectField
              id="reviewer"
              label={t('performanceReviews.fields.reviewer', 'Reviewer *')}
              required
              value={reviewerId}
              onChange={(e) => setReviewerId(e.target.value)}
              options={reviewerOptions}
            />
            <SelectField
              id="cycle"
              label={t('performanceReviews.fields.cycle', 'Cycle *')}
              required
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
              options={cycleOptions}
            />
          </div>

          {questions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('performanceReviews.questions.title', 'Questions')}
              </h2>
              {questions
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((q) => (
                  <ReviewQuestion
                    key={q.id}
                    question={q}
                    answer={answers[q.id]}
                    onChange={handleAnswerChange}
                  />
                ))}
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('performanceReviews.detail.strengths', 'Strengths')}
            </h2>
            {strengths.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{s.text}</span>
                <button type="button" onClick={() => removeStrength(i)} className="text-red-500 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <InputField
                id="new-strength"
                type="text"
                value={newStrength}
                onChange={(e) => setNewStrength(e.target.value)}
                placeholder={t('performanceReviews.addStrength', 'Add strength')}
              />
              <Button variant="outline" onClick={addStrength} disabled={!newStrength.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('performanceReviews.detail.improvements', 'Areas for Improvement')}
            </h2>
            {improvements.map((imp, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{imp.text}</span>
                <button type="button" onClick={() => removeImprovement(i)} className="text-red-500 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <InputField
                id="new-improvement"
                type="text"
                value={newImprovement}
                onChange={(e) => setNewImprovement(e.target.value)}
                placeholder={t('performanceReviews.addImprovement', 'Add improvement')}
              />
              <Button variant="outline" onClick={addImprovement} disabled={!newImprovement.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('performanceReviews.detail.goals', 'Goals')}
            </h2>
            {goals.map((g, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded border border-gray-100 dark:border-surface-700">
                <Target className="h-4 w-4 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{g.title}</p>
                  {g.description && <p className="text-xs text-gray-500 dark:text-gray-400">{g.description}</p>}
                </div>
                <button type="button" onClick={() => removeGoal(i)} className="text-red-500 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <InputField
                id="goal-title"
                type="text"
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                placeholder={t('performanceReviews.goalTitle', 'Goal title')}
              />
              <InputField
                id="goal-desc"
                type="text"
                value={goalDesc}
                onChange={(e) => setGoalDesc(e.target.value)}
                placeholder={t('performanceReviews.goalDescription', 'Goal description')}
              />
              <div className="flex gap-2">
                <InputField
                  id="goal-date"
                  type="date"
                  value={goalDate}
                  onChange={(e) => setGoalDate(e.target.value)}
                  className="flex-1"
                />
                <Button variant="outline" onClick={addGoal} disabled={!goalTitle.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-surface-700">
            <Button
              variant="secondary"
              onClick={() => router.push('/dashboard/performance-reviews')}
              disabled={submitting}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.cancel', 'Cancel')}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                loading={submitting}
                disabled={submitting || !revieweeId || !reviewerId || !cycleId}
              >
                <Save className="h-4 w-4 mr-2" />
                {t('performanceReviews.detail.saveDraft', 'Save draft')}
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={submitting}
                disabled={submitting || !revieweeId || !reviewerId || !cycleId}
              >
                <Send className="h-4 w-4 mr-2" />
                {t('performanceReviews.detail.submit', 'Submit')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
