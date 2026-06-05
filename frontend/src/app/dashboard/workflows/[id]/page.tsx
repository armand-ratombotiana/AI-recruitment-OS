'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Workflow as WorkflowIcon,
  Mail,
  CheckSquare,
  GitBranch,
  Zap,
  Bell,
  FileText,
  Clock,
  TrendingUp,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Pause,
  Edit3,
  Trash2,
  Copy,
  Calendar,
  AlertCircle,
  Hourglass,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  ErrorState,
  Breadcrumb,
  ConfirmDialog,
  useToast,
} from '@/components';
import { useLocaleStore, translate, formatDate, formatRelativeTime, formatNumber } from '@/stores/locale-store';

type StepType = 'trigger' | 'condition' | 'action' | 'notification';

interface WorkflowStep {
  id: string;
  type: StepType | string;
  label: string;
  icon: typeof Mail;
  color: string;
}

interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  trigger?: string;
  steps: Array<Record<string, unknown>>;
  active: boolean;
  is_active?: boolean;
  runs?: number;
  execution_count?: number;
  last_run?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

interface Execution {
  id: string;
  workflow_id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | string;
  started_at: string;
  completed_at?: string | null;
  error?: string | null;
  context?: Record<string, unknown>;
  duration_ms?: number | null;
}

const STEP_TYPE_META: Record<string, { variant: 'info' | 'warning' | 'purple' | 'success'; label: string; icon: typeof Mail; gradient: string }> = {
  trigger: { variant: 'info', label: 'Trigger', icon: Mail, gradient: 'from-blue-500 to-indigo-500' },
  condition: { variant: 'warning', label: 'Condition', icon: GitBranch, gradient: 'from-amber-500 to-orange-500' },
  action: { variant: 'purple', label: 'Action', icon: Zap, gradient: 'from-purple-500 to-pink-500' },
  notification: { variant: 'success', label: 'Notify', icon: Bell, gradient: 'from-green-500 to-emerald-500' },
};

const STEP_GRADIENTS = [
  'from-blue-500 to-indigo-500',
  'from-amber-500 to-orange-500',
  'from-purple-500 to-pink-500',
  'from-green-500 to-emerald-500',
  'from-rose-500 to-red-500',
  'from-cyan-500 to-teal-500',
];

const EXECUTION_STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'default' | 'danger'> = {
  pending: 'default',
  running: 'info',
  completed: 'success',
  failed: 'danger',
  success: 'success',
  error: 'danger',
};

function mapStep(s: Record<string, unknown>, index: number): WorkflowStep {
  const type = (s.type as string) || 'action';
  const meta = STEP_TYPE_META[type] || STEP_TYPE_META.action;
  return {
    id: (s.id as string) || `s-${index}`,
    type,
    label: (s.label as string) || (s.name as string) || type || `Step ${index + 1}`,
    icon: meta.icon,
    color: STEP_GRADIENTS[index % STEP_GRADIENTS.length],
  };
}

function formatDuration(ms: number | null | undefined, locale: 'en' | 'fr' | 'es'): string {
  if (ms == null || isNaN(ms)) return '—';
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = Math.round(seconds % 60);
  return `${minutes}m ${remainSec}s`;
}

