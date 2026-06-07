'use client';

import { useMemo } from 'react';
import { LineChart } from '@/components/ui/chart';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UsageDataPoint {
  period: string;
  candidates: number;
  jobs: number;
  api_calls: number;
}

export interface UsageChartProps {
  data: UsageDataPoint[];
  height?: number;
  metric?: 'candidates' | 'jobs' | 'api_calls' | 'all';
  showLegend?: boolean;
  className?: string;
  title?: string;
  emptyMessage?: string;
}

const METRIC_LABELS: Record<'candidates' | 'jobs' | 'api_calls', string> = {
  candidates: 'Candidates',
  jobs: 'Jobs',
  api_calls: 'API calls',
};

const METRIC_COLORS: Record<'candidates' | 'jobs' | 'api_calls', string> = {
  candidates: '#2563eb',
  jobs: '#10b981',
  api_calls: '#8b5cf6',
};

function formatLabel(period: string): string {
  if (!period) return '';
  const d = new Date(period);
  if (isNaN(d.getTime())) return period;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatValue(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

export function UsageChart({
  data,
  height = 220,
  metric = 'all',
  showLegend = true,
  className,
  title,
  emptyMessage = 'No usage data yet',
}: UsageChartProps) {
  const series = useMemo(() => {
    if (metric === 'all' || data.length === 0) {
      return { points: [], first: 0, last: 0, delta: 0, pct: 0, trend: 'flat' as const };
    }
    const m = metric;
    const points = data.map((d) => ({ label: formatLabel(d.period), value: d[m] }));
    const first = data[0]?.[m] ?? 0;
    const last = data[data.length - 1]?.[m] ?? 0;
    const delta = last - first;
    const pct = first > 0 ? (delta / first) * 100 : last > 0 ? 100 : 0;
    let trend: 'up' | 'down' | 'flat' = 'flat';
    if (Math.abs(pct) < 0.5) trend = 'flat';
    else if (delta > 0) trend = 'up';
    else trend = 'down';
    return { points, first, last, delta, pct, trend };
  }, [data, metric]);

  const allSeries = useMemo(() => {
    if (metric !== 'all') return null;
    const keys: Array<'candidates' | 'jobs' | 'api_calls'> = ['candidates', 'jobs', 'api_calls'];
    return keys.map((k) => ({
      key: k,
      label: METRIC_LABELS[k],
      color: METRIC_COLORS[k],
      points: data.map((d) => ({ label: formatLabel(d.period), value: d[k] })),
      total: data.reduce((sum, d) => sum + d[k], 0),
    }));
  }, [data, metric]);

  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-gray-200 dark:border-surface-700 bg-gray-50/50 dark:bg-surface-800/30',
          className
        )}
        style={{ height }}
        role="status"
        aria-label={emptyMessage}
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  if (metric === 'all' && allSeries) {
    return (
      <div className={cn('space-y-3', className)}>
        {title && (
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          </div>
        )}
        <div className="space-y-4">
          {allSeries.map((s) => (
            <div key={s.key}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {s.label}
                  </span>
                </div>
                <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {formatValue(s.total)} total
                </span>
              </div>
              <LineChart
                data={s.points}
                height={Math.max(120, height - 60)}
                color={s.color}
                formatValue={formatValue}
                ariaLabel={`${s.label} over time`}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const TrendIcon = series.trend === 'up' ? TrendingUp : series.trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    series.trend === 'up'
      ? 'text-green-600 dark:text-success-500'
      : series.trend === 'down'
        ? 'text-red-600 dark:text-danger-500'
        : 'text-gray-500 dark:text-gray-400';

  return (
    <div className={cn('space-y-2', className)}>
      {(title || showLegend) && (
        <div className="flex items-center justify-between">
          {title && (
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          )}
          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {formatValue(series.last)}
            </span>
            <span className={cn('inline-flex items-center gap-1 font-medium', trendColor)}>
              <TrendIcon className="h-3 w-3" aria-hidden="true" />
              {Math.abs(series.pct).toFixed(1)}%
            </span>
          </div>
        </div>
      )}
      <LineChart
        data={series.points}
        height={height}
        color={METRIC_COLORS[metric as 'candidates' | 'jobs' | 'api_calls']}
        formatValue={formatValue}
        ariaLabel={title || `${METRIC_LABELS[metric as 'candidates' | 'jobs' | 'api_calls']} over time`}
      />
    </div>
  );
}
