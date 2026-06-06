'use client';

import { Bookmark, BookmarkCheck } from 'lucide-react';
import { useSavedJobs, type SavedJob } from '@/lib/public-job-store';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { cn } from '@/lib/utils';

export type SaveJobInput = Pick<
  SavedJob,
  'id' | 'title' | 'location'
> & Partial<Omit<SavedJob, 'id' | 'title' | 'location' | 'savedAt'>>;

interface SaveJobButtonProps {
  job: SaveJobInput;
  variant?: 'icon' | 'label' | 'pill';
  size?: 'sm' | 'md';
  onSaved?: (saved: boolean) => void;
  className?: string;
  stopPropagation?: boolean;
  showLabel?: boolean;
}

export function SaveJobButton({
  job,
  variant = 'icon',
  size = 'md',
  onSaved,
  className,
  stopPropagation = false,
  showLabel = false,
}: SaveJobButtonProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { isSaved, toggle, hydrated } = useSavedJobs();
  const saved = hydrated && isSaved(job.id);

  const labelSave = t('public.jobs.save.save', 'Save job');
  const labelSaved = t('public.jobs.save.saved', 'Saved');

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    toggle(job);
    onSaved?.(!saved);
  };

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={saved}
        aria-label={saved ? labelSaved : labelSave}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
          saved
            ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700',
          className,
        )}
      >
        {saved ? (
          <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {saved ? labelSaved : labelSave}
      </button>
    );
  }

  if (variant === 'label') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={saved}
        aria-label={saved ? labelSaved : labelSave}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
          size === 'sm' ? 'h-8 px-3 text-xs' : 'h-11 px-5 text-sm',
          saved
            ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700',
          className,
        )}
      >
        {saved ? (
          <BookmarkCheck className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
        ) : (
          <Bookmark className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
        )}
        <span>{saved ? labelSaved : labelSave}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={saved ? labelSaved : labelSave}
      title={saved ? labelSaved : labelSave}
      className={cn(
        'relative z-10 inline-flex items-center justify-center gap-1.5 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        showLabel ? 'px-2.5' : size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        saved
          ? 'border-brand-300 bg-brand-50 text-brand-600 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300'
          : 'border-gray-200 bg-white/90 text-gray-500 hover:border-brand-300 hover:text-brand-600 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-400 dark:hover:border-brand-500/50 dark:hover:text-brand-300',
        className,
      )}
    >
      {saved ? (
        <BookmarkCheck className={size === 'sm' ? 'h-4 w-4' : 'h-4.5 w-4.5'} aria-hidden="true" />
      ) : (
        <Bookmark className={size === 'sm' ? 'h-4 w-4' : 'h-4.5 w-4.5'} aria-hidden="true" />
      )}
      {showLabel && <span className="text-[11px] font-semibold">{saved ? labelSaved : labelSave}</span>}
    </button>
  );
}
