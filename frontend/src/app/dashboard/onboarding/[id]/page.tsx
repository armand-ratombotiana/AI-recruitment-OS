'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Edit3,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Users,
  ListChecks,
  Play,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  ErrorState,
  Breadcrumb,
  useToast,
  ConfirmDialog,
} from '@/components';
import { useLocaleStore, translate, formatDate } from '@/stores/locale-store';
import { WorkflowStepCard } from '@/components/onboarding/workflow-step-card';
import type { WorkflowStep } from '@/components/onboarding/workflow-step-card';
import type { WorkflowTypes } from '@/services/api/types';

export default function OnboardingWorkflowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { push: showToast } = useToast();

  const [workflow, setWorkflow] = useState<WorkflowTypes.Workflow | null>(null);
  const [executions, setExecutions] = useState<WorkflowTypes.WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    desc: string;
    action: () => void;
  } | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.workflows.get(workflowId),
      api.workflows.listExecutions(workflowId).catch(() => null),
    ])
      .then(([wf, execRes]) => {
        setWorkflow(wf);
        if (execRes) setExecutions(execRes.data || execRes.items || []);
      })
      .catch((err) => setError(err instanceof APIError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [workflowId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleActive = async () => {
    if (!workflow) return;
    setActionLoading(true);
    try {
      if (workflow.active || workflow.is_active) {
        await api.workflows.deactivate(workflowId);
        showToast('success', t('onboarding.workflows.deactivated', 'Workflow deactivated'));
      } else {
        await api.workflows.activate(workflowId);
        showToast('success', t('onboarding.workflows.activated', 'Workflow activated'));
      }
      loadData();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('onboarding.workflows.updateFailed', 'Failed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await api.workflows.delete(workflowId);
      showToast('success', t('onboarding.workflows.deleted', 'Workflow deleted'));
      router.push('/dashboard/onboarding');
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('onboarding.workflows.deleteFailed', 'Failed'));
      setActionLoading(false);
    }
  };

  const workflowSteps: WorkflowStep[] = workflow
    ? (workflow.steps || []).map((s, i) => ({
        name: (s.name as string) || `Step ${i + 1}`,
        type: ((s.type as string) || 'task') as WorkflowStep['type'],
        description: (s.description as string) || '',
        required: (s.required as boolean) ?? true,
        order: (s.order as number) ?? i,
      }))
    : [];

  if (loading) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <ErrorState
          title={t('onboarding.workflows.couldntLoad', "Couldn't load workflow")}
          error={error || t('onboarding.workflows.notFound', 'Workflow not found')}
          onRetry={loadData}
        />
      </div>
    );
  }

  const isActive = workflow.active || workflow.is_active;

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{workflow.name}</h1>
            <Badge variant={isActive ? 'success' : 'default'}>
              {isActive ? t('onboarding.workflows.active', 'Active') : t('onboarding.workflows.inactive', 'Inactive')}
            </Badge>
          </div>
          {workflow.description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{workflow.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => router.push(`/dashboard/onboarding/new`)}>
            <Edit3 className="h-4 w-4 mr-2" />
            {t('common.edit', 'Edit')}
          </Button>
          <Button variant="secondary" onClick={handleToggleActive} loading={actionLoading} disabled={actionLoading}>
            {isActive ? <ToggleRight className="h-4 w-4 mr-1 text-green-500" /> : <ToggleLeft className="h-4 w-4 mr-1" />}
            {isActive ? t('onboarding.workflows.deactivate', 'Deactivate') : t('onboarding.workflows.activate', 'Activate')}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              setConfirmAction({
                title: t('onboarding.workflows.confirmDeleteTitle', 'Delete workflow?'),
                desc: t('onboarding.workflows.confirmDeleteDesc', 'This action cannot be undone.'),
                action: handleDelete,
              })
            }
            disabled={actionLoading}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('common.delete', 'Delete')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-500/20">
              <ListChecks className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{workflowSteps.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('onboarding.workflows.steps', 'Steps')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-500/20">
              <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {workflow.execution_count || workflow.runs || 0}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('onboarding.workflows.candidates', 'Candidates')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-500/20">
              <Play className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{executions.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('onboarding.workflows.executions', 'Executions')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('onboarding.workflows.stepsList', 'Workflow steps')}
              </h2>
              {workflowSteps.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('onboarding.workflows.noSteps', 'No steps defined yet.')}
                </p>
              ) : (
                <div className="space-y-3">
                  {workflowSteps.map((step, i) => (
                    <WorkflowStepCard
                      key={`${step.name}-${i}`}
                      step={step}
                      index={i}
                      onViewDetails={() => {}}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {t('onboarding.workflows.assignedCandidates', 'Assigned candidates')}
              </h3>
              {executions.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('onboarding.workflows.noCandidates', 'No candidates assigned yet.')}
                </p>
              ) : (
                <div className="space-y-2">
                  {executions.slice(0, 10).map((exec) => (
                    <div
                      key={exec.id}
                      className="flex items-center justify-between p-2 rounded-lg border border-gray-100 dark:border-surface-700"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {exec.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(exec.started_at, locale)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          exec.status === 'completed'
                            ? 'success'
                            : exec.status === 'failed'
                            ? 'danger'
                            : exec.status === 'running'
                            ? 'info'
                            : 'default'
                        }
                      >
                        {exec.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('onboarding.workflows.details', 'Details')}
              </h3>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>
                  {t('onboarding.workflows.createdAt', 'Created')}: {formatDate(workflow.created_at, locale)}
                </p>
                {workflow.updated_at && (
                  <p>
                    {t('onboarding.workflows.updatedAt', 'Updated')}: {formatDate(workflow.updated_at, locale)}
                  </p>
                )}
                {workflow.last_run && (
                  <p>
                    {t('onboarding.workflows.lastRun', 'Last run')}: {formatDate(workflow.last_run, locale)}
                  </p>
                )}
                <p>
                  {t('onboarding.workflows.trigger', 'Trigger')}: {workflow.trigger}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {confirmAction && (
        <ConfirmDialog
          isOpen={!!confirmAction}
          title={confirmAction.title}
          description={confirmAction.desc}
          confirmLabel={t('common.confirm', 'Confirm')}
          cancelLabel={t('common.cancel', 'Cancel')}
          onConfirm={() => {
            confirmAction.action();
            setConfirmAction(null);
          }}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
