'use client';

import {
  FileText,
  Video,
  CheckSquare,
  Calendar,
  ClipboardCheck,
  CheckCircle2,
  Circle,
  Eye,
} from 'lucide-react';
import { Badge, Button } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';

export type WorkflowStepType = 'document' | 'video' | 'task' | 'meeting' | 'assessment';
export type WorkflowStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface WorkflowStep {
  id?: string;
  name: string;
  type: WorkflowStepType;
  description?: string;
  required: boolean;
  order?: number;
  status?: WorkflowStepStatus;
}

const STEP_TYPE_ICON: Record<WorkflowStepType, React.ElementType> = {
  document: FileText,
  video: Video,
  task: CheckSquare,
  meeting: Calendar,
  assessment: ClipboardCheck,
};

const STEP_TYPE_COLOR: Record<WorkflowStepType, string> = {
  document: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/20',
  video: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/20',
  task: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-500/20',
  meeting: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/20',
  assessment: 'text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-500/20',
};

const STATUS_VARIANT: Record<WorkflowStepStatus, 'default' | 'info' | 'success' | 'warning'> = {
  pending: 'default',
  in_progress: 'info',
  completed: 'success',
  skipped: 'warning',
};

interface WorkflowStepCardProps {
  step: WorkflowStep;
  index: number;
  onComplete?: (index: number) => void;
  onViewDetails?: (index: number) => void;
  onRemove?: (index: number) => void;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  editable?: boolean;
  totalSteps?: number;
}

export function WorkflowStepCard({
  step,
  index,
  onComplete,
  onViewDetails,
  onRemove,
  onMoveUp,
  onMoveDown,
  editable = false,
  totalSteps,
}: WorkflowStepCardProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const Icon = STEP_TYPE_ICON[step.type] || FileText;
  const colorClass = STEP_TYPE_COLOR[step.type] || STEP_TYPE_COLOR.document;
  const status = step.status || 'pending';

  return (
    <div className="p-4 rounded-lg border border-gray-200 dark:border-surface-700 hover:border-blue-300 dark:hover:border-brand-500 transition-colors bg-white dark:bg-surface-800">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg shrink-0 ${colorClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
              #{index + 1}
            </span>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {step.name}
            </h4>
            {step.required && (
              <Badge variant="danger">{t('onboarding.workflows.required', 'Required')}</Badge>
            )}
          </div>

          {step.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
              {step.description}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2">
            <Badge variant={STATUS_VARIANT[status]}>
              <span className="flex items-center gap-1">
                {status === 'completed' ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
                {t(`onboarding.stepStatus.${status}`, status)}
              </span>
            </Badge>
            <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">
              {t(`onboarding.stepTypes.${step.type}`, step.type)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onComplete && status !== 'completed' && (
            <Button variant="secondary" size="sm" onClick={() => onComplete(index)}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              {t('onboarding.complete', 'Complete')}
            </Button>
          )}
          {onViewDetails && (
            <Button variant="secondary" size="sm" onClick={() => onViewDetails(index)}>
              <Eye className="h-3.5 w-3.5 mr-1" />
              {t('common.viewDetails', 'View details')}
            </Button>
          )}
          {editable && (
            <>
              {onMoveUp && index > 0 && (
                <Button variant="secondary" size="sm" onClick={() => onMoveUp(index)}>
                  ↑
                </Button>
              )}
              {onMoveDown && totalSteps && index < totalSteps - 1 && (
                <Button variant="secondary" size="sm" onClick={() => onMoveDown(index)}>
                  ↓
                </Button>
              )}
              {onRemove && (
                <Button variant="secondary" size="sm" onClick={() => onRemove(index)}>
                  {t('common.delete', 'Delete')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
