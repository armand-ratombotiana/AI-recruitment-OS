'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CalendarProps {
  value?: Date;
  defaultValue?: Date;
  onChange?: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  locale?: string;
  className?: string;
  weekStartsOn?: 0 | 1;
}

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function Calendar({
  value: controlled,
  defaultValue,
  onChange,
  minDate,
  maxDate,
  locale = 'en',
  className,
  weekStartsOn = 0,
}: CalendarProps) {
  const [internal, setInternal] = useState<Date | undefined>(defaultValue);
  const isControlled = controlled !== undefined;
  const selected = isControlled ? controlled : internal;

  const initialView = selected ?? new Date();
  const [viewYear, setViewYear] = useState(initialView.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialView.getMonth());

  const months = locale.startsWith('fr') ? MONTHS_EN : MONTHS_EN;
  const days = locale.startsWith('fr') ? DAYS_FR : DAYS_EN;

  const isDisabled = (d: Date) => {
    const day = startOfDay(d).getTime();
    if (minDate && day < startOfDay(minDate).getTime()) return true;
    if (maxDate && day > startOfDay(maxDate).getTime()) return true;
    return false;
  };

  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const dayOfWeek = firstOfMonth.getDay();
    const offset = (dayOfWeek - weekStartsOn + 7) % 7;
    const start = new Date(viewYear, viewMonth, 1 - offset);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [viewYear, viewMonth, weekStartsOn]);

  const today = startOfDay(new Date());

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelect = (d: Date) => {
    if (isDisabled(d)) return;
    if (!isControlled) setInternal(d);
    onChange?.(d);
  };

  const dayLabels = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < 7; i++) arr.push(days[(i + weekStartsOn) % 7]);
    return arr;
  }, [days, weekStartsOn]);

  return (
    <div
      role="group"
      aria-label="Calendar"
      className={cn(
        'w-full max-w-sm rounded-lg border border-gray-200 bg-white p-3 shadow-sm',
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous month"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <h2
          className="text-sm font-semibold text-gray-900"
          aria-live="polite"
        >
          {months[viewMonth]} {viewYear}
        </h2>
        <button
          type="button"
          onClick={goNext}
          aria-label="Next month"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div
        role="grid"
        aria-labelledby="calendar-grid"
        className="grid grid-cols-7 gap-1 text-center text-xs"
      >
        {dayLabels.map((d, i) => (
          <div
            key={`h-${i}`}
            role="columnheader"
            aria-label={d}
            className="py-1 font-medium text-gray-500"
          >
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === viewMonth;
          const isToday = isSameDay(d, today);
          const isSelected = selected ? isSameDay(d, selected) : false;
          const disabled = isDisabled(d);
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-disabled={disabled || undefined}
              aria-current={isToday ? 'date' : undefined}
              disabled={disabled}
              onClick={() => handleSelect(d)}
              className={cn(
                'h-8 w-full rounded-md text-sm transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                !inMonth && 'text-gray-300',
                inMonth && !isSelected && !disabled && 'text-gray-700 hover:bg-gray-100',
                isToday && !isSelected && 'border border-blue-400',
                isSelected && 'bg-blue-600 text-white hover:bg-blue-700',
                disabled && 'cursor-not-allowed opacity-30 hover:bg-transparent'
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
