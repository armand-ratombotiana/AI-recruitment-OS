'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, Clock } from 'lucide-react';
import { Button, Badge } from '@/components';
import type { Locale } from '@/stores/locale-store';
import { translate, formatDate, interpolate } from '@/stores/locale-store';

export interface InterviewCalendarItem {
  id: string;
  scheduled_at: string;
  duration_minutes?: number;
  type: string;
  status?: string;
  candidate_id?: string;
  job_id?: string;
  candidate_name?: string;
  job_title?: string;
  interviewer?: string;
  location?: string | null;
  notes?: string | null;
}

export interface InterviewTypeMeta {
  key: string;
  label: string;
  dotClass: string;
  chipClass: string;
  darkChipClass: string;
  borderClass: string;
}

const DEFAULT_TYPE_META: Record<string, InterviewTypeMeta> = {
  phone: {
    key: 'phone',
    label: 'Phone',
    dotClass: 'bg-blue-500',
    chipClass: 'bg-blue-100 text-blue-700',
    darkChipClass: 'dark:bg-blue-500/20 dark:text-blue-300',
    borderClass: 'border-blue-300 dark:border-blue-500/40',
  },
  video: {
    key: 'video',
    label: 'Video',
    dotClass: 'bg-indigo-500',
    chipClass: 'bg-indigo-100 text-indigo-700',
    darkChipClass: 'dark:bg-indigo-500/20 dark:text-indigo-300',
    borderClass: 'border-indigo-300 dark:border-indigo-500/40',
  },
  technical: {
    key: 'technical',
    label: 'Technical',
    dotClass: 'bg-purple-500',
    chipClass: 'bg-purple-100 text-purple-700',
    darkChipClass: 'dark:bg-purple-500/20 dark:text-purple-300',
    borderClass: 'border-purple-300 dark:border-purple-500/40',
  },
  panel: {
    key: 'panel',
    label: 'Panel',
    dotClass: 'bg-amber-500',
    chipClass: 'bg-amber-100 text-amber-700',
    darkChipClass: 'dark:bg-amber-500/20 dark:text-amber-300',
    borderClass: 'border-amber-300 dark:border-amber-500/40',
  },
  onsite: {
    key: 'onsite',
    label: 'Onsite',
    dotClass: 'bg-green-500',
    chipClass: 'bg-green-100 text-green-700',
    darkChipClass: 'dark:bg-green-500/20 dark:text-green-300',
    borderClass: 'border-green-300 dark:border-green-500/40',
  },
};

const WEEKDAY_KEYS = [
  'days.sun',
  'days.mon',
  'days.tue',
  'days.wed',
  'days.thu',
  'days.fri',
  'days.sat',
] as const;

const MONTH_NAMES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export interface InterviewCalendarProps {
  interviews: InterviewCalendarItem[];
  locale: Locale;
  onSelectInterview?: (interview: InterviewCalendarItem) => void;
  onSelectDay?: (date: Date | null) => void;
  initialMonth?: Date;
  weekStartsOn?: 0 | 1;
  emptyMessage?: string;
  maxItemsPerDay?: number;
}

