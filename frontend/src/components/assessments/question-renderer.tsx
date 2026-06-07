'use client';

import { useId, useState, useEffect, useRef } from 'react';
import { CheckCircle2, Code2, FileText, ListChecks, Type, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InputField } from '@/components';
import { translate, type Locale } from '@/stores/locale-store';
import type { AssessmentTypes } from '@/services/api/types';

export type AssessmentQuestionValue =
  | { kind: 'mcq'; optionId: string | null }
  | { kind: 'short_answer' | 'text'; value: string }
  | { kind: 'coding'; code: string; language: string };

export interface QuestionRendererProps {
  question: AssessmentTypes.AssessmentQuestion;
  value: AssessmentQuestionValue | null;
  onChange: (next: AssessmentQuestionValue) => void;
  disabled?: boolean;
  locale: Locale;
  /** Show which option(s) were correct after submission. */
  revealCorrect?: boolean;
  /** Score from the backend (0..1 if is_correct false) */
  feedback?: { isCorrect?: boolean | null; pointsEarned?: number; feedback?: string | null } | null;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

const TYPE_ICON = {
  mcq: ListChecks,
  short_answer: Type,
  text: FileText,
  coding: Code2,
} as const;

const LANGUAGE_OPTIONS = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'ruby', label: 'Ruby' },
];

function difficultyClass(d?: AssessmentTypes.DifficultyLevel | null): string {
  switch (d) {
    case 'easy':
      return 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300';
    case 'hard':
      return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-surface-800 dark:text-gray-300';
  }
}

function isAnswered(question: AssessmentTypes.AssessmentQuestion, value: AssessmentQuestionValue | null): boolean {
  if (!value) return false;
  switch (question.type) {
    case 'mcq':
      return value.kind === 'mcq' && !!value.optionId;
    case 'short_answer':
    case 'text':
      return (value.kind === 'short_answer' || value.kind === 'text') && value.value.trim().length > 0;
    case 'coding':
      return value.kind === 'coding' && value.code.trim().length > 0;
    default:
      return false;
  }
}

function validateQuestion(
  question: AssessmentTypes.AssessmentQuestion,
  value: AssessmentQuestionValue | null
): string | null {
  const t = (k: string, fb: string) => translate('en' as Locale, k, fb);
  if (question.type === 'mcq') {
    if (!value || value.kind !== 'mcq' || !value.optionId) {
      return t('assessments.validation.chooseOption', 'Please choose an option');
    }
    return null;
  }
  if (question.type === 'short_answer') {
    if (!value || value.kind !== 'short_answer' || !value.value.trim()) {
      return t('assessments.validation.provideAnswer', 'Please provide an answer');
    }
    if (question.max_length && value.value.length > question.max_length) {
      return t(
        'assessments.validation.tooLong',
        'Answer must be at most {max} characters'
      ).replace('{max}', String(question.max_length));
    }
    return null;
  }
  if (question.type === 'text') {
    if (!value || value.kind !== 'text' || !value.value.trim()) {
      return t('assessments.validation.provideAnswer', 'Please provide an answer');
    }
    if (question.max_length && value.value.length > question.max_length) {
      return t(
        'assessments.validation.tooLong',
        'Answer must be at most {max} characters'
      ).replace('{max}', String(question.max_length));
    }
    return null;
  }
  if (question.type === 'coding') {
    if (!value || value.kind !== 'coding' || !value.code.trim()) {
      return t('assessments.validation.writeCode', 'Please write your code');
    }
    if (!value.language.trim()) {
      return t('assessments.validation.pickLanguage', 'Please select a language');
    }
    return null;
  }
  return null;
}

export function validateAnswer(
  question: AssessmentTypes.AssessmentQuestion,
  value: AssessmentQuestionValue | null
): string | null {
  return validateQuestion(question, value);
}

