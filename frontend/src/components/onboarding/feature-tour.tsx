'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, ArrowRight, ArrowLeft } from 'lucide-react';
import { useLocaleStore, translate, interpolate, type Locale } from '@/stores/locale-store';
import { cn } from '@/lib/utils';

export interface TourStep {
  /** CSS selector of the target element. Use [data-tour="id"] for stable targeting. */
  target: string;
  /** Translation key in the `tour.<page>` namespace (e.g. "candidates.filters.title"). */
  titleKey: string;
  /** Translation key for the description body. */
  descKey: string;
  /** Placement preference of the tooltip relative to the target. */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

export interface TourDefinition {
  /** Stable id used to persist completion, e.g. "candidates". */
  id: string;
  /** Translation key for the intro title (e.g. "tour.candidates.title"). */
  titleKey: string;
  /** Translation key for the intro body (e.g. "tour.candidates.intro"). */
  introKey: string;
  /** Array of steps. */
  steps: TourStep[];
}

interface FeatureTourProps {
  tour: TourDefinition;
  /** Whether the tour should be active/open. */
  run: boolean;
  /** Callback when the tour is closed (skipped or finished). */
  onClose: () => void;
}

const PADDING = 8;
const TOOLTIP_WIDTH = 340;
const TOOLTIP_MIN_HEIGHT = 140;

function getRect(selector: string): DOMRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return el.getBoundingClientRect();
}

export function FeatureTour({ tour, run, onClose }: FeatureTourProps) {
  const locale = useLocaleStore((s) => s.locale) as Locale;
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState<string | null>(null);

  const current = tour.steps[index];
  const total = tour.steps.length;

  const finish = useCallback(
    (skipped: boolean) => {
      try {
        if (!skipped && index >= total - 1) {
          window.localStorage.setItem(`airos_tour_${tour.id}_done`, '1');
        }
        if (skipped) {
          window.localStorage.setItem(`airos_tour_${tour.id}_done`, '1');
        }
      } catch {
        /* noop */
      }
      onClose();
    },
    [index, total, tour.id, onClose]
  );

  useEffect(() => {
    if (!run) {
      setIndex(0);
      setRect(null);
      setMissing(null);
      return;
    }
    setIndex(0);
  }, [run]);

  useEffect(() => {
    if (!run) return;
    if (!current) {
      setRect(null);
      return;
    }
    const r = getRect(current.target);
    if (r) {
      setRect(r);
      setMissing(null);
    } else {
      setRect(null);
      setMissing(current.target);
    }
  }, [run, current, index]);

  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (index < total - 1) {
          e.preventDefault();
          setIndex((i) => i + 1);
        } else {
          e.preventDefault();
          finish(false);
        }
      } else if (e.key === 'ArrowLeft') {
        if (index > 0) {
          e.preventDefault();
          setIndex((i) => i - 1);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, index, total, finish]);

  useEffect(() => {
    if (!run) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [run]);

  if (!run) return null;

  const title = current
    ? translate(locale, current.titleKey, current.titleKey)
    : translate(locale, tour.titleKey, tour.titleKey);
  const desc = current
    ? translate(locale, current.descKey, current.descKey)
    : translate(locale, tour.introKey, tour.introKey);
  const introTitle = translate(locale, tour.titleKey, tour.titleKey);

  const tooltipStyle: React.CSSProperties = rect
    ? computeTooltipStyle(rect)
    : {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={introTitle}
      className="fixed inset-0 z-[100]"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - PADDING}
                y={rect.top - PADDING}
                width={rect.width + PADDING * 2}
                height={rect.height + PADDING * 2}
                rx={8}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.55)"
          mask="url(#tour-mask)"
        />
      </svg>

      {rect && (
        <div
          aria-hidden="true"
          className="absolute pointer-events-none rounded-lg ring-2 ring-blue-500 dark:ring-brand-400 transition-all duration-300"
          style={{
            left: rect.left - PADDING,
            top: rect.top - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
          }}
        />
      )}

      <div
        className={cn(
          'absolute rounded-xl border shadow-2xl p-4 w-[340px] max-w-[calc(100vw-2rem)]',
          'bg-white border-gray-200 text-gray-900',
          'dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100',
          missing ? 'animate-fade-in-scale' : ''
        )}
        style={tooltipStyle}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold tracking-wider uppercase text-blue-600 dark:text-brand-400">
              {interpolate(translate(locale, 'tour.step', 'Step {current} of {total}'), {
                current: String(index + 1),
                total: String(total),
              })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => finish(true)}
            aria-label={translate(locale, 'tour.skip', 'Skip')}
            className="p-1 -m-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-surface-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <h3 className="text-sm font-semibold mb-1">{title}</h3>
        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">{desc}</p>

        {missing && (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
            Target not found: <code className="font-mono">{missing}</code>
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1" aria-hidden="true">
            {tour.steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition',
                  i === index
                    ? 'bg-blue-600 dark:bg-brand-400 w-4'
                    : i < index
                    ? 'bg-blue-300 dark:bg-brand-700'
                    : 'bg-gray-200 dark:bg-surface-600'
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              aria-label={translate(locale, 'tour.prev', 'Back')}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 h-7 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                index === 0
                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-surface-700'
              )}
            >
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              {translate(locale, 'tour.prev', 'Back')}
            </button>
            {index < total - 1 ? (
              <button
                type="button"
                onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                aria-label={translate(locale, 'tour.next', 'Next')}
                className="inline-flex items-center gap-1 rounded-md px-2.5 h-7 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 dark:bg-brand-500 dark:hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {translate(locale, 'tour.next', 'Next')}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => finish(false)}
                className="inline-flex items-center gap-1 rounded-md px-2.5 h-7 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 dark:bg-brand-500 dark:hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {translate(locale, 'tour.finish', 'Finish')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function computeTooltipStyle(rect: DOMRect): React.CSSProperties {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const margin = 16;
  const w = Math.min(TOOLTIP_WIDTH, vw - margin * 2);
  const h = TOOLTIP_MIN_HEIGHT;

  const spaceBelow = vh - rect.bottom;
  const spaceAbove = rect.top;
  const placeBelow = spaceBelow >= h + margin || spaceBelow > spaceAbove;

  let top: number;
  if (placeBelow) {
    top = rect.bottom + PADDING + margin / 2;
  } else {
    top = rect.top - PADDING - h - margin / 2;
  }
  top = Math.max(margin, Math.min(top, vh - h - margin));

  let left = rect.left + rect.width / 2 - w / 2;
  left = Math.max(margin, Math.min(left, vw - w - margin));

  return { left, top, width: w };
}
