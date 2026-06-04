'use client';

import { useState, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { FeatureTour, type TourDefinition } from './feature-tour';
import { cn } from '@/lib/utils';

interface HelpButtonProps {
  tour: TourDefinition;
  /** Optional class name for positioning. */
  className?: string;
  /** Storage key to check for completion. Defaults to `airos_tour_{tour.id}_done`. */
  storageKey?: string;
}

export function HelpButton({ tour, className, storageKey }: HelpButtonProps) {
  const [run, setRun] = useState(false);
  const [hasDone, setHasDone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = window.localStorage.getItem(storageKey ?? `airos_tour_${tour.id}_done`);
      setHasDone(v === '1');
    } catch {
      /* noop */
    }
  }, [tour.id, storageKey]);

  return (
    <>
      <button
        type="button"
        onClick={() => setRun(true)}
        aria-label="Show tour"
        title="Show tour"
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900',
          'dark:border-surface-700 dark:bg-surface-800 dark:text-gray-300 dark:hover:bg-surface-700 dark:hover:text-white',
          className
        )}
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
        {hasDone && (
          <span
            aria-hidden="true"
            className="absolute -mt-5 ml-3 h-2 w-2 rounded-full bg-blue-500 dark:bg-brand-400"
          />
        )}
      </button>
      <FeatureTour tour={tour} run={run} onClose={() => setRun(false)} />
    </>
  );
}
