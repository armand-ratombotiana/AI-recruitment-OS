'use client';

import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';

export interface InterviewItem {
  id?: string;
  scheduled_at?: string;
  candidate_name?: string;
  candidate?: { full_name?: string };
  job_title?: string;
  job?: { title?: string };
  type?: string;
}

interface UpcomingInterviewsWidgetProps {
  interviews: InterviewItem[];
  loading?: boolean;
}

function timeFormatter(locale: string) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : locale === 'fr' ? 'fr-FR' : 'es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function UpcomingInterviewsWidget({ interviews, loading = false }: UpcomingInterviewsWidgetProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const fmt = timeFormatter(locale);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.upcoming', 'Upcoming')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-gray-100 dark:bg-surface-800 animate-pulse" />
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
            <Calendar className="h-4 w-4 text-purple-600 dark:text-accent-400" />
            <CardTitle>{t('dashboard.upcoming', 'Upcoming')}</CardTitle>
          </div>
          {interviews.length > 0 && (
            <Badge variant="purple" size="sm">
              {interviews.length} {t('dashboard.events', 'events')}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {interviews.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-10 w-10" />}
            title={t('dashboard.noScheduled', 'Nothing scheduled')}
            description={t('dashboard.noScheduledDesc', 'Your day is clear.')}
            action={
              <Link
                href="/dashboard/interviews?action=schedule"
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-brand-400 font-medium"
              >
                {t('dashboard.scheduleInterview', 'Schedule an interview')}
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2" aria-label={t('dashboard.upcomingList', 'Upcoming interviews')}>
            {interviews.map((e, i) => {
              const dt = e.scheduled_at ? new Date(e.scheduled_at) : null;
              const time = dt && !isNaN(dt.getTime()) ? fmt.format(dt) : '—';
              return (
                <li
                  key={e.id || i}
                  className="flex items-center gap-3 p-3 rounded-lg border-l-4 border-purple-500 bg-purple-50/50 dark:bg-accent-500/10"
                >
                  <span className="text-sm font-mono font-bold text-gray-700 dark:text-gray-200 w-14 shrink-0">
                    {time}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {e.candidate_name || e.candidate?.full_name || 'Candidate'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {e.job_title || e.job?.title || e.type || 'Interview'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