export default function WorkflowDetailPage({ params }: { params: { id: string } }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { push, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data: any = await api.workflows.get(params.id);
      const detail: Workflow = data?.data || data;
      if (!detail || !detail.id) {
        setNotFound(true);
        setWorkflow(null);
        return;
      }
      setWorkflow(detail);

      try {
        const ex: any = await api.workflows.listExecutions(params.id);
        const list = ex?.data || ex?.items || ex || [];
        setExecutions(Array.isArray(list) ? list : []);
      } catch {
        setExecutions([]);
      }
    } catch (err) {
      const e = err as APIError;
      if (e?.status === 404) {
        setNotFound(true);
        setWorkflow(null);
      } else {
        setError(e?.message || t('workflowDetail.couldntLoad', "Couldn't load workflow"));
        setWorkflow(null);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const steps = useMemo<WorkflowStep[]>(() => {
    if (!workflow) return [];
    if (Array.isArray(workflow.steps) && workflow.steps.length > 0) {
      return workflow.steps.map((s, i) => mapStep(s, i));
    }
    return [];
  }, [workflow]);

  const isActive = useMemo(() => {
    if (!workflow) return false;
    return (workflow.is_active ?? workflow.active) === true;
  }, [workflow]);

  const totalRuns = useMemo(() => {
    if (!workflow) return 0;
    return workflow.runs ?? workflow.execution_count ?? executions.length;
  }, [workflow, executions.length]);

  const successRate = useMemo(() => {
    if (executions.length === 0) return null;
    const succeeded = executions.filter((e) => e.status === 'completed' || e.status === 'success').length;
    return Math.round((succeeded / executions.length) * 100);
  }, [executions]);

  const lastRun = workflow?.last_run || (executions.length > 0 ? executions[0].started_at : null);

  const handleToggleActive = async () => {
    if (!workflow) return;
    const targetActive = !isActive;
    setActionLoading(targetActive ? 'activate' : 'deactivate');
    try {
      const updated: any = targetActive
        ? await api.workflows.activate(workflow.id)
        : await api.workflows.deactivate(workflow.id);
      const next: Workflow = updated?.data || updated || { ...workflow, active: targetActive, is_active: targetActive };
      setWorkflow(next);
      push(
        'success',
        targetActive
          ? t('workflowDetail.activated', 'Workflow activated')
          : t('workflowDetail.paused', 'Workflow paused')
      );
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('workflowDetail.toggleFailed', 'Failed to update workflow'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleTrigger = async () => {
    if (!workflow) return;
    setActionLoading('trigger');
    try {
      await api.workflows.trigger(workflow.id);
      setWorkflow((w) => (w ? { ...w, last_run: new Date().toISOString() } : w));
      push('success', t('workflowDetail.triggered', 'Workflow triggered'));
      await load();
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('workflowDetail.triggerFailed', 'Failed to trigger workflow'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDuplicate = async () => {
    if (!workflow) return;
    setActionLoading('duplicate');
    try {
      await api.workflows.create({
        name: `${workflow.name} (copy)`,
        description: workflow.description || undefined,
        trigger: workflow.trigger || 'manual',
        steps: workflow.steps || [],
        active: false,
      });
      push('success', t('workflowDetail.duplicated', 'Workflow duplicated'));
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('workflowDetail.duplicateFailed', 'Failed to duplicate workflow'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!workflow) return;
    setActionLoading('delete');
    try {
      await api.workflows.delete(workflow.id);
      push('success', t('workflowDetail.deleted', 'Workflow deleted'));
      if (typeof window !== 'undefined') {
        window.location.href = '/dashboard/workflows';
      }
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('workflowDetail.deleteFailed', 'Failed to delete workflow'));
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Skeleton height={20} width={200} />
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-5">
              <Skeleton variant="rounded" width={64} height={64} />
              <div className="flex-1 space-y-3">
                <Skeleton height={28} width="50%" />
                <Skeleton height={16} width="70%" />
                <div className="flex gap-2 mt-2">
                  <Skeleton height={24} width={90} />
                  <Skeleton height={24} width={120} />
                </div>
              </div>
              <div className="space-y-2 w-full sm:w-44">
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton height={220} />
            <Skeleton height={180} />
          </div>
          <div className="space-y-6">
            <Skeleton height={180} />
            <Skeleton height={160} />
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Breadcrumb />
        <Link
          href="/dashboard/workflows"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          aria-label={t('workflowDetail.backToWorkflows', 'Back to workflows')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('workflowDetail.backToWorkflows', 'Back to workflows')}
        </Link>
        <EmptyState
          icon={<WorkflowIcon className="h-12 w-12" />}
          title={t('workflowDetail.notFound', 'Workflow not found')}
          description={t(
            'workflowDetail.notFoundDesc',
            "The workflow you're looking for doesn't exist or has been removed."
          )}
          action={
            <Link href="/dashboard/workflows">
              <Button variant="primary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                {t('workflowDetail.backToWorkflows', 'Back to workflows')}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (error && !workflow) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Breadcrumb />
        <Link
          href="/dashboard/workflows"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          aria-label={t('workflowDetail.backToWorkflows', 'Back to workflows')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('workflowDetail.backToWorkflows', 'Back to workflows')}
        </Link>
        <Card>
          <CardContent className="p-0">
            <ErrorState
              title={t('workflowDetail.couldntLoad', "Couldn't load workflow")}
              description={error}
              onRetry={load}
              retryLabel={t('common.retry', 'Retry')}
              fullHeight
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!workflow) return null;

  const createdAt = workflow.created_at ? formatDate(workflow.created_at, locale) : null;
  const lastRunAt = lastRun ? formatRelativeTime(lastRun, locale) : null;
  const lastRunAbsolute = lastRun ? formatDate(lastRun, locale, { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <div className="space-y-6">
      <ToastContainer />

      <Breadcrumb />

      <Link
        href="/dashboard/workflows"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        aria-label={t('workflowDetail.backToWorkflows', 'Back to workflows')}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('workflowDetail.backToWorkflows', 'Back to workflows')}
      </Link>

      <Card>
        <CardContent className="p-6">
          <header className="flex flex-col lg:flex-row gap-5 items-start lg:items-center">
            <div
              className="h-16 w-16 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center text-white shrink-0 ring-4 ring-blue-100 dark:ring-blue-500/20"
              aria-hidden="true"
            >
              <WorkflowIcon className="h-8 w-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words">
                {workflow.name}
              </h1>
              {workflow.description && (
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 break-words">{workflow.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={isActive ? 'success' : 'default'} dot>
                  {isActive ? t('workflowDetail.active', 'Active') : t('workflowDetail.pausedBadge', 'Paused')}
                </Badge>
                {workflow.trigger && (
                  <Badge variant="info">
                    <Zap className="h-3 w-3 mr-0.5" aria-hidden="true" />
                    {workflow.trigger}
                  </Badge>
                )}
                {steps.length > 0 && (
                  <Badge variant="outline">
                    <CheckSquare className="h-3 w-3 mr-0.5" aria-hidden="true" />
                    {steps.length} {t('workflowDetail.steps', 'steps')}
                  </Badge>
                )}
                {successRate !== null && (
                  <Badge variant={successRate >= 80 ? 'success' : successRate >= 50 ? 'warning' : 'danger'}>
                    <TrendingUp className="h-3 w-3 mr-0.5" aria-hidden="true" />
                    {successRate}% {t('workflowDetail.success', 'success')}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 w-full lg:w-auto lg:flex-col lg:items-stretch">
              <Button
                variant="primary"
                size="sm"
                leftIcon={
                  actionLoading === 'trigger' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )
                }
                onClick={handleTrigger}
                loading={actionLoading === 'trigger'}
                aria-label={t('workflowDetail.runNow', 'Run now')}
              >
                {t('workflowDetail.runNow', 'Run now')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={
                  actionLoading === 'activate' || actionLoading === 'deactivate' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isActive ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )
                }
                onClick={handleToggleActive}
                loading={actionLoading === 'activate' || actionLoading === 'deactivate'}
                aria-label={isActive ? t('workflowDetail.pause', 'Pause') : t('workflowDetail.activate', 'Activate')}
              >
                {isActive ? t('workflowDetail.pause', 'Pause') : t('workflowDetail.activate', 'Activate')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Edit3 className="h-4 w-4" />}
                onClick={() => push('info', t('workflowDetail.editSoon', 'Workflow editor will be available soon'))}
                aria-label={t('workflowDetail.edit', 'Edit workflow')}
              >
                {t('workflowDetail.edit', 'Edit')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={
                  actionLoading === 'duplicate' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )
                }
                onClick={handleDuplicate}
                loading={actionLoading === 'duplicate'}
                aria-label={t('workflowDetail.duplicate', 'Duplicate workflow')}
              >
                {t('workflowDetail.duplicate', 'Duplicate')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => setConfirmDelete(true)}
                aria-label={t('workflowDetail.delete', 'Delete workflow')}
              >
                {t('workflowDetail.delete', 'Delete')}
              </Button>
            </div>
          </header>
        </CardContent>
      </Card>

      <section
        aria-label={t('workflowDetail.statsLabel', 'Workflow statistics')}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <StatCard
          label={t('workflowDetail.totalRuns', 'Total runs')}
          value={formatNumber(totalRuns, locale)}
          icon={<Activity className="h-3.5 w-3.5" />}
          color="blue"
        />
        <StatCard
          label={t('workflowDetail.successRate', 'Success rate')}
          value={successRate !== null ? `${successRate}%` : '—'}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          color={successRate !== null ? (successRate >= 80 ? 'green' : successRate >= 50 ? 'amber' : 'red') : 'gray'}
        />
        <StatCard
          label={t('workflowDetail.lastRun', 'Last run')}
          value={lastRunAt || t('workflowDetail.never', 'Never')}
          icon={<Clock className="h-3.5 w-3.5" />}
          color="purple"
        />
        <StatCard
          label={t('workflowDetail.steps', 'Steps')}
          value={String(steps.length)}
          icon={<GitBranch className="h-3.5 w-3.5" />}
          color="indigo"
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section aria-labelledby="steps-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <GitBranch className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2
                    id="steps-section-title"
                    className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    {t('workflowDetail.stepsVisualization', 'Steps visualization')}
                  </h2>
                </div>
                {steps.length > 0 ? (
                  <ol className="space-y-3" role="list">
                    {steps.map((step, idx) => {
                      const meta = STEP_TYPE_META[step.type] || STEP_TYPE_META.action;
                      const StepIcon = step.icon;
                      return (
                        <li
                          key={step.id}
                          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-surface-900"
                        >
                          <span
                            className="text-xs font-bold text-gray-500 dark:text-gray-400 w-5 text-center tabular-nums"
                            aria-hidden="true"
                          >
                            {idx + 1}
                          </span>
                          <div
                            className={`h-10 w-10 rounded-lg bg-gradient-to-br ${step.color} flex items-center justify-center text-white shrink-0`}
                            aria-hidden="true"
                          >
                            <StepIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {step.label}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {meta.label}
                            </p>
                          </div>
                          <Badge variant={meta.variant} size="sm">
                            {meta.label}
                          </Badge>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {t('workflowDetail.noSteps', 'This workflow has no steps configured yet.')}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="runs-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2
                    id="runs-section-title"
                    className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    {t('workflowDetail.runHistory', 'Run history')}
                  </h2>
                  <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                    {executions.length} {t('workflowDetail.total', 'total')}
                  </span>
                </div>
                {executions.length > 0 ? (
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-sm" role="table">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-800">
                          <th
                            scope="col"
                            className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                          >
                            {t('workflowDetail.table.date', 'Date')}
                          </th>
                          <th
                            scope="col"
                            className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                          >
                            {t('workflowDetail.table.status', 'Status')}
                          </th>
                          <th
                            scope="col"
                            className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                          >
                            {t('workflowDetail.table.duration', 'Duration')}
                          </th>
                          <th
                            scope="col"
                            className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                          >
                            {t('workflowDetail.table.result', 'Result')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {executions.map((ex) => {
                          const started = ex.started_at ? new Date(ex.started_at) : null;
                          const completed = ex.completed_at ? new Date(ex.completed_at) : null;
                          const computedDuration =
                            ex.duration_ms ??
                            (started && completed ? completed.getTime() - started.getTime() : null);
                          const variant = EXECUTION_STATUS_VARIANT[ex.status] || 'default';
                          return (
                            <tr
                              key={ex.id}
                              className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-surface-800"
                            >
                              <td className="py-2.5 px-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                {started
                                  ? formatDate(ex.started_at, locale, { dateStyle: 'short', timeStyle: 'short' })
                                  : '—'}
                              </td>
                              <td className="py-2.5 px-2">
                                <Badge variant={variant} size="sm" dot>
                                  {ex.status}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1">
                                  <Hourglass className="h-3 w-3 text-gray-400" aria-hidden="true" />
                                  {formatDuration(computedDuration, locale)}
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-gray-700 dark:text-gray-300">
                                {ex.status === 'completed' || ex.status === 'success' ? (
                                  <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    {t('workflowDetail.resultOk', 'Success')}
                                  </span>
                                ) : ex.status === 'failed' || ex.status === 'error' ? (
                                  <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                    {ex.error || t('workflowDetail.resultFailed', 'Failed')}
                                  </span>
                                ) : ex.status === 'running' ? (
                                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                    {t('workflowDetail.resultRunning', 'Running')}
                                  </span>
                                ) : (
                                  <span className="text-gray-500 dark:text-gray-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon={<Activity className="h-10 w-10" />}
                    title={t('workflowDetail.noRuns', 'No runs yet')}
                    description={t('workflowDetail.noRunsDesc', 'Trigger this workflow to see its execution history here.')}
                    action={
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<Play className="h-4 w-4" />}
                        onClick={handleTrigger}
                      >
                        {t('workflowDetail.runNow', 'Run now')}
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="trigger-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2
                    id="trigger-section-title"
                    className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    {t('workflowDetail.trigger', 'Trigger')}
                  </h2>
                </div>
                <p className="text-base font-semibold text-gray-900 dark:text-white">
                  {workflow.trigger || t('workflowDetail.manualTrigger', 'Manual')}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {isActive
                    ? t('workflowDetail.triggerEnabled', 'Workflow will run automatically when triggered')
                    : t('workflowDetail.triggerDisabled', 'Workflow is paused and will not run automatically')}
                </p>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="meta-section-title">
            <Card>
              <CardContent className="p-6 space-y-3 text-sm">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 uppercase text-xs font-bold tracking-wider">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('workflowDetail.metadata', 'Metadata')}
                </div>
                {createdAt && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">
                      {t('workflowDetail.created', 'Created')}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white text-right">
                      {createdAt}
                    </span>
                  </div>
                )}
                {lastRunAt && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">
                      {t('workflowDetail.lastRunLabel', 'Last run')}
                    </span>
                    <span
                      className="font-medium text-gray-900 dark:text-white text-right"
                      title={lastRunAbsolute || undefined}
                    >
                      {lastRunAt}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 dark:text-gray-400">
                    {t('workflowDetail.idLabel', 'Workflow ID')}
                  </span>
                  <span className="font-mono text-[10px] text-gray-600 dark:text-gray-400 break-all text-right">
                    {workflow.id}
                  </span>
                </div>
              </CardContent>
            </Card>
          </section>

          {lastRun && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('workflowDetail.recentActivity', 'Recent activity')}
                  </h2>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('workflowDetail.lastRunOn', 'Last execution was {when}').replace('{when}', lastRunAt || '')}
                </p>
                {lastRunAbsolute && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{lastRunAbsolute}</p>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title={t('workflowDetail.deleteTitle', 'Delete workflow?')}
        description={t(
          'workflowDetail.deleteDesc',
          'This will permanently remove "{name}". Any active runs will be cancelled.'
        ).replace('{name}', workflow.name)}
        confirmLabel={t('workflowDetail.delete', 'Delete workflow')}
        destructive
        loading={actionLoading === 'delete'}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'indigo' | 'gray';
}) {
  const colorClass: Record<typeof color, string> = {
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-green-600 dark:text-green-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    purple: 'text-purple-600 dark:text-purple-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    gray: 'text-gray-600 dark:text-gray-400',
  };
  return (
    <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
        <span className={colorClass[color]} aria-hidden="true">
          {icon}
        </span>
        {label}
      </div>
      <p className={`mt-1 text-2xl font-bold ${colorClass[color]}`}>{value}</p>
    </div>
  );
}
