'use client';

import { Activity, KanbanSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';

export interface PipelineStage {
  stage: string;
  count: number;
}

const FUNNEL_COLORS = [
  'from-blue-500 to-blue-600',
  'from-indigo-500 to-indigo-600',
  'from-purple-500 to-purple-600',
  'from-amber-500 to-orange-500',
  'from-green-500 to-emerald-600',
];

function FunnelChart({ data }: { data: { stage: string; count: number; color: string }[] }) {
  if (data.length === 0) return null;
  const max = data[0].count || 1;
  return (
    <div className="space-y-2.5">
      {data.map((f, i) => {
        const widthPct = Math.max(8, (f.count / max) * 100);
        return (
          <div key={f.stage} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-gray-700 dark:text-gray-200">{f.stage}</span>
              <span className="text-gray-500 dark:text-gray-400">{f.count}</span>
            </div>
            <div
              className={`h-6 rounded-md bg-gradient-to-r ${f.color} flex items-center px-2.5 text-white text-[10px] font-bold transition-all hover:translate-x-1`}
              style={{ width: `${widthPct}%` }}
              role="progressbar"
              aria-valuenow={f.count}
              aria-valuemin={0}
              aria-valuemax={max}
              aria-label={`${f.stage}: ${f.count} candidates`}
            >
              {i === 0 && f.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface PipelineWidgetProps {
  stages: PipelineStage[];
  loading?: boolean;
}

export function PipelineWidget({ stages, loading = false }: PipelineWidgetProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const funnel = stages.map((s, i) => ({
    stage: s.stage || `Stage ${i + 1}`,
    count: Number(s.count ?? 0),
    color: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
  }));

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.pipelineFunnel', 'Pipeline funnel')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 rounded-md bg-gray-100 dark:bg-surface-800 animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KanbanSquare className="h-4 w-4 text-blue-600 dark:text-brand-400" />
            <CardTitle>{t('dashboard.pipelineFunnel', 'Pipeline funnel')}</CardTitle>
          </div>
          {funnel.length > 0 && (
            <Badge variant="info" size="sm">
              {funnel.length} {t('dashboard.stages', 'stages')}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {funnel.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-10 w-10" />}
            title={t('dashboard.noFunnelData', 'No funnel data')}
            description={t('dashboard.noFunnelDesc', 'Add candidates and start screening to see your funnel.')}
          />
        ) : (
          <FunnelChart data={funnel} />
        )}
      </CardContent>
    </Card>
  );
}
