'use client';

import { useState } from 'react';
import {
  LayoutGrid,
  TrendingUp,
  Activity,
  Users,
  Sparkles,
  Trash2,
  Check,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { cn } from '@/lib/utils';
import type { DashboardTemplate } from './designer';

export interface BuiltinTemplate {
  id: string;
  nameKey: string;
  descKey: string;
  icon: React.ReactNode;
  color: string;
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'executive-overview',
    nameKey: 'dashboardDesigner.builtinTemplates.executiveOverview',
    descKey: 'dashboardDesigner.builtinTemplates.executiveOverviewDesc',
    icon: <LayoutGrid className="h-6 w-6" />,
    color: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'recruiter-performance',
    nameKey: 'dashboardDesigner.builtinTemplates.recruiterPerformance',
    descKey: 'dashboardDesigner.builtinTemplates.recruiterPerformanceDesc',
    icon: <TrendingUp className="h-6 w-6" />,
    color: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'pipeline-health',
    nameKey: 'dashboardDesigner.builtinTemplates.pipelineHealth',
    descKey: 'dashboardDesigner.builtinTemplates.pipelineHealthDesc',
    icon: <Activity className="h-6 w-6" />,
    color: 'from-amber-500 to-orange-600',
  },
  {
    id: 'diversity',
    nameKey: 'dashboardDesigner.builtinTemplates.diversity',
    descKey: 'dashboardDesigner.builtinTemplates.diversityDesc',
    icon: <Users className="h-6 w-6" />,
    color: 'from-purple-500 to-pink-600',
  },
];

interface TemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  userTemplates: DashboardTemplate[];
  onSelectBuiltin: (templateId: string) => void;
  onSelectUser: (template: DashboardTemplate) => void;
  onDeleteUser: (templateId: string) => void;
}

export function TemplateSelector({
  isOpen,
  onClose,
  userTemplates,
  onSelectBuiltin,
  onSelectUser,
  onDeleteUser,
}: TemplateSelectorProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [selectedBuiltin, setSelectedBuiltin] = useState<string | null>(null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('dashboardDesigner.templateSelector.title', 'Choose a Template')}
      description={t(
        'dashboardDesigner.templateSelector.description',
        'Start from a pre-built template or load a saved one',
      )}
      size="xl"
    >
      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-500 dark:text-brand-400" />
            {t('dashboardDesigner.templateSelector.builtinTemplates', 'Built-in Templates')}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BUILTIN_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => setSelectedBuiltin(tmpl.id)}
                className={cn(
                  'relative flex flex-col items-start p-4 rounded-xl border-2 text-left transition group',
                  selectedBuiltin === tmpl.id
                    ? 'border-blue-500 dark:border-brand-400 bg-blue-50/50 dark:bg-brand-500/5'
                    : 'border-gray-200 dark:border-surface-700 hover:border-gray-300 dark:hover:border-surface-600 bg-white dark:bg-surface-900',
                )}
              >
                {selectedBuiltin === tmpl.id && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-4 w-4 text-blue-600 dark:text-brand-400" />
                  </div>
                )}
                <div
                  className={cn(
                    'p-2.5 rounded-lg bg-gradient-to-br text-white mb-3',
                    tmpl.color,
                  )}
                >
                  {tmpl.icon}
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t(tmpl.nameKey, tmpl.id)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t(tmpl.descKey, '')}
                </p>
              </button>
            ))}
          </div>
        </div>

        {userTemplates.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
              {t('dashboardDesigner.templateSelector.savedTemplates', 'Saved Templates')}
            </h4>
            <div className="space-y-2">
              {userTemplates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-surface-700 bg-gray-50 dark:bg-surface-800"
                >
                  <button
                    type="button"
                    onClick={() => onSelectUser(tmpl)}
                    className="flex-1 text-left"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {tmpl.name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {tmpl.widgets.length}{' '}
                      {t('dashboardDesigner.templateSelector.widgets', 'widgets')} &middot;{' '}
                      {new Date(tmpl.createdAt).toLocaleDateString()}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteUser(tmpl.id)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                    title={t('dashboardDesigner.actions.delete', 'Delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-surface-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700 transition"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            disabled={!selectedBuiltin}
            onClick={() => {
              if (selectedBuiltin) {
                onSelectBuiltin(selectedBuiltin);
                onClose();
              }
            }}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 dark:bg-brand-500 text-white hover:bg-blue-700 dark:hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {t('dashboardDesigner.templateSelector.useTemplate', 'Use Template')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
