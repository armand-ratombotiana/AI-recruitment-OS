'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { TextareaField } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import type { ReviewTypes } from '@/services/api/types';

interface ReviewQuestionProps {
  question: ReviewTypes.ReviewQuestion;
  answer?: ReviewTypes.ReviewAnswer;
  onChange: (answer: ReviewTypes.ReviewAnswer) => void;
  disabled?: boolean;
}

export function ReviewQuestion({ question, answer, onChange, disabled }: ReviewQuestionProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [score, setScore] = useState(answer?.score ?? 3);
  const [comment, setComment] = useState(answer?.comment ?? '');

  const handleScoreChange = (val: number) => {
    setScore(val);
    onChange({ question_id: question.id, score: val, comment });
  };

  const handleCommentChange = (val: string) => {
    setComment(val);
    onChange({ question_id: question.id, score, comment: val });
  };

  return (
    <div className="p-4 rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {question.text}
            {question.required && <span className="text-red-500 ml-1">*</span>}
          </p>
          {question.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{question.description}</p>
          )}
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-400 shrink-0">
          {question.category}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-14">
          {t('performanceReviews.rating', 'Rating')}
        </span>
        <div className="flex items-center gap-1" role="radiogroup" aria-label={`${t('performanceReviews.rating', 'Rating')} ${question.text}`}>
          {[1, 2, 3, 4, 5].map((val) => (
            <button
              key={val}
              type="button"
              role="radio"
              aria-checked={score === val}
              disabled={disabled}
              onClick={() => handleScoreChange(val)}
              className={`p-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                val <= score
                  ? 'text-amber-400'
                  : 'text-gray-300 dark:text-gray-600 hover:text-amber-300'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <Star className="h-5 w-5 fill-current" />
            </button>
          ))}
        </div>
        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 ml-1">{score}/5</span>
      </div>

      <TextareaField
        id={`comment-${question.id}`}
        label={t('performanceReviews.yourResponse', 'Your response')}
        value={comment}
        onChange={(e) => handleCommentChange(e.target.value)}
        rows={2}
        maxLength={1000}
        disabled={disabled}
      />
    </div>
  );
}
