'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DateRangePickerProps {
  startDate?: Date | null;
  endDate?: Date | null;
  onChange: (range: { startDate: Date | null; endDate: Date | null }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  align?: 'left' | 'right';
}

const PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  placeholder = 'Select date range',
  className,
  disabled = false,
  minDate,
  maxDate,
  align = 'left',
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(startDate ? new Date(startDate) : new Date());
  const [pendingStart, setPendingStart] = useState<Date | null>(startDate || null);
  const [pendingEnd, setPendingEnd] = useState<Date | null>(endDate || null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setPendingStart(startDate || null);
      setPendingEnd(endDate || null);
    }
  }, [open, startDate, endDate]);

  const handleDayClick = (day: Date) => {
    const d = startOfDay(day);
    if (!pendingStart || (pendingStart && pendingEnd)) {
      setPendingStart(d);
      setPendingEnd(null);
    } else if (pendingStart && !pendingEnd) {
      if (d < pendingStart) {
        setPendingEnd(pendingStart);
        setPendingStart(d);
      } else {
        setPendingEnd(d);
      }
    }
  };

  const applyPreset = (days: number) => {
    const end = startOfDay(new Date());
    const start = days === 0 ? end : new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    onChange({ startDate: start, endDate: end });
    setOpen(false);
  };

  const applyCustom = () => {
    onChange({ startDate: pendingStart, endDate: pendingEnd });
    setOpen(false);
  };

  const clear = () => {
    onChange({ startDate: null, endDate: null });
    setPendingStart(null);
    setPendingEnd(null);
    setOpen(false);
  };

  const renderMonth = (month: Date) => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const days: (Date | null)[] = [];

    for (let i = 0; i < startDayOfWeek; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(month.getFullYear(), month.getMonth(), d));
    }

    const today = startOfDay(new Date());
    const isDisabled = (d: Date) => {
      if (minDate && d < startOfDay(minDate)) return true;
      if (maxDate && d > startOfDay(maxDate)) return true;
      return false;
    };
    const inRange = (d: Date) => {
      if (!pendingStart || !pendingEnd) return false;
      return d >= pendingStart && d <= pendingEnd;
    };
    const isEdge = (d: Date) => {
      return (pendingStart && isSameDay(d, pendingStart)) || (pendingEnd && isSameDay(d, pendingEnd));
    };

    return (
      <div className="flex-1 min-w-0">
        <div className="mb-2 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setViewMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="rounded p-1 text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="text-sm font-semibold text-gray-900">
            {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <button
            type="button"
            onClick={() => setViewMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="rounded p-1 text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <div key={d} className="py-1 font-medium">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            if (!d) return <div key={i} />;
            const disabled = isDisabled(d);
            const inR = inRange(d);
            const edge = isEdge(d);
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => handleDayClick(d)}
                className={cn(
                  'h-8 w-full rounded text-xs transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  disabled && 'text-gray-300 cursor-not-allowed',
                  !disabled && !edge && !inR && 'text-gray-700 hover:bg-gray-100',
                  inR && !edge && 'bg-blue-100 text-blue-900',
                  edge && 'bg-blue-600 text-white font-semibold hover:bg-blue-700',
                  isSameDay(d, today) && !edge && 'font-semibold'
                )}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const display = startDate && endDate
    ? `${formatDate(startDate)} – ${formatDate(endDate)}`
    : startDate
    ? `${formatDate(startDate)} – …`
    : '';

  const nextMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm',
          'hover:border-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open && 'border-blue-500 ring-2 ring-blue-500 ring-offset-2'
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Calendar className="h-4 w-4 text-gray-500" aria-hidden="true" />
        <span className={cn(!display && 'text-gray-400')}>
          {display || placeholder}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select date range"
          className={cn(
            'absolute z-30 mt-2 w-[640px] max-w-[95vw] rounded-xl border border-gray-200 bg-white p-4 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="w-40 shrink-0 border-r border-gray-100 pr-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Presets
              </div>
              <div className="space-y-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p.days)}
                    className="block w-full rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:bg-gray-100"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-1 gap-4">
              {renderMonth(viewMonth)}
              <div className="hidden sm:block">{renderMonth(nextMonth)}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
            <div className="text-xs text-gray-500">
              {pendingStart && (
                <span>
                  {formatDate(pendingStart)}
                  {pendingEnd ? ` → ${formatDate(pendingEnd)}` : ' → …'}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clear}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!pendingStart || !pendingEnd}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