export function InterviewCalendar({
  interviews,
  locale,
  onSelectInterview,
  onSelectDay,
  initialMonth,
  weekStartsOn = 1,
  emptyMessage,
  maxItemsPerDay = 3,
}: InterviewCalendarProps) {
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    startOfMonth(initialMonth ?? new Date())
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  useEffect(() => {
    if (initialMonth) {
      setCurrentMonth(startOfMonth(initialMonth));
    }
  }, [initialMonth]);

  useEffect(() => {
    onSelectDay?.(selectedDay);
    // We intentionally omit onSelectDay from deps to avoid loops if parent identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  const today = useMemo(() => startOfDay(new Date()), []);

  const { cells, monthLabel } = useMemo(() => {
    const firstOfMonth = startOfMonth(currentMonth);
    const monthStartWeekday = firstOfMonth.getDay();
    const offset = (monthStartWeekday - weekStartsOn + 7) % 7;
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - offset);

    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push({ date: d, inMonth: d.getMonth() === firstOfMonth.getMonth() });
    }

    const monthLabel = interpolate(t('interviews.calendar.monthOf', '{month} {year}'), {
      month: MONTH_NAMES_EN[firstOfMonth.getMonth()],
      year: String(firstOfMonth.getFullYear()),
    });

    return { cells, monthLabel };
  }, [currentMonth, weekStartsOn, t]);

  const weekdays = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const idx = (weekStartsOn + i) % 7;
      out.push(t(WEEKDAY_KEYS[idx], WEEKDAY_KEYS[idx].split('.')[1]));
    }
    return out;
  }, [weekStartsOn, t]);

  const interviewsByDay = useMemo(() => {
    const map = new Map<string, InterviewCalendarItem[]>();
    interviews.forEach((iv) => {
      if (!iv.scheduled_at) return;
      const d = new Date(iv.scheduled_at);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key);
      if (arr) arr.push(iv);
      else map.set(key, [iv]);
    });
    map.forEach((arr) => {
      arr.sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );
    });
    return map;
  }, [interviews]);

  const getMeta = (type: string): InterviewTypeMeta =>
    DEFAULT_TYPE_META[type] ?? {
      key: type,
      label: type,
      dotClass: 'bg-gray-400',
      chipClass: 'bg-gray-100 text-gray-700',
      darkChipClass: 'dark:bg-gray-500/20 dark:text-gray-300',
      borderClass: 'border-gray-300 dark:border-gray-500/40',
    };

  const goPrev = () => setCurrentMonth((m) => addMonths(m, -1));
  const goNext = () => setCurrentMonth((m) => addMonths(m, 1));
  const goToday = () => {
    setCurrentMonth(startOfMonth(new Date()));
    setSelectedDay(startOfDay(new Date()));
  };

  const handleDayClick = (date: Date) => {
    setSelectedDay((cur) => (cur && sameDay(cur, date) ? null : date));
  };

  const selectedDayInterviews = useMemo(() => {
    if (!selectedDay) return [];
    const key = `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`;
    return interviewsByDay.get(key) ?? [];
  }, [selectedDay, interviewsByDay]);

  const monthInterviewsCount = useMemo(() => {
    let n = 0;
    interviewsByDay.forEach((arr, key) => {
      const [yStr, mStr] = key.split('-');
      if (Number(yStr) === currentMonth.getFullYear() && Number(mStr) === currentMonth.getMonth()) {
        n += arr.length;
      }
    });
    return n;
  }, [interviewsByDay, currentMonth]);

  return (
    <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-surface-700">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={goPrev}
            aria-label={t('interviews.calendar.prevMonth', 'Previous month')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday}>
            {t('interviews.calendar.today', 'Today')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={goNext}
            aria-label={t('interviews.calendar.nextMonth', 'Next month')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 ml-1 sm:ml-3">
            {monthLabel}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-500 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {interpolate(t('interviews.calendar.monthCount', '{count} this month'), {
              count: String(monthInterviewsCount),
            })}
          </span>
          <span className="hidden sm:inline" aria-hidden="true">·</span>
          <div className="flex items-center gap-2 flex-wrap">
            {Object.values(DEFAULT_TYPE_META).map((m) => (
              <span key={m.key} className="inline-flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${m.dotClass}`} aria-hidden="true" />
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-surface-700">
        {weekdays.map((d, i) => (
          <div
            key={i}
            className="px-2 py-1.5 text-center text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-surface-700 last:border-r-0"
            role="columnheader"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7" role="grid" aria-label={monthLabel}>
        {cells.map(({ date, inMonth }, i) => {
          const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          const dayList = interviewsByDay.get(key) ?? [];
          const isToday = sameDay(date, today);
          const isSelected = selectedDay ? sameDay(date, selectedDay) : false;
          const visible = dayList.slice(0, maxItemsPerDay);
          const overflow = dayList.length - visible.length;
          return (
            <div
              key={i}
              role="gridcell"
              aria-label={formatDate(date, locale, { weekday: 'long', month: 'long', day: 'numeric' })}
              aria-selected={isSelected}
              className={
                'relative min-h-[88px] sm:min-h-[112px] p-1 sm:p-1.5 border-r border-b border-gray-200 dark:border-surface-700 cursor-pointer transition-colors ' +
                (i % 7 === 6 ? 'border-r-0 ' : '') +
                (inMonth
                  ? isSelected
                    ? 'bg-blue-50 dark:bg-brand-500/15'
                    : isToday
                      ? 'bg-blue-50/40 dark:bg-brand-500/5'
                      : 'bg-white dark:bg-surface-900 hover:bg-gray-50 dark:hover:bg-surface-800'
                  : 'bg-gray-50/60 dark:bg-surface-800/40 text-gray-400 dark:text-gray-500')
              }
              onClick={() => handleDayClick(date)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleDayClick(date);
                }
              }}
              tabIndex={0}
            >
              <div className="flex items-center justify-between">
                <span
                  className={
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ' +
                    (isToday
                      ? 'bg-blue-600 text-white dark:bg-brand-500'
                      : isSelected
                        ? 'text-blue-700 dark:text-brand-300'
                        : inMonth
                          ? 'text-gray-900 dark:text-gray-100'
                          : 'text-gray-400 dark:text-gray-500')
                  }
                >
                  {date.getDate()}
                </span>
                {dayList.length > 0 && (
                  <span
                    className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 tabular-nums"
                    aria-hidden="true"
                  >
                    {dayList.length}
                  </span>
                )}
              </div>
              <ul className="mt-1 space-y-0.5">
                {visible.map((iv) => {
                  const meta = getMeta(iv.type);
                  const time = new Date(iv.scheduled_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <li key={iv.id}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectInterview?.(iv);
                        }}
                        className={
                          'group w-full truncate rounded border-l-2 px-1.5 py-0.5 text-left text-[10px] sm:text-[11px] font-medium ' +
                          meta.chipClass +
                          ' ' +
                          meta.darkChipClass +
                          ' ' +
                          meta.borderClass +
                          ' hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
                        }
                        title={`${time} · ${iv.candidate_name ?? ''}${iv.job_title ? ' · ' + iv.job_title : ''}`}
                      >
                        <span className="mr-1 tabular-nums opacity-80">{time}</span>
                        <span className="truncate">
                          {iv.candidate_name ?? t('interviews.calendar.unnamed', 'Untitled')}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {overflow > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDayClick(date);
                      }}
                      className="w-full rounded px-1.5 py-0.5 text-left text-[10px] sm:text-[11px] font-medium text-blue-700 hover:bg-blue-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
                    >
                      {interpolate(t('interviews.calendar.moreCount', '+{n} more'), {
                        n: String(overflow),
                      })}
                    </button>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-200 dark:border-surface-700 bg-gray-50/60 dark:bg-surface-800/40 px-4 py-3 min-h-[60px]">
        {selectedDay ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {interpolate(t('interviews.calendar.interviewsOn', 'Interviews on {date}'), {
                  date: formatDate(selectedDay, locale, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  }),
                })}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDay(null)}
                aria-label={t('interviews.calendar.clearDay', 'Clear day selection')}
              >
                {t('common.close', 'Close')}
              </Button>
            </div>
            {selectedDayInterviews.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {emptyMessage ?? t('interviews.calendar.noEvents', 'No interviews')}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {selectedDayInterviews.map((iv) => {
                  const meta = getMeta(iv.type);
                  const time = new Date(iv.scheduled_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <li key={iv.id}>
                      <button
                        type="button"
                        onClick={() => onSelectInterview?.(iv)}
                        className={
                          'flex w-full items-start gap-2 rounded-lg border bg-white p-2.5 text-left transition hover:border-blue-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-surface-900 ' +
                          meta.borderClass
                        }
                      >
                        <span
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dotClass}`}
                          aria-hidden="true"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                              {iv.candidate_name ?? t('interviews.calendar.unnamed', 'Untitled')}
                            </p>
                            <Badge variant="default" size="sm">
                              {t(
                                `interviews.types.${iv.type}`,
                                DEFAULT_TYPE_META[iv.type]?.label ?? iv.type
                              )}
                            </Badge>
                            {iv.status && (
                              <Badge
                                variant={
                                  iv.status === 'completed'
                                    ? 'success'
                                    : iv.status === 'in_progress'
                                      ? 'warning'
                                      : iv.status === 'cancelled' || iv.status === 'no_show'
                                        ? 'danger'
                                        : 'info'
                                }
                                size="sm"
                              >
                                {t(`interviews.statuses.${iv.status}`, iv.status.replace('_', ' '))}
                              </Badge>
                            )}
                          </div>
                          {iv.job_title && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {iv.job_title}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {time}
                              {iv.duration_minutes ? ` · ${iv.duration_minutes} min` : ''}
                            </span>
                            {iv.location && (
                              <span className="inline-flex items-center gap-1 truncate">
                                <MapPin className="h-3 w-3" aria-hidden="true" />
                                <span className="truncate">{iv.location}</span>
                              </span>
                            )}
                            {iv.interviewer && (
                              <span className="inline-flex items-center gap-1 truncate">
                                <CalendarIcon className="h-3 w-3" aria-hidden="true" />
                                <span className="truncate">{iv.interviewer}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('interviews.calendar.pickDay', 'Click a day to see scheduled interviews.')}
          </p>
        )}
      </div>
    </div>
  );
}

export default InterviewCalendar;
