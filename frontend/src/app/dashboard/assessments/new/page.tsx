'use client';

import { useState, useEffect, useMemo, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  User,
  Briefcase,
  Settings,
  ClipboardCheck,
  ListChecks,
  Clock,
  Type,
  Code2,
  FileText,
  AlertCircle,
  Sparkles,
  Send,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Skeleton,
  InputField,
  TextareaField,
  SelectField,
  CheckboxField,
  useToast,
  Breadcrumb,
} from '@/components';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';
import type { AssessmentTypes } from '@/services/api/types';

const QUESTION_TYPE_META: Record<
  AssessmentTypes.QuestionType,
  { icon: typeof ListChecks; label: string; description: string }
> = {
  mcq: {
    icon: ListChecks,
    label: 'Multiple choice',
    description: 'Pick one answer from a list of options.',
  },
  short_answer: {
    icon: Type,
    label: 'Short answer',
    description: 'A one or two sentence response.',
  },
  text: {
    icon: FileText,
    label: 'Long form',
    description: 'A paragraph-length written answer.',
  },
  coding: {
    icon: Code2,
    label: 'Coding',
    description: 'Solve a programming problem in any supported language.',
  },
};

const DIFFICULTY_OPTIONS: AssessmentTypes.DifficultyLevel[] = ['easy', 'medium', 'hard'];

const QUESTION_COUNTS = [3, 5, 8, 10, 15, 20];
const TIME_LIMITS = [10, 15, 20, 30, 45, 60, 90];

interface StepData {
  candidate_id: string;
  job_id: string;
  title: string;
  description: string;
  question_count: number;
  difficulty: AssessmentTypes.DifficultyLevel;
  question_types: AssessmentTypes.QuestionType[];
  time_limit_minutes: number;
  passing_score: number;
}

const INITIAL: StepData = {
  candidate_id: '',
  job_id: '',
  title: '',
  description: '',
  question_count: 5,
  difficulty: 'medium',
  question_types: ['mcq', 'short_answer'],
  time_limit_minutes: 30,
  passing_score: 70,
};

type StepId = 'candidate_job' | 'configure' | 'review';

const STEPS: { id: StepId; titleKey: string; fallback: string }[] = [
  { id: 'candidate_job', titleKey: 'assessments.steps.candidateJob', fallback: 'Candidate & Job' },
  { id: 'configure', titleKey: 'assessments.steps.configure', fallback: 'Configure' },
  { id: 'review', titleKey: 'assessments.steps.review', fallback: 'Review' },
];

