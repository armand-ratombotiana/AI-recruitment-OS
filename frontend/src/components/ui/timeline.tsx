'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'gray' | 'pink';
  meta?: React.ReactNode;
  actor?: string;
}

interface TimelineProps {
  items: TimelineItem[];
  emptyState?: React.ReactNode;
  className?: string;
  groupByDay?: boolean;
  ariaLabel?: string;
}

const colorMap: Record<NonNullable<TimelineItem['color']>, string> = {
  blue: 'bg-blue-100 text-blue-600 ring-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:ring-blue-500/30',
  green: 'bg-green-100 text-green-600 ring-green-200 dark:bg-green-500/20 dark:text-green-400 dark:ring-green-500/30',
  purple: 'bg-purple-100 text-purple-600 ring-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:ring-purple-500/30',
  amber: 'bg-amber-100 text-amber-600 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:ring-amber-500/30',
  red: 'bg-red-100 text-red-600 ring-red-200 dark:bg-red-500/20 dark:text-red-400 dark:ring-red-500/30',
  pink: 'bg-pink-100 text-pink-600 ring-pink-200 dark:bg-pink-500/20 dark:text-pink-400 dark:ring-pink-500/30',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-surface-800 dark:text-gray-300 dark:ring-surface-700',
};

function formatDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const dayDiff = Math.floor(diffMs / 86_400_000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function Timeline({ items, emptyState, className, groupByDay = false, ariaLabel = 'Activity timeline' }: TimelineProps) {
  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const groups: { day: string; items: TimelineItem[] }[] = [];
  if (groupByDay) {
    for (const it of items) {
      const k = dayKey(it.timestamp);
      const g = groups.find((x) => x.day === k);
      if (g) g.items.push(it);
      else groups.push({ day: k, items: [it] });
    }
  } else {
    groups.push({ day: '', items });
  }

  return (
    <ol className={cn('relative', className)} aria-label={ariaLabel} role="list">
      {groups.map((g, gi) => (
        <li key={g.day || gi} className="relative">
          {g.day && (
            <div className="sticky top-0 z-10 -mx-1 mb-2 px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-white/80 dark:bg-surface-900/80 backdrop-blur-sm">
              {formatDay(g.day)}
            </div>
          )}
          <div className="relative space-y-3">
            <div
              className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200 dark:bg-surface-700"
              aria-hidden="true"
            />
            {g.items.map((it) => (
              <div key={it.id} className="relative flex gap-3 items-start group">
                <div
                  className={cn(
                    'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4',
                    colorMap[it.color || 'blue']
                  )}
                  aria-hidden="true"
                >
                  {it.icon}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {it.actor && <span className="font-semibold">{it.actor}</span>} {it.title}
                    </p>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap ml-auto">
                      <time dateTime={it.timestamp}>{formatTime(it.timestamp)}</time>
                    </span>
                  </div>
                  {it.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{it.description}</p>
                  )}
                  {it.meta && <div className="mt-1.5">{it.meta}</div>}
                </div>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function useTimelineUpdates<T extends TimelineItem>(initial: T[], pollMs = 30_000) {
  const [items, setItems] = useState<T[]>(initial);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!pollMs) return;
    timer.current = setInterval(() => setLastUpdate(Date.now()), pollMs);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [pollMs]);

  return { items, setItems, lastUpdate };
}
