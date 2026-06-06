'use client';

import Link from 'next/link';
import { Activity, Sparkles, ChevronRight, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components';
import { useLocaleStore, translate, formatRelativeTime } from '@/stores/locale-store';

export interface ActivityItem {
  id?: string;
  user?: string;
  actor?: string;
  action?: string;
  target?: string;
  meta?: string;
  created_at?: string;
  color?: string;
}

function colorForAction(action: string): string {
  const a = (action || '').toLowerCase();
  if (a.includes('screen')) return 'from-blue-500 to-blue-600';
  if (a.includes('match')) return 'from-green-500 to-emerald-600';
  if (a.includes('interview') || a.includes('assess')) return 'from-purple-500 to-purple-600';
  if (a.includes('workflow') || a.includes('email')) return 'from-amber-500 to-orange-600';
  if (a.includes('rank')) return 'from-pink-500 to-rose-600';
  return 'from-slate-500 to-slate-600';
}

interface RecentActivityWidgetProps {
  activity: ActivityItem[];
  loading?: boolean;
}

export function RecentActivityWidget({ activity, loading = false }: RecentActivityWidgetProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.recentActivity', 'Recent activity')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-surface-800 animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600 dark:text-brand-400" />
            <CardTitle>{t('dashboard.recentActivity', 'Recent activity')}</CardTitle>
          </div>
          <Link
            href="/dashboard/analytics"
            className="text-xs text-blue-600 hover:text-blue-700 dark:text-brand-400 dark:hover:text-brand-300 font-semibold flex items-center gap-1"
          >
            {t('common.viewAll', 'View all')} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-10 w-10" />}
            title={t('dashboard.noActivity', 'No activity yet')}
            description={t('dashboard.noActivitySubDesc', 'AI actions, screening runs, and workflow events will show up here.')}
          />
        ) : (
          <ul className="space-y-2.5" aria-label={t('dashboard.recentActivityList', 'Recent activity list')}>
            {activity.slice(0, 6).map((a, i) => (
              <li
                key={a.id || i}
                className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-surface-800 transition group"
              >
                <div
                  className={`h-9 w-9 rounded-lg bg-gradient-to-br ${
                    a.color || colorForAction(a.action || '')
                  } flex items-center justify-center shrink-0`}
                >
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    <span className="font-semibold">{a.user || a.actor || 'System'}</span>{' '}
                    <span className="text-gray-500 dark:text-gray-400">{a.action}</span>{' '}
                    <span className="font-semibold">{a.target}</span>
                  </p>
                  {a.meta && <p className="text-xs text-gray-500 dark:text-gray-400">{a.meta}</p>}
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3" />
                  {a.created_at ? formatRelativeTime(a.created_at, locale) : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