export default function NewAssessmentPage() {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<StepData>(INITIAL);
  const [candidates, setCandidates] = useState<Array<{ id: string; label: string; sublabel?: string }>>([]);
  const [jobs, setJobs] = useState<Array<{ id: string; label: string; sublabel?: string }>>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof StepData, string>>>({});
  const { push } = useToast();

  const titleId = useId();
  const descId = useId();
  const candidateId = useId();
  const jobId = useId();
  const questionCountId = useId();
  const timeLimitId = useId();
  const passingScoreId = useId();

  useEffect(() => {
    let mounted = true;
    setLoadingOptions(true);
    Promise.allSettled([api.candidates.list({ page_size: '200' } as any), api.jobs.list({ page_size: '200' } as any)])
      .then((results) => {
        if (!mounted) return;
        const cRes = results[0];
        if (cRes.status === 'fulfilled') {
          const data = (cRes.value as any)?.data || cRes.value;
          setCandidates(
            (Array.isArray(data) ? data : []).map((c: any) => ({
              id: c.id,
              label: c.full_name || c.name || c.email || c.id,
              sublabel: c.email || undefined,
            }))
          );
        }
        const jRes = results[1];
        if (jRes.status === 'fulfilled') {
          const data = (jRes.value as any)?.data || jRes.value;
          setJobs(
            (Array.isArray(data) ? data : []).map((j: any) => ({
              id: j.id,
              label: j.title || j.id,
              sublabel: j.location || j.department || undefined,
            }))
          );
        }
      })
      .catch(() => undefined)
      .finally(() => mounted && setLoadingOptions(false));
    return () => {
      mounted = false;
    };
  }, []);

  const candidate = useMemo(
    () => candidates.find((c) => c.id === data.candidate_id),
    [candidates, data.candidate_id]
  );
  const job = useMemo(() => jobs.find((j) => j.id === data.job_id), [jobs, data.job_id]);

  // Auto-suggest title when both candidate and job are picked
  useEffect(() => {
    if (candidate && job && !data.title) {
      setData((d) => ({
        ...d,
        title: `${candidate.label} – ${job.label} ${t('assessments.assessment', 'Assessment')}`,
      }));
    }
  }, [candidate, job, data.title, t]);

  const validateStep = useCallback(
    (step: StepId): boolean => {
      const next: Partial<Record<keyof StepData, string>> = {};
      if (step === 'candidate_job') {
        if (!data.candidate_id) {
          next.candidate_id = t('assessments.validation.candidateRequired', 'Please choose a candidate');
        }
        if (!data.job_id) {
          next.job_id = t('assessments.validation.jobRequired', 'Please choose a job');
        }
        if (!data.title.trim()) {
          next.title = t('assessments.validation.titleRequired', 'A title is required');
        }
      }
      if (step === 'configure') {
        if (data.question_count < 1) {
          next.question_count = t('assessments.validation.questionCountMin', 'At least 1 question is required');
        }
        if (data.question_types.length === 0) {
          next.question_types = t(
            'assessments.validation.questionTypesRequired',
            'Choose at least one question type'
          ) as any;
        }
        if (data.time_limit_minutes < 1) {
          next.time_limit_minutes = t('assessments.validation.timeLimitMin', 'Time limit must be at least 1 minute');
        }
        if (data.passing_score < 0 || data.passing_score > 100) {
          next.passing_score = t('assessments.validation.passingScoreRange', 'Passing score must be 0–100');
        }
      }
      setErrors(next);
      return Object.keys(next).length === 0;
    },
    [data, t]
  );

  const goNext = () => {
    const step = STEPS[stepIndex].id;
    if (!validateStep(step)) return;
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  };
  const goBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  const toggleQuestionType = (qt: AssessmentTypes.QuestionType) => {
    setData((d) => {
      const has = d.question_types.includes(qt);
      const next = has ? d.question_types.filter((x) => x !== qt) : [...d.question_types, qt];
      // Keep at least one
      return { ...d, question_types: next.length === 0 ? d.question_types : next };
    });
  };

  const handleSubmit = async (andSend: boolean) => {
    if (!validateStep('candidate_job') || !validateStep('configure')) return;
    setSubmitting(true);
    try {
      const created: any = await api.assessments.create({
        title: data.title.trim(),
        candidate_id: data.candidate_id,
        job_id: data.job_id,
        question_count: data.question_count,
        difficulty: data.difficulty,
        question_types: data.question_types,
        time_limit_minutes: data.time_limit_minutes,
        passing_score: data.passing_score,
        description: data.description.trim() || null,
      } as any);
      const id = created?.id || created?.data?.id;
      if (andSend && id) {
        try {
          await api.assessments.send(id);
          push('success', t('assessments.createdAndSent', 'Assessment created and sent'));
        } catch {
          push('warning', t('assessments.createdNotSent', 'Assessment created but failed to send'));
        }
      } else {
        push('success', t('assessments.created', 'Assessment created'));
      }
      if (id) {
        router.push(`/dashboard/assessments/${id}`);
      } else {
        router.push('/dashboard/assessments');
      }
    } catch (err: any) {
      const e = err as APIError;
      push('error', e?.message || t('assessments.createFailed', 'Failed to create assessment'));
    } finally {
      setSubmitting(false);
    }
  };

  const candidateOptions = candidates.map((c) => ({
    value: c.id,
    label: c.sublabel ? `${c.label} · ${c.sublabel}` : c.label,
  }));
  const jobOptions = jobs.map((j) => ({
    value: j.id,
    label: j.sublabel ? `${j.label} · ${j.sublabel}` : j.label,
  }));
  const questionCountOptions = QUESTION_COUNTS.map((n) => ({
    value: String(n),
    label: String(n),
  }));
  const timeLimitOptions = TIME_LIMITS.map((n) => ({
    value: String(n),
    label: t('assessments.minutesShort', '{n} min').replace('{n}', String(n)),
  }));
  const difficultyOptions = DIFFICULTY_OPTIONS.map((d) => ({
    value: d,
    label: t(`assessments.difficulty.${d}`, d),
  }));

  return (
    <div className="space-y-6 max-w-4xl mx-auto"><div>
        <Link
          href="/dashboard/assessments"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('common.back', 'Back')}
        </Link>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
          {t('assessments.newTitle', 'Create new assessment')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('assessments.newSubtitle', 'Send a tailored assessment to evaluate a candidate for a job.')}
        </p>
      </div>

      <Breadcrumb />

      <Stepper stepIndex={stepIndex} locale={locale} t={t} />

      <Card padding="lg">
        <CardContent padding="none">
          {stepIndex === 0 && (
            <StepCandidateJob
              data={data}
              setData={setData}
              errors={errors}
              candidateOptions={candidateOptions}
              jobOptions={jobOptions}
              loadingOptions={loadingOptions}
              titleId={titleId}
              descId={descId}
              candidateId={candidateId}
              jobId={jobId}
              t={t}
            />
          )}
          {stepIndex === 1 && (
            <StepConfigure
              data={data}
              setData={setData}
              errors={errors}
              toggleQuestionType={toggleQuestionType}
              questionCountOptions={questionCountOptions}
              difficultyOptions={difficultyOptions}
              timeLimitOptions={timeLimitOptions}
              questionCountId={questionCountId}
              timeLimitId={timeLimitId}
              passingScoreId={passingScoreId}
              t={t}
            />
          )}
          {stepIndex === 2 && (
            <StepReview data={data} candidate={candidate} job={job} t={t} />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
        <Button
          variant="secondary"
          onClick={goBack}
          disabled={stepIndex === 0 || submitting}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
        >
          {t('common.back', 'Back')}
        </Button>
        <div className="flex flex-col sm:flex-row gap-2 sm:ml-auto">
          {stepIndex < STEPS.length - 1 ? (
            <Button
              variant="primary"
              onClick={goNext}
              disabled={submitting}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              {t('common.next', 'Next')}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => handleSubmit(false)}
                loading={submitting}
                disabled={submitting}
                leftIcon={<ClipboardCheck className="h-4 w-4" />}
              >
                {t('assessments.createDraft', 'Save as draft')}
              </Button>
              <Button
                variant="primary"
                onClick={() => handleSubmit(true)}
                loading={submitting}
                disabled={submitting}
                leftIcon={<Send className="h-4 w-4" />}
              >
                {t('assessments.createAndSend', 'Create & send')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({
  stepIndex,
  locale,
  t,
}: {
  stepIndex: number;
  locale: string;
  t: (k: string, fb?: string) => string;
}) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3 flex-wrap" aria-label="Progress">
      {STEPS.map((s, idx) => {
        const done = idx < stepIndex;
        const active = idx === stepIndex;
        return (
          <li key={s.id} className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <span
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold border-2 transition ${
                  done
                    ? 'bg-green-600 border-green-600 text-white'
                    : active
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-300 text-gray-400 dark:border-surface-600 dark:text-gray-500'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : idx + 1}
              </span>
              <span
                className={`text-sm font-medium truncate ${
                  active
                    ? 'text-gray-900 dark:text-gray-100'
                    : done
                      ? 'text-green-700 dark:text-green-300'
                      : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {t(s.titleKey, s.fallback)}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <span
                className={`hidden sm:block h-0.5 flex-1 ${
                  done ? 'bg-green-500' : 'bg-gray-200 dark:bg-surface-700'
                }`}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepCandidateJob({
  data,
  setData,
  errors,
  candidateOptions,
  jobOptions,
  loadingOptions,
  titleId,
  descId,
  candidateId,
  jobId,
  t,
}: {
  data: StepData;
  setData: (updater: (d: StepData) => StepData) => void;
  errors: Partial<Record<keyof StepData, string>>;
  candidateOptions: Array<{ value: string; label: string; disabled?: boolean }>;
  jobOptions: Array<{ value: string; label: string; disabled?: boolean }>;
  loadingOptions: boolean;
  titleId: string;
  descId: string;
  candidateId: string;
  jobId: string;
  t: (k: string, fb?: string) => string;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <User className="h-5 w-5 text-blue-600 dark:text-brand-400" aria-hidden="true" />
          {t('assessments.step1.title', 'Who is taking the assessment?')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('assessments.step1.description', 'Pick a candidate and the job you want to evaluate them for.')}
        </p>
      </div>

      {loadingOptions ? (
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          <Skeleton height={42} />
          <Skeleton height={42} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField
            id={candidateId}
            label={t('assessments.fields.candidate', 'Candidate')}
            required
            value={data.candidate_id}
            onChange={(e) => setData((d) => ({ ...d, candidate_id: e.target.value }))}
            options={candidateOptions}
            placeholder={t('assessments.placeholders.candidate', 'Select candidate…')}
            error={errors.candidate_id}
          />
          <SelectField
            id={jobId}
            label={t('assessments.fields.job', 'Job')}
            required
            value={data.job_id}
            onChange={(e) => setData((d) => ({ ...d, job_id: e.target.value }))}
            options={jobOptions}
            placeholder={t('assessments.placeholders.job', 'Select job…')}
            error={errors.job_id}
          />
        </div>
      )}

      <InputField
        id={titleId}
        label={t('assessments.fields.title', 'Assessment title')}
        required
        value={data.title}
        onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))}
        placeholder={t('assessments.placeholders.title', 'e.g. Senior Frontend Engineer – Skills check')}
        helpText={t('assessments.fields.titleHelp', 'Auto-filled from candidate and job — feel free to customize.')}
        error={errors.title}
        maxLength={120}
      />

      <TextareaField
        id={descId}
        label={t('assessments.fields.description', 'Description (optional)')}
        value={data.description}
        onChange={(e) => setData((d) => ({ ...d, description: e.target.value }))}
        placeholder={t('assessments.placeholders.description', 'Add context, instructions, or a brief message…')}
        rows={4}
        maxLength={1000}
        helpText={t('assessments.fields.descriptionHelp', 'This appears on the assessment welcome screen.')}
      />
    </div>
  );
}

function StepConfigure({
  data,
  setData,
  errors,
  toggleQuestionType,
  questionCountOptions,
  difficultyOptions,
  timeLimitOptions,
  questionCountId,
  timeLimitId,
  passingScoreId,
  t,
}: {
  data: StepData;
  setData: (updater: (d: StepData) => StepData) => void;
  errors: Partial<Record<keyof StepData, string>>;
  toggleQuestionType: (qt: AssessmentTypes.QuestionType) => void;
  questionCountOptions: Array<{ value: string; label: string; disabled?: boolean }>;
  difficultyOptions: Array<{ value: string; label: string; disabled?: boolean }>;
  timeLimitOptions: Array<{ value: string; label: string; disabled?: boolean }>;
  questionCountId: string;
  timeLimitId: string;
  passingScoreId: string;
  t: (k: string, fb?: string) => string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Settings className="h-5 w-5 text-blue-600 dark:text-brand-400" aria-hidden="true" />
          {t('assessments.step2.title', 'Configure the assessment')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('assessments.step2.description', 'Choose how many questions, the difficulty, and the formats.')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField
          id={questionCountId}
          label={t('assessments.fields.questionCount', 'Number of questions')}
          required
          value={String(data.question_count)}
          onChange={(e) => setData((d) => ({ ...d, question_count: Number(e.target.value) }))}
          options={questionCountOptions}
          error={errors.question_count as string}
          helpText={t('assessments.fields.questionCountHelp', 'AI will pick the best questions for this candidate.')}
        />
        <SelectField
          id="assessments-difficulty"
          label={t('assessments.fields.difficulty', 'Difficulty')}
          required
          value={data.difficulty}
          onChange={(e) => setData((d) => ({ ...d, difficulty: e.target.value as AssessmentTypes.DifficultyLevel }))}
          options={difficultyOptions}
        />
        <SelectField
          id={timeLimitId}
          label={t('assessments.fields.timeLimit', 'Time limit (min)')}
          required
          value={String(data.time_limit_minutes)}
          onChange={(e) => setData((d) => ({ ...d, time_limit_minutes: Number(e.target.value) }))}
          options={timeLimitOptions}
          helpText={t('assessments.fields.timeLimitHelp', 'Candidates can submit before the timer expires.')}
          error={errors.time_limit_minutes as string}
        />
        <div>
          <label
            htmlFor={passingScoreId}
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('assessments.fields.passingScore', 'Passing score (%)')}
            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id={passingScoreId}
            type="number"
            min={0}
            max={100}
            value={data.passing_score}
            onChange={(e) => setData((d) => ({ ...d, passing_score: Number(e.target.value) }))}
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-surface-800 dark:text-gray-100 dark:border-surface-700"
            aria-describedby={`${passingScoreId}-help`}
            aria-invalid={!!errors.passing_score || undefined}
          />
          {errors.passing_score ? (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {errors.passing_score}
            </p>
          ) : (
            <p id={`${passingScoreId}-help`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('assessments.fields.passingScoreHelp', 'Used to label results as Pass/Fail once the test is submitted.')}
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('assessments.fields.questionTypes', 'Question types')}
          <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(Object.keys(QUESTION_TYPE_META) as AssessmentTypes.QuestionType[]).map((qt) => {
            const meta = QUESTION_TYPE_META[qt];
            const Icon = meta.icon;
            const selected = data.question_types.includes(qt);
            return (
              <label
                key={qt}
                htmlFor={`qt-${qt}`}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition focus-within:ring-2 focus-within:ring-blue-500 ${
                  selected
                    ? 'border-blue-500 bg-blue-50 dark:bg-brand-500/10 dark:border-brand-400'
                    : 'border-gray-200 dark:border-surface-700 hover:border-gray-300 dark:hover:border-surface-600'
                }`}
              >
                <input
                  id={`qt-${qt}`}
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleQuestionType(qt)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-surface-800 dark:border-surface-600"
                />
                <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t(`assessments.types.${qt}`, meta.label)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {meta.description}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
        {errors.question_types && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {errors.question_types}
          </p>
        )}
      </div>
    </div>
  );
}

function StepReview({
  data,
  candidate,
  job,
  t,
}: {
  data: StepData;
  candidate: { id: string; label: string; sublabel?: string } | undefined;
  job: { id: string; label: string; sublabel?: string } | undefined;
  t: (k: string, fb?: string) => string;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600 dark:text-brand-400" aria-hidden="true" />
          {t('assessments.step3.title', 'Review and create')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('assessments.step3.description', 'Double-check the details. You can still go back to edit.')}
        </p>
      </div>

      <dl className="divide-y divide-gray-100 dark:divide-surface-700 rounded-lg border border-gray-200 dark:border-surface-700">
        <ReviewRow label={t('assessments.fields.title', 'Assessment title')}>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{data.title || '—'}</span>
        </ReviewRow>
        <ReviewRow label={t('assessments.fields.candidate', 'Candidate')}>
          <span>{candidate?.label || '—'}</span>
          {candidate?.sublabel && (
            <span className="block text-xs text-gray-500 dark:text-gray-400">{candidate.sublabel}</span>
          )}
        </ReviewRow>
        <ReviewRow label={t('assessments.fields.job', 'Job')}>
          <span>{job?.label || '—'}</span>
          {job?.sublabel && (
            <span className="block text-xs text-gray-500 dark:text-gray-400">{job.sublabel}</span>
          )}
        </ReviewRow>
        <ReviewRow label={t('assessments.fields.questionCount', 'Questions')}>
          {interpolate(t('assessments.review.questionsSummary', '{n} questions · {difficulty}'), {
            n: String(data.question_count),
            difficulty: t(`assessments.difficulty.${data.difficulty}`, data.difficulty),
          })}
        </ReviewRow>
        <ReviewRow label={t('assessments.fields.questionTypes', 'Question types')}>
          <div className="flex flex-wrap gap-1.5">
            {data.question_types.map((qt) => (
              <span
                key={qt}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-accent-500/20 dark:text-accent-300"
              >
                {t(`assessments.types.${qt}`, qt)}
              </span>
            ))}
          </div>
        </ReviewRow>
        <ReviewRow label={t('assessments.fields.timeLimit', 'Time limit')}>
          {t('assessments.minutesShort', '{n} min').replace('{n}', String(data.time_limit_minutes))}
        </ReviewRow>
        <ReviewRow label={t('assessments.fields.passingScore', 'Passing score')}>
          {data.passing_score}%
        </ReviewRow>
        {data.description.trim() && (
          <ReviewRow label={t('assessments.fields.description', 'Description')}>
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
              {data.description}
            </p>
          </ReviewRow>
        )}
      </dl>

      <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-brand-500/10 border border-blue-100 dark:border-brand-500/30 rounded-lg p-3">
        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-brand-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          {t(
            'assessments.review.notice',
            'You can save as a draft to edit later, or create and send it to the candidate right away.'
          )}
        </p>
      </div>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 px-4 py-3 text-sm">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="sm:col-span-2 text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}
