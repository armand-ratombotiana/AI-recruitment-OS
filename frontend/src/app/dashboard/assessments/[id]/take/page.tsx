'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Clock,
  CheckCircle2,
  ClipboardList,
  Send,
  Save,
  Loader2,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Skeleton,
  EmptyState,
  ErrorState,
  useToast,
  Breadcrumb,
  Progress,
  ConfirmDialog,
  Badge,
} from '@/components';
import {
  QuestionRenderer,
  validateAnswer,
  type AssessmentQuestionValue,
} from '@/components/assessments/question-renderer';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';
import type { AssessmentTypes } from '@/services/api/types';

const AUTOSAVE_DELAY_MS = 1500;

function valueToAnswer(
  question: AssessmentTypes.AssessmentQuestion,
  value: AssessmentQuestionValue | null
): AssessmentTypes.AssessmentAnswer | null {
  if (!value) return null;
  const base: AssessmentTypes.AssessmentAnswer = { question_id: question.id };
  if (value.kind === 'mcq') {
    base.selected_option_id = value.optionId;
  } else if (value.kind === 'short_answer' || value.kind === 'text') {
    base.text = value.value;
  } else if (value.kind === 'coding') {
    base.code = value.code;
    base.language = value.language;
  }
  return base;
}

export default function TakeAssessmentPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [assessment, setAssessment] = useState<AssessmentTypes.AssessmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AssessmentQuestionValue>>({});
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { push, ToastContainer } = useToast();

  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  // Load assessment and (re)hydrate from any existing answers
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setNotFound(false);
    api.assessments
      .get(params.id)
      .then((data: any) => {
        if (!mounted) return;
        const detail: AssessmentTypes.AssessmentDetail | null = data?.id
          ? data
          : data?.data || null;
        if (!detail || !detail.id) {
          setNotFound(true);
          return;
        }
        setAssessment(detail);
        // Hydrate answers from API response
        if (Array.isArray(detail.answers)) {
          const next: Record<string, AssessmentQuestionValue> = {};
          for (const a of detail.answers) {
            const q = detail.questions.find((qq) => qq.id === a.question_id);
            if (!q) continue;
            if (a.selected_option_id) {
              next[q.id] = { kind: 'mcq', optionId: a.selected_option_id };
            } else if (a.code) {
              next[q.id] = { kind: 'coding', code: a.code, language: a.language || q.language || 'python' };
            } else if (a.text != null) {
              if (q.type === 'short_answer') {
                next[q.id] = { kind: 'short_answer', value: a.text };
              } else {
                next[q.id] = { kind: 'text', value: a.text };
              }
            }
          }
          setAnswers(next);
        }
      })
      .catch((err: any) => {
        if (!mounted) return;
        if (err?.status === 404) {
          setNotFound(true);
        } else {
          setError(err?.message || t('assessments.couldntLoad', "Couldn't load assessment"));
        }
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [params.id, t]);

  // Start the assessment (server-side timer)
  useEffect(() => {
    if (!assessment) return;
    if (assessment.status === 'pending') {
      api.assessments
        .start(assessment.id)
        .then((res: any) => {
          const startTime = res?.started_at ? new Date(res.started_at).getTime() : Date.now();
          setStartedAt(startTime);
          if (res?.expires_at) {
            setExpiresAt(new Date(res.expires_at).getTime());
          } else if (assessment.time_limit_minutes) {
            setExpiresAt(startTime + assessment.time_limit_minutes * 60_000);
          }
        })
        .catch((err: any) => {
          // ignore — maybe already in progress
          const fallbackStart = Date.now();
          setStartedAt(fallbackStart);
          if (assessment.time_limit_minutes) {
            setExpiresAt(fallbackStart + assessment.time_limit_minutes * 60_000);
          }
        });
    } else if (assessment.status === 'in_progress') {
      const fallbackStart = Date.now();
      setStartedAt(fallbackStart);
      if (assessment.time_limit_minutes) {
        setExpiresAt(fallbackStart + assessment.time_limit_minutes * 60_000);
      }
    } else if (assessment.status === 'completed') {
      // Redirect to detail page
      router.replace(`/dashboard/assessments/${assessment.id}`);
    }
  }, [assessment?.id, assessment?.status, assessment?.time_limit_minutes, router, assessment]);

  // Timer tick
  useEffect(() => {
    if (!startedAt) return;
    timerRef.current = setInterval(() => {
      const now = Date.now();
      if (expiresAt && now >= expiresAt) {
        // Auto-submit when time runs out
        handleSubmitRef.current?.(true);
      }
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, expiresAt]);

  const answersRef = useRef(answers);
  answersRef.current = answers;

  const performSave = useCallback(
    async (currentAnswers: Record<string, AssessmentQuestionValue>) => {
      if (!assessment) return;
      const list: AssessmentTypes.AssessmentAnswer[] = [];
      for (const q of assessment.questions) {
        const v = currentAnswers[q.id];
        const a = valueToAnswer(q, v);
        if (a) list.push(a);
      }
      if (list.length === 0) return;
      setSaving(true);
      try {
        await api.assessments.saveAnswers(assessment.id, { answers: list });
        setLastSavedAt(Date.now());
      } catch (err: any) {
        push('error', err?.message || t('assessments.saveFailed', 'Could not save your answer'));
      } finally {
        setSaving(false);
      }
    },
    [assessment, push, t]
  );

  // Debounced auto-save whenever answers change
  useEffect(() => {
    if (!assessment) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      performSave(answersRef.current);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [answers, assessment, performSave]);

  const handleAnswerChange = useCallback((qid: string, value: AssessmentQuestionValue) => {
    setValidationError(null);
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (autoTriggered = false) => {
      if (!assessment) return;
      if (assessment.status === 'completed') return;
      // Validate all questions answered
      const unanswered = assessment.questions.filter(
        (q) => !answersRef.current[q.id] || validateAnswer(q, answersRef.current[q.id])
      );
      if (unanswered.length > 0 && !autoTriggered) {
        const firstUnanswered = assessment.questions.findIndex(
          (q) => !answersRef.current[q.id] || validateAnswer(q, answersRef.current[q.id])
        );
        if (firstUnanswered >= 0) setCurrentIndex(firstUnanswered);
        setValidationError(
          interpolate(
            t(
              'assessments.unansweredNotice',
              'Please answer all questions before submitting. {n} remain.'
            ),
            { n: String(unanswered.length) }
          )
        );
        return;
      }
      setSubmitting(true);
      try {
        const list: AssessmentTypes.AssessmentAnswer[] = [];
        for (const q of assessment.questions) {
          const v = answersRef.current[q.id];
          const a = valueToAnswer(q, v);
          if (a) list.push(a);
        }
        await api.assessments.submit(assessment.id, { answers: list });
        push('success', t('assessments.submitted', 'Assessment submitted!'));
        router.replace(`/dashboard/assessments/${assessment.id}`);
      } catch (err: any) {
        const e = err as APIError;
        push('error', e?.message || t('assessments.submitFailed', 'Could not submit your assessment'));
      } finally {
        setSubmitting(false);
        setConfirmSubmit(false);
      }
    },
    [assessment, push, router, t]
  );

  // Keep a ref to handleSubmit so the timer effect can call it
  const handleSubmitRef = useRef(handleSubmit);
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  // Warn before navigating away
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (assessment?.status === 'in_progress' || assessment?.status === 'pending') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [assessment?.status]);

  const questions = assessment?.questions || [];
  const total = questions.length;
  const currentQuestion = total > 0 ? questions[currentIndex] : null;
  const currentValue = currentQuestion ? answers[currentQuestion.id] || null : null;
  const answeredCount = useMemo(() => {
    if (!assessment) return 0;
    return assessment.questions.filter((q) => {
      const v = answers[q.id];
      return v && !validateAnswer(q, v);
    }).length;
  }, [assessment, answers]);
  const progressPct = total > 0 ? (answeredCount / total) * 100 : 0;
  const isLast = currentIndex === total - 1;
  const isFirst = currentIndex === 0;
  const remainingMs = expiresAt ? Math.max(0, expiresAt - Date.now()) : null;
  const remainingLabel =
    remainingMs == null
      ? null
      : remainingMs <= 60_000
        ? interpolate(t('assessments.timer.underMinute', '< 1 min left'), {})
        : interpolate(t('assessments.timer.minutesLeft', '{n} min left'), {
            n: String(Math.ceil(remainingMs / 60_000)),
          });

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton height={32} width="40%" />
        <Skeleton height={80} />
        <Skeleton height={400} />
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
        onRetry={() => window.location.reload()}
        retryLabel={t('common.retry', 'Retry')}
      />
      </div>
    );
  }

  if (assessment.status === 'completed') {
    return (
      <div className="space-y-4">
        <Breadcrumb />
        <EmptyState
          icon={<CheckCircle2 className="h-12 w-12 text-green-500" />}
          title={t('assessments.alreadyCompletedTitle', 'Already completed')}
          description={t('assessments.alreadyCompletedDesc', 'You have already submitted this assessment.')}
          action={
            <Link href={`/dashboard/assessments/${assessment.id}`}>
              <Button variant="primary">{t('assessments.viewResults', 'View results')}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <ToastContainer />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link
            href={`/dashboard/assessments/${assessment.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t('assessments.backToDetails', 'Back to details')}
          </Link>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
            {assessment.title}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {assessment.time_limit_minutes && expiresAt && (
            <Badge
              variant={remainingMs != null && remainingMs < 5 * 60_000 ? 'danger' : 'info'}
              size="md"
              icon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />}
              aria-live="polite"
            >
              {remainingLabel}
            </Badge>
          )}
          <Badge
            variant={saving ? 'warning' : lastSavedAt ? 'success' : 'default'}
            size="md"
            icon={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {saving
              ? t('assessments.saving', 'Saving…')
              : lastSavedAt
                ? t('assessments.saved', 'Saved')
                : t('assessments.notSaved', 'Not yet saved')}
          </Badge>
        </div>
      </div>

      <Card padding="md">
        <CardContent padding="none">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            <span>
              {interpolate(t('assessments.progress', 'Question {current} of {total}'), {
                current: String(currentIndex + 1),
                total: String(total),
              })}
            </span>
            <span>
              {interpolate(t('assessments.progressPercent', '{n}% complete'), {
                n: String(Math.round(progressPct)),
              })}
            </span>
          </div>
          <Progress value={progressPct} size="md" />
        </CardContent>
      </Card>

      {validationError && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>{validationError}</p>
        </div>
      )}

      {currentQuestion && (
        <Card padding="lg">
          <CardContent padding="none">
            <QuestionRenderer
              key={currentQuestion.id}
              question={currentQuestion}
              value={currentValue}
              onChange={(v) => handleAnswerChange(currentQuestion.id, v)}
              disabled={submitting}
              locale={locale}
              autoFocus
            />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
        <Button
          variant="secondary"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={isFirst || submitting}
          leftIcon={<ChevronLeft className="h-4 w-4" />}
        >
          {t('assessments.previous', 'Previous')}
        </Button>
        <div className="flex flex-wrap items-center justify-center gap-1">
          {questions.map((q, idx) => {
            const v = answers[q.id];
            const valid = v && !validateAnswer(q, v);
            const isCurrent = idx === currentIndex;
            return (
              <button
                key={q.id}
                type="button"
                aria-label={interpolate(t('assessments.goToQuestion', 'Go to question {n}'), { n: String(idx + 1) })}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => setCurrentIndex(idx)}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  isCurrent
                    ? 'bg-blue-600 dark:bg-brand-400 w-6'
                    : valid
                      ? 'bg-green-500 dark:bg-success-500'
                      : 'bg-gray-300 dark:bg-surface-700 hover:bg-gray-400 dark:hover:bg-surface-600'
                }`}
              />
            );
          })}
        </div>
        {isLast ? (
          <Button
            variant="success"
            onClick={() => setConfirmSubmit(true)}
            loading={submitting}
            disabled={submitting}
            leftIcon={<Send className="h-4 w-4" />}
          >
            {t('assessments.submit', 'Submit assessment')}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
            disabled={submitting}
            rightIcon={<ChevronRight className="h-4 w-4" />}
          >
            {t('common.next', 'Next')}
          </Button>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={() => handleSubmit(false)}
        title={t('assessments.confirmSubmitTitle', 'Submit your assessment?')}
        description={
          answeredCount < total
            ? interpolate(
                t('assessments.confirmSubmitUnfinished', '{answered} of {total} answered. Unanswered questions will be marked as 0. Continue?'),
                { answered: String(answeredCount), total: String(total) }
              )
            : t(
                'assessments.confirmSubmitDone',
                'You answered all questions. Ready to submit your final answers?'
              )
        }
        confirmLabel={t('assessments.submitFinal', 'Submit')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="success"
        loading={submitting}
      />
    </div>
  );
}
