'use client';

import { useCallback } from 'react';
import {
  Pencil,
  Trash2,
  Play,
  FileText,
  Mail,
  FileCheck,
  XCircle,
  Linkedin,
  Briefcase,
} from 'lucide-react';
import { Badge, Button } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import type { ContentType } from './generator-form';

export interface ContentTemplate {
  id: string;
  name: string;
  description: string;
  contentType: ContentType;
  tone: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface TemplateCardProps {
  template: ContentTemplate;
  onUse: (template: ContentTemplate) => void;
  onEdit: (template: ContentTemplate) => void;
  onDelete: (template: ContentTemplate) => void;
}

const TYPE_ICONS: Record<ContentType, typeof FileText> = {
  job_description: Briefcase,
  email: Mail,
  offer_letter: FileCheck,
  rejection: XCircle,
  linkedin_post: Linkedin,
};

const TYPE_COLORS: Record<ContentType, string> = {
  job_description: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  email: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
  offer_letter: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
  rejection: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  linkedin_post: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400',
};

export function TemplateCard({ template, onUse, onEdit, onDelete }: TemplateCardProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);

  const Icon = TYPE_ICONS[template.contentType] || FileText;
  const colorClass = TYPE_COLORS[template.contentType] || 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400';

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-md dark:border-surface-700 dark:bg-surface-800 dark:hover:border-surface-600">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorClass}`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {template.name}
            </h3>
            <Badge variant="default" size="sm">
              {t(`contentGenerator.types.${template.contentType}`, template.contentType.replace(/_/g, ' '))}
            </Badge>
          </div>
        </div>
      </div>

      {template.description && (
        <p className="mb-3 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
          {template.description}
        </p>
      )}

      <div className="mb-3 rounded-lg bg-gray-50 p-2 dark:bg-surface-900">
        <p className="line-clamp-3 text-xs text-gray-600 dark:text-gray-400">
          {template.content}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          {new Date(template.updatedAt).toLocaleDateString()}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Play className="h-3 w-3" />}
            onClick={() => onUse(template)}
          >
            {t('contentGenerator.useTemplate', 'Use')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Pencil className="h-3 w-3" />}
            onClick={() => onEdit(template)}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Trash2 className="h-3 w-3 text-red-500" />}
            onClick={() => onDelete(template)}
          />
        </div>
      </div>
    </div>
  );
}
