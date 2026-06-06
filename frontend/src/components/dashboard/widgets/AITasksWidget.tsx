'use client';

import { Bot, Zap, Sparkles, ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { AiTypes } from '@/services/api/types';

interface AITasksWidgetProps {
  agents: AiTypes.Agent[];
  loading?: boolean;
}

function statusIcon(enabled: boolean) {
  if (enabled) {
    return <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />;
  }
  return <Circle className="h-4 w-4 text-gray-400" aria-hidden="true" />;
}

function agentIcon(type: string) {
  const t = (type || '').toLowerCase();
  if (t.includes('screen') || t.includes('match') || t.includes('rank')) return Sparkles;
  if (t.includes('workflow') || t.includes('automate')) return Zap;
  return Bot;
}

export function AITasksWidget({ agents, loading = false }: AITasksWidgetProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.aiAgents', 'AI agents')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-surface-800 animate-pulse" />
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
            <Bot className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <CardTitle>{t('dashboard.aiAgents', 'AI agents')}</CardTitle>
          </div>
          <Link
            href="/dashboard/ai-copilot"
            className="text-xs text-blue-600 hover:text-blue-700 dark:text-brand-400 dark:hover:text-brand-300 font-semibold flex items-center gap-1"
          >
            {t('common.viewAll', 'View all')} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {agents.length === 0 ? (
          <EmptyState
            icon={<Bot className="h-10 w-10" />}
            title={t('dashboard.noAgents', 'No AI agents available')}
            description={t('dashboard.noAgentsDesc', 'Agents will appear here once the AI service is connected.')}
          />
        ) : (
          <ul className="space-y-2" aria-label={t('dashboard.aiAgentsList', 'Available AI agents')}>
            {agents.slice(0, 6).map((agent) => {
              const Icon = agentIcon(agent.type);
              return (
                <li
                  key={agent.id}
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-surface-800 transition"
                >
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-white" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {agent.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {agent.description || agent.type}
                    </p>
                  </div>
                  <span className="mt-1" aria-label={agent.enabled ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled')}>
                    {statusIcon(agent.enabled)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
