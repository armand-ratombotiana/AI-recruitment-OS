'use client';

import { useMemo } from 'react';
import { CheckCircle2, XCircle, Lightbulb } from 'lucide-react';

interface ScoreBreakdown {
  label: string;
  value: number;
  color: string;
}

interface MatchResultCardProps {
  title: string;
  subtitle?: string;
  overallScore: number;
  scores?: ScoreBreakdown[];
  matchedSkills?: string[];
  missingSkills?: string[];
  rationale?: string;
  initials?: string;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export function MatchResultCard({
  title,
  subtitle,
  overallScore,
  scores,
  matchedSkills,
  missingSkills,
  rationale,
  initials,
}: MatchResultCardProps) {
  const pct = useMemo(() => {
    if (!Number.isFinite(overallScore)) return 0;
    if (overallScore > 1) return Math.min(100, Math.max(0, Math.round(overallScore)));
    return Math.min(100, Math.max(0, Math.round(overallScore * 100)));
  }, [overallScore]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-surface-700 dark:bg-surface-800">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white"
          aria-hidden="true"
        >
          {initials || title.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900 dark:text-gray-100">{title}</p>
          {subtitle && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-2xl font-bold tabular-nums ${scoreTextColor(pct)}`}>{pct}%</span>
          <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">match</span>
        </div>
      </div>

      <div className="mt-3">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-surface-700"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full transition-all ${scoreColor(pct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {scores && scores.length > 0 && (
        <div className="mt-3 space-y-2">
          {scores.map((s) => {
            const sPct = s.value > 1 ? Math.round(s.value) : Math.round(s.value * 100);
            return (
              <div key={s.label} className="flex items-center gap-2">
                <span className="w-24 truncate text-xs text-gray-500 dark:text-gray-400">{s.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-surface-700">
                  <div
                    className={`h-full ${s.color}`}
                    style={{ width: `${Math.min(100, Math.max(0, sPct))}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300">
                  {sPct}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {matchedSkills && matchedSkills.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Matching skills
          </p>
          <div className="flex flex-wrap gap-1">
            {matchedSkills.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300"
              >
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {missingSkills && missingSkills.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Missing skills
          </p>
          <div className="flex flex-wrap gap-1">
            {missingSkills.slice(0, 5).map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300"
              >
                <XCircle className="h-3 w-3" aria-hidden="true" />
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {rationale && (
        <div className="mt-3 rounded-lg bg-blue-50 p-2.5 dark:bg-brand-500/10">
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-brand-400" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-blue-800 dark:text-brand-200">{rationale}</p>
          </div>
        </div>
      )}
    </div>
  );
}
