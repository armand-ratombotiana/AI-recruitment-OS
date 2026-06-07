'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
  showPercentage?: boolean;
  durationMs?: number;
}

export function ScoreRing({
  score,
  size = 180,
  strokeWidth = 14,
  className,
  label,
  showPercentage = true,
  durationMs = 1200,
}: ScoreRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const target = Math.max(0, Math.min(100, score));
    let raf = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const elapsed = now - start;
      const p = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimatedScore(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score, durationMs]);

  const clamped = Math.max(0, Math.min(100, animatedScore));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

  let ringColor = '#ef4444';
  let textColor = 'text-red-600 dark:text-red-400';
  let labelColor = 'text-red-700 dark:text-red-300';
  let trackColor = '#fee2e2';
  if (clamped > 80) {
    ringColor = '#22c55e';
    textColor = 'text-green-600 dark:text-green-400';
    labelColor = 'text-green-700 dark:text-green-300';
    trackColor = '#dcfce7';
  } else if (clamped >= 60) {
    ringColor = '#f59e0b';
    textColor = 'text-amber-600 dark:text-amber-400';
    labelColor = 'text-amber-700 dark:text-amber-300';
    trackColor = '#fef3c7';
  }

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      role="img"
      aria-label={`Compliance score: ${Math.round(score)}%`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          className="dark:opacity-30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 60ms linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showPercentage && (
          <span
            className={cn(
              'text-4xl font-extrabold tabular-nums leading-none',
              textColor
            )}
          >
            {Math.round(clamped)}
            <span className="text-2xl">%</span>
          </span>
        )}
        {label && (
          <span
            className={cn(
              'mt-1.5 text-xs font-semibold uppercase tracking-wider',
              labelColor
            )}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