export function QuestionRenderer({
  question,
  value,
  onChange,
  disabled = false,
  locale,
  revealCorrect = false,
  feedback = null,
  autoFocus = false,
}: QuestionRendererProps) {
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const TypeIcon = TYPE_ICON[question.type];
  const questionId = useId();
  const promptId = `${questionId}-prompt`;
  const errorId = `${questionId}-error`;
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const [localError, setLocalError] = useState<string | null>(null);
  const [codeLanguage, setCodeLanguage] = useState<string>(
    value?.kind === 'coding' ? value.language : question.language || 'python'
  );

  useEffect(() => {
    if (autoFocus && question.type !== 'coding' && question.type !== 'text') {
      const el = document.getElementById(`${questionId}-opt-0`);
      (el as HTMLElement | null)?.focus();
    }
    if (autoFocus && (question.type === 'text' || question.type === 'short_answer')) {
      const el = document.getElementById(questionId) as HTMLInputElement | HTMLTextAreaElement | null;
      el?.focus();
    }
  }, [autoFocus, question.type, questionId]);

  useEffect(() => {
    if (value?.kind === 'coding' && value.language) {
      setCodeLanguage(value.language);
    }
  }, [value]);

  const handleMcqChange = (optionId: string) => {
    if (disabled) return;
    onChange({ kind: 'mcq', optionId });
    setLocalError(null);
  };

  const handleTextChange = (next: string) => {
    if (disabled) return;
    onChange({ kind: question.type === 'short_answer' ? 'short_answer' : 'text', value: next });
    setLocalError(null);
  };

  const handleCodeChange = (next: string) => {
    if (disabled) return;
    onChange({ kind: 'coding', code: next, language: codeLanguage });
    setLocalError(null);
  };

  const handleLanguageChange = (lang: string) => {
    if (disabled) return;
    setCodeLanguage(lang);
    onChange({ kind: 'coding', code: value?.kind === 'coding' ? value.code : '', language: lang });
  };

  const isCorrect = feedback?.isCorrect === true;
  const isWrong = feedback?.isCorrect === false;
  const showError = !!localError;
  const answered = isAnswered(question, value);

  return (
    <div
      className="space-y-4"
      data-question-id={question.id}
      data-question-type={question.type}
      aria-labelledby={promptId}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-700 text-xs font-bold dark:bg-brand-500/20 dark:text-brand-300">
            {question.order}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-accent-500/20 dark:text-accent-300">
            <TypeIcon className="h-3 w-3" aria-hidden="true" />
            {t(`assessments.types.${question.type}`, question.type)}
          </span>
          {question.difficulty && (
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                difficultyClass(question.difficulty)
              )}
            >
              {t(`assessments.difficulty.${question.difficulty}`, question.difficulty)}
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-surface-800 dark:text-gray-300">
            {t('assessments.points', '{n} pts').replace('{n}', String(question.points))}
          </span>
        </div>
        {feedback && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
              isCorrect && 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
              isWrong && 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
              !isCorrect && !isWrong && 'bg-gray-100 text-gray-700 dark:bg-surface-800 dark:text-gray-300'
            )}
            aria-live="polite"
          >
            {isCorrect && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
            {isWrong && <X className="h-3 w-3" aria-hidden="true" />}
            {typeof feedback.pointsEarned === 'number'
              ? t('assessments.feedback.earned', '{earned}/{possible}').replace('{earned}', String(feedback.pointsEarned)).replace('{possible}', String(question.points))
              : ''}
          </span>
        )}
      </div>

      <h3 id={promptId} className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
        {question.prompt}
      </h3>
      {question.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
          {question.description}
        </p>
      )}
      {question.tags && question.tags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {question.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-surface-800 dark:text-gray-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {showError && (
        <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {localError}
        </p>
      )}

      {/* MCQ */}
      {question.type === 'mcq' && (
        <div role="radiogroup" aria-labelledby={promptId} className="space-y-2">
          {(question.options ?? []).map((opt, idx) => {
            const selected = value?.kind === 'mcq' && value.optionId === opt.id;
            const isOptionCorrect = revealCorrect && opt.is_correct === true;
            const isOptionWrong = revealCorrect && selected && opt.is_correct !== true;
            return (
              <label
                key={opt.id}
                htmlFor={`${questionId}-opt-${idx}`}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition',
                  'focus-within:ring-2 focus-within:ring-blue-500',
                  selected
                    ? 'border-blue-500 bg-blue-50 dark:bg-brand-500/10 dark:border-brand-400'
                    : 'border-gray-200 dark:border-surface-700 hover:border-gray-300 dark:hover:border-surface-600',
                  isOptionCorrect && 'border-green-500 bg-green-50 dark:bg-green-500/10 dark:border-green-500',
                  isOptionWrong && 'border-red-500 bg-red-50 dark:bg-red-500/10 dark:border-red-500',
                  disabled && 'cursor-not-allowed opacity-60'
                )}
              >
                <input
                  id={`${questionId}-opt-${idx}`}
                  type="radio"
                  name={questionId}
                  value={opt.id}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => handleMcqChange(opt.id)}
                  className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500 dark:bg-surface-800 dark:border-surface-600"
                />
                <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{opt.label}</span>
                {isOptionCorrect && (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" aria-hidden="true" />
                )}
                {revealCorrect && isOptionWrong && (
                  <X className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />
                )}
              </label>
            );
          })}
          {(!question.options || question.options.length === 0) && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              {t('assessments.noOptions', 'No options configured for this question.')}
            </p>
          )}
        </div>
      )}

      {/* Short answer */}
      {question.type === 'short_answer' && (
        <InputField
          id={questionId}
          type="text"
          value={value?.kind === 'short_answer' ? value.value : ''}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={question.placeholder ?? t('assessments.placeholders.short', 'Type your answer…')}
          disabled={disabled}
          maxLength={question.max_length ?? undefined}
          aria-describedby={showError ? errorId : undefined}
          className="w-full"
        />
      )}

      {/* Text / long form */}
      {question.type === 'text' && (
        <div className="space-y-1.5">
          <textarea
            ref={textAreaRef}
            id={questionId}
            value={value?.kind === 'text' ? value.value : ''}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={question.placeholder ?? t('assessments.placeholders.text', 'Write a detailed response…')}
            rows={6}
            disabled={disabled}
            maxLength={question.max_length ?? undefined}
            aria-describedby={showError ? errorId : undefined}
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:bg-surface-800 dark:text-gray-100 dark:border-surface-700"
          />
          {question.max_length && (
            <p className="text-xs text-gray-400 text-right tabular-nums" aria-live="polite">
              {(value?.kind === 'text' ? value.value.length : 0)}/{question.max_length}
            </p>
          )}
        </div>
      )}

      {/* Coding */}
      {question.type === 'coding' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label
              htmlFor={`${questionId}-lang`}
              className="text-xs font-medium text-gray-600 dark:text-gray-400"
            >
              {t('assessments.language', 'Language')}
            </label>
            <select
              id={`${questionId}-lang`}
              value={codeLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              disabled={disabled}
              className="text-xs rounded border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
              aria-label={t('assessments.languageAria', 'Programming language')}
            >
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-gray-300 dark:border-surface-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
            <textarea
              id={questionId}
              value={value?.kind === 'coding' ? value.code : question.starter_code ?? ''}
              onChange={(e) => handleCodeChange(e.target.value)}
              disabled={disabled}
              spellCheck={false}
              aria-label={t('assessments.codeAria', 'Code editor')}
              placeholder={question.starter_code ?? t('assessments.placeholders.code', '// Write your solution here…')}
              className="block w-full font-mono text-xs sm:text-sm bg-gray-900 text-gray-100 p-3 outline-none resize-y min-h-[180px] disabled:opacity-60"
              rows={10}
            />
          </div>
        </div>
      )}

      {feedback?.feedback && (
        <div
          className={cn(
            'p-3 rounded-lg text-sm border',
            isCorrect
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-200'
              : isWrong
                ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-200'
                : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-surface-800 dark:border-surface-700 dark:text-gray-200'
          )}
        >
          {feedback.feedback}
        </div>
      )}

      <span className="sr-only">
        {answered ? t('assessments.answered', 'Answered') : t('assessments.notAnswered', 'Not yet answered')}
      </span>
    </div>
  );
}

export default QuestionRenderer;
