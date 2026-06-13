'use client';

import { useMemo } from 'react';
import { Users, TrendingUp, BarChart3, Star } from 'lucide-react';
import { StatsCard } from '@/components';
import { useLocaleStore, formatNumber } from '@/stores/locale-store';

interface MatchStatsProps {
  totalMatches: number;
  avgScore: number;
  topScore: number;
  topMatches: number;
  scores: number[];
}

function toPct(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score > 1) return Math.min(100, Math.max(0, Math.round(score)));
  return Math.min(100, Math.max(0, Math.round(score * 100)));
}

const BUCKETS = [
  { label: '0-20', min: 0, max: 20 },
  { label: '21-40', min: 21, max: 40 },
  { label: '41-60', min: 41, max: 60 },
  { label: '61-80', min: 61, max: 80 },
  { label: '81-100', min: 81, max: 100 },
];

export function MatchStats({ totalMatches, avgScore, topScore, topMatches, scores }: MatchStatsProps) {
  const locale = useLocaleStore((s) => s.locale);

  const distribution = useMemo(() => {
    const counts = BUCKETS.map((b) => ({ ...b, count: 0 }));
    for (const s of scores) {
      const pct = toPct(s);
      const bucket = counts.find((b) => pct >= b.min && pct <= b.max);
      if (bucket) bucket.count++;
    }
    return counts;
  }, [scores]);

  const maxCount = useMemo(() => Math.max(1, ...distribution.map((d) => d.count)), [distribution]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard
          label="Total matches"
          value={formatNumber(totalMatches, locale)}
          icon={Users}
          tone="info"
        />
        <StatsCard
          label="Avg score"
          value={`${toPct(avgScore)}%`}
          icon={BarChart3}
          tone="purple"
        />
        <StatsCard
          label="Top score"
          value={`${toPct(topScore)}%`}
          icon={TrendingUp}
          tone="success"
        />
        <StatsCard
          label="Top matches (80+)"
          value={formatNumber(topMatches, locale)}
          icon={Star}
          tone="warning"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-800">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Score distribution
        </p>
        <div className="flex items-end gap-2" style={{ height: 80 }}>
          {distribution.map((b) => {
            const h = maxCount > 0 ? Math.max(4, (b.count / maxCount) * 100) : 4;
            return (
              <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-medium tabular-nums text-gray-500 dark:text-gray-400">
                  {b.count}
                </span>
                <div
                  className="w-full rounded-t bg-gradient-to-t from-blue-500 to-indigo-500 transition-all dark:from-brand-500 dark:to-accent-500"
                  style={{ height: `${h}%` }}
                  role="img"
                  aria-label={`${b.label}: ${b.count}`}
                />
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
