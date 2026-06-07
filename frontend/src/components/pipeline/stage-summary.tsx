'use client';

import { useCallback, useMemo } from 'react';
import {
  ArrowRight,
  TrendingUp,
  Clock,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  APPLICATION_STAGES,
  normalizeApplicationStage,
  type ApplicationItem,
  type ApplicationStage,
  type ApplicationStageDef,
} from './application-card';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';

export interface StageSummaryProps {
  stage: ApplicationStage;
  applications: ApplicationItem[];
  previousStage?: ApplicationStage | null;
  isLoading?: boolean;
  compact?: boolean;
}

function safeAvg(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

function safePct(num: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.max(0, Math.min(100, (num / denom) * 100));
}

export function StageSummary({
  stage,
  applications,
  previousStage = null,
  isLoading = false,
  compact = false,
}: StageSummaryProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fb?: string) => translate(locale, key, fb),
    [locale]
  );

  const stageDef: ApplicationStageDef | undefined = useMemo(
    () => APPLICATION_STAGES.find((s) => s.id === stage),
    [stage]
  );
  const nextStage: ApplicationStageDef | undefined = useMemo(() => {
    if (!stageDef) return undefined;
    const idx = APPLICATION_STAGES.findIndex((s) => s.id === stageDef.id);
    if (idx < 0 || idx >= APPLICATION_STAGES.length - 1) return undefined;
    return APPLICATION_STAGES[idx + 1];
  }, [stageDef]);

  const stageTitle = stageDef ? t(stageDef.titleKey, stageDef.defaultTitle) : stage;
  const nextStageTitle = nextStage ? t(nextStage.titleKey, nextStage.defaultTitle) : '';

  const inStage = useMemo(
    () => applications.filter((a) => normalizeApplicationStage(a.stage) === stage),
    [applications, stage]
  );

  const count = inStage.length;

  const avgDays = useMemo(() => {
    const values: number[] = [];
    for (const a of inStage) {
      if (typeof a.days_in_stage === 'number' && a.days_in_stage >= 0) {
        values.push(a.days_in_stage);
      }
    }
    return safeAvg(values);
  }, [inStage]);

  const totalEntered = useMemo(() => {
    if (!previousStage) return count;
    return applications.filter(
      (a) => normalizeApplicationStage(a.stage) === previousStage
    ).length;
  }, [applications, previousStage, count]);

  const advanced = useMemo(() => {
    if (!previousStage) return 0;
    const source = applications.filter(
      (a) => normalizeApplicationStage(a.stage) === previousStage
    );
    const target = new Set<ApplicationStage>(
      APPLICATION_STAGES
        .slice(APPLICATION_STAGES.findIndex((s) => s.id === previousStage) + 1)
        .map((s) => s.id)
    );
    return source.filter((a) => {
      const cs = normalizeApplicationStage(a.stage);
      return target.has(cs);
    }).length;
  }, [applications, previousStage]);

  const conversionPct = previousStage ? safePct(advanced, totalEntered) : 0;

  const hasData = count > 0 || (previousStage != null && totalEntered > 0);

  const Icon: LucideIcon = Users;

  if (isLoading) {
    return (
      <div
        className={[
          'rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900',
          compact ? 'p-3' : 'p-4',
        ].join(' ')}
        aria-busy="true"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-gray-200 dark:bg-surface-700 animate-pulse" />
          <div className="h-3 w-24 rounded bg-gray-200 dark:bg-surface-700 animate-pulse" />
        </div>
        <div className="mt-2 h-6 w-12 rounded bg-gray-200 dark:bg-surface-700 animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className={[
        'rounded-lg border bg-white dark:bg-surface-900 transition-colors',
        compact ? 'p-3' : 'p-4',
        'border-gray-200 dark:border-surface-700',
        'hover:border-blue-300 dark:hover:border-blue-500/30',
      ].join(' ')}
      aria-label={`${stageTitle} ${t('stageSummary.title', 'Stage summary')}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`h-2.5 w-2.5 rounded-full shrink-0 ${stageDef?.color || 'bg-gray-400'}`}
          aria-hidden="true"
        />
        <h3
          className={[
            'truncate font-semibold text-gray-900 dark:text-gray-100',
            compact ? 'text-xs' : 'text-sm',
          ].join(' ')}
        >
          {stageTitle}
        </h3>
        {nextStage && (
          <ArrowRight
            className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0"
            aria-hidden="true"
          />
        )}
        {nextStage && (
          <span
            className={[
              'truncate text-gray-500 dark:text-gray-400',
              compact ? 'text-[10px]' : 'text-xs',
            ].join(' ')}
          >
            {nextStageTitle}
          </span>
        )}
      </div>

      <div
        className={[
          'flex items-end gap-2',
          compact ? 'mt-2' : 'mt-3',
        ].join(' ')}
      >
        <Icon
          className={[
            'shrink-0 text-gray-400 dark:text-gray-500',
            compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
          ].join(' ')}
          aria-hidden="true"
        />
        <span
          className={[
            'font-bold text-gray-900 dark:text-white',
            compact ? 'text-lg' : 'text-2xl',
          ].join(' ')}
        >
          {hasData ? count : '—'}
        </span>
        <span
          className={[
            'ml-1 text-gray-500 dark:text-gray-400',
            compact ? 'text-[10px]' : 'text-xs',
          ].join(' ')}
        >
          {t('stageSummary.count', 'Candidates')}
        </span>
      </div>

      <dl
        className={[
          'grid gap-2',
          compact ? 'mt-2 grid-cols-1' : 'mt-3 grid-cols-2',
        ].join(' ')}
      >
        <div
          className={[
            'rounded-md bg-gray-50 dark:bg-surface-800',
            compact ? 'p-1.5' : 'p-2',
          ].join(' ')}
        >
          <dt
            className={[
              'inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400',
              compact ? 'text-[9px]' : 'text-[10px]',
            ].join(' ')}
          >
            <Clock
              className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'}
              aria-hidden="true"
            />
            {t('stageSummary.avgTime', 'Avg time')}
          </dt>
          <dd
            className={[
              'font-semibold text-gray-900 dark:text-white',
              compact ? 'text-xs mt-0.5' : 'text-sm mt-1',
            ].join(' ')}
          >
            {hasData && avgDays > 0
              ? interpolate(t('stageSummary.days', '{n}d'), {
                  n: avgDays < 10 ? avgDays.toFixed(1) : String(Math.round(avgDays)),
                })
              : t('stageSummary.noData', '—')}
          </dd>
        </div>
        <div
          className={[
            'rounded-md bg-gray-50 dark:bg-surface-800',
            compact ? 'p-1.5' : 'p-2',
          ].join(' ')}
        >
          <dt
            className={[
              'inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400',
              compact ? 'text-[9px]' : 'text-[10px]',
            ].join(' ')}
          >
            <TrendingUp
              className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'}
              aria-hidden="true"
            />
            {t('stageSummary.conversion', 'Next-stage conversion')}
          </dt>
          <dd
            className={[
              'font-semibold text-gray-900 dark:text-white',
              compact ? 'text-xs mt-0.5' : 'text-sm mt-1',
            ].join(' ')}
          >
            {previousStage
              ? interpolate(t('stageSummary.percent', '{pct}%'), {
                  pct: String(Math.round(conversionPct)),
                })
              : t('stageSummary.noData', '—')}
          </dd>
        </div>
      </dl>
    </div>
  );
}
