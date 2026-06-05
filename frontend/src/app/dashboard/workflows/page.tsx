'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Play,
  Pause,
  Copy,
  Edit3,
  Trash2,
  MoreVertical,
  Workflow as WorkflowIcon,
  Mail,
  CheckSquare,
  GitBranch,
  Zap,
  Bell,
  FileText,
  Clock,
  TrendingUp,
  Calendar,
  Activity,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { api } from '@/services/api/client';
import {
  EmptyState,
  Skeleton,
  useNotification,
  Breadcrumb,
  Button,
  Badge,
  Modal,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  useToast,
  HelpButton,
  workflowsTour,
} from '@/components';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';

interface WorkflowStep {
  id: string;
  type: 'trigger' | 'condition' | 'action' | 'notification';
  label: string;
  icon: any;
  color: string;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  steps: WorkflowStep[];
  runs: number;
  last_run?: string;
  success_rate: number;
  created_at?: string;
}

const STEP_TYPE_BADGE: Record<WorkflowStep['type'], { variant: any; label: string }> = {
  trigger: { variant: 'info', label: 'Trigger' },
  condition: { variant: 'warning', label: 'Condition' },
  action: { variant: 'purple', label: 'Action' },
  notification: { variant: 'success', label: 'Notify' },
};

const TEMPLATES: { name: string; description: string; steps: Omit<WorkflowStep, 'id'>[]; definition: any }[] = [
  {
    name: 'High-priority candidate alert',
    description: 'Notify hiring manager when a candidate scores 90+',
    steps: [
      { type: 'trigger', label: 'New AI score', icon: Zap, color: 'from-blue-500 to-indigo-500' },
      { type: 'condition', label: 'Score > 90', icon: GitBranch, color: 'from-amber-500 to-orange-500' },
      { type: 'notification', label: 'Slack + Email', icon: Bell, color: 'from-green-500 to-emerald-500' },
    ],
    definition: {
      trigger: { type: 'event', event: 'candidate.scored' },
      conditions: [{ field: 'score', op: '>', value: 90 }],
      actions: [{ type: 'slack', channel: '#hiring' }, { type: 'email', to: 'hiring_manager' }],
    },
  },
  {
    name: 'Weekly hiring digest',
    description: 'Send a hiring summary to leadership every Monday',
    steps: [
      { type: 'trigger', label: 'Monday 9am', icon: Clock, color: 'from-blue-500 to-indigo-500' },
      { type: 'action', label: 'Build report', icon: FileText, color: 'from-purple-500 to-pink-500' },
      { type: 'notification', label: 'Email leadership', icon: Bell, color: 'from-green-500 to-emerald-500' },
    ],
    definition: {
      trigger: { type: 'schedule', cron: '0 9 * * 1' },
      conditions: [],
      actions: [{ type: 'generate_report' }, { type: 'email', to: 'leadership' }],
    },
  },
  {
    name: 'Re-engage stale candidates',
    description: 'Reach out to candidates who haven’t progressed in 14 days',
    steps: [
      { type: 'trigger', label: 'No activity 14d', icon: Clock, color: 'from-blue-500 to-indigo-500' },
      { type: 'condition', label: 'Status not hired', icon: GitBranch, color: 'from-amber-500 to-orange-500' },
      { type: 'action', label: 'AI outreach', icon: Mail, color: 'from-purple-500 to-pink-500' },
    ],
    definition: {
      trigger: { type: 'event', event: 'candidate.idle' },
      conditions: [{ field: 'days_idle', op: '>', value: 14 }, { field: 'status', op: '!=', value: 'hired' }],
      actions: [{ type: 'ai_outreach' }],
    },
  },
];

function mapApiWorkflow(w: any): Workflow {
  const steps: WorkflowStep[] = Array.isArray(w.steps) && w.steps.length > 0
    ? w.steps.map((s: any, i: number) => ({
        id: s.id || `s-${i}`,
        type: (s.type || 'action') as WorkflowStep['type'],
        label: s.label || s.name || s.type || `Step ${i + 1}`,
        icon: STEP_ICONS[s.type as string] || Zap,
        color: STEP_COLORS[(i || 0) % STEP_COLORS.length],
      }))
    : TEMPLATES[0].steps.map((s, i) => ({ ...s, id: `s-${i}` }));
  return {
    id: w.id,
    name: w.name || 'Untitled workflow',
    description: w.description,
    is_active: (w as any).is_active ?? !!(w as any).active,
    steps,
    runs: w.runs ?? w.execution_count ?? 0,
    last_run: w.last_run,
    success_rate: w.success_rate ?? 0,
    created_at: w.created_at,
  };
}

const STEP_ICONS: Record<string, any> = {
  trigger: Mail,
  condition: GitBranch,
  action: Zap,
  notification: Bell,
};

const STEP_COLORS = [
  'from-blue-500 to-indigo-500',
  'from-amber-500 to-orange-500',
  'from-purple-500 to-pink-500',
  'from-green-500 to-emerald-500',
];

export default function WorkflowsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { success, info } = useNotification();
  const { push, ToastContainer } = useToast();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<Workflow | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Workflow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d: any = await api.listWorkflows();
      const items = Array.isArray(d) ? d : (d?.data || d?.items || []);
      setWorkflows(items.map(mapApiWorkflow));
    } catch (err: any) {
      setError(err?.message || t('workflows.loadError', 'Failed to load workflows'));
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-menu]') && !target.closest('[data-menu-btn]')) {
        setMenuId(null);
      }
    };
    if (menuId) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuId]);

  const filtered = useMemo(() => {
    if (filter === 'all') return workflows;
    if (filter === 'active') return workflows.filter((w) => w.is_active);
    return workflows.filter((w) => !w.is_active);
  }, [workflows, filter]);

  const toggleActive = async (w: Workflow) => {
    setBusyId(w.id);
    try {
      if (w.is_active) {
        await api.deactivateWorkflow(w.id);
      } else {
        await api.activateWorkflow(w.id);
      }
      setWorkflows((p) => p.map((x) => (x.id === w.id ? { ...x, is_active: !w.is_active } : x)));
      push('success', w.is_active ? t('workflows.paused', '{name} paused').replace('{name}', w.name) : t('workflows.activated', '{name} activated').replace('{name}', w.name));
    } catch (err: any) {
      push('error', err?.message || t('workflows.updateFailed', 'Failed to update workflow'));
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (w: Workflow) => {
    setBusyId(w.id);
    try {
      const created = await api.createWorkflow({
        name: `${w.name} (copy)`,
        description: w.description,
        is_active: false,
        steps: w.steps.map((s) => ({ type: s.type, label: s.label })),
      });
      setWorkflows((p) => [mapApiWorkflow(created), ...p]);
      push('success', t('workflows.duplicated', 'Workflow duplicated'));
    } catch (err: any) {
      push('error', err?.message || t('workflows.duplicateFailed', 'Failed to duplicate workflow'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    try {
      await api.deleteWorkflow(confirmDelete.id);
      setWorkflows((p) => p.filter((x) => x.id !== confirmDelete.id));
      push('success', t('workflows.deleted', '{name} deleted').replace('{name}', confirmDelete.name));
      setConfirmDelete(null);
    } catch (err: any) {
      push('error', err?.message || t('workflows.deleteFailed', 'Failed to delete workflow'));
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async (w: Workflow) => {
    setBusyId(w.id);
    try {
      await api.triggerWorkflow(w.id);
      setWorkflows((p) => p.map((x) => (x.id === w.id ? { ...x, runs: x.runs + 1, last_run: new Date().toISOString() } : x)));
      push('success', t('workflows.running', '{name} is running').replace('{name}', w.name));
    } catch (err: any) {
      push('error', err?.message || t('workflows.triggerFailed', 'Failed to trigger workflow'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <ToastContainer />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('workflows.title', 'Workflows')}
          </h1>
          <HelpButton tour={workflowsTour} />
        </div>
        <div className="flex items-center gap-2">
          <div data-tour="workflows-filter" className="flex items-center gap-1 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg p-1">
            {(['all', 'active', 'paused'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-surface-700'
                }`}
              >
                {t(`workflows.filter.${f}`, f)}
              </button>
            ))}
          </div>
          <Button data-tour="workflows-create" variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            {t('workflows.create', 'Create workflow')}
          </Button>
        </div>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 -mt-3">
        {interpolate(t('workflows.counts', '{total} workflows · {active} active'), {
          total: String(workflows.length),
          active: String(workflows.filter((w) => w.is_active).length),
        })}
      </p>

      <Breadcrumb />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<WorkflowIcon className="h-12 w-12" />}
          title={t('workflows.loadError', "Couldn't load workflows")}
          description={error}
          action={<Button variant="primary" onClick={load}>{t('common.retry', 'Retry')}</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<WorkflowIcon className="h-12 w-12" />}
          title={workflows.length === 0 ? t('workflows.none', 'No workflows yet') : t('workflows.noMatch', 'No workflows match this filter')}
          description={workflows.length === 0 ? t('workflows.noneDesc', 'Build automated pipelines that screen, schedule, and message candidates without lifting a finger.') : t('workflows.tryAll', 'Try selecting "All" to see your workflows.')}
          action={
            workflows.length === 0 ? (
              <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                {t('workflows.createFirst', 'Create your first workflow')}
              </Button>
            ) : null
          }
        />
      ) : (
        <div data-tour="workflows-list" className="space-y-4">
          {filtered.map((w) => (
            <WorkflowCard
              key={w.id}
              workflow={w}
              busy={busyId === w.id}
              onToggle={() => toggleActive(w)}
              onDuplicate={() => duplicate(w)}
              onDelete={() => setConfirmDelete(w)}
              onEdit={() => setEdit(w)}
              onRun={() => runNow(w)}
              menuOpen={menuId === w.id}
              onMenuToggle={() => setMenuId(menuId === w.id ? null : w.id)}
            />
          ))}
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={t('workflows.modal.createTitle', 'Create workflow')} description={t('workflows.modal.createDesc', 'Pick a template to get started in seconds.')} size="lg">
        <div className="space-y-3">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              onClick={async () => {
                try {
                  const created = await api.createWorkflow({
                    name: tpl.name,
                    description: tpl.description,
                    is_active: false,
                    steps: tpl.steps.map((s) => ({ type: s.type, label: s.label })),
                    definition: tpl.definition,
                  });
                  setWorkflows((p) => [mapApiWorkflow(created), ...p]);
                  setCreateOpen(false);
                  push('success', t('workflows.templateCreated', '{name} created. Toggle it on to start.').replace('{name}', tpl.name));
                } catch (err: any) {
                  push('error', err?.message || t('workflows.createFailed', 'Failed to create workflow'));
                }
              }}
              className="w-full text-left p-4 rounded-lg border border-gray-200 dark:border-surface-700 hover:border-blue-300 hover:bg-blue-50/30 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10 transition"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white shrink-0">
                  <WorkflowIcon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{tpl.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tpl.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tpl.steps.map((s, i) => {
                      const meta = STEP_TYPE_BADGE[s.type];
                      return (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-surface-800 text-gray-700 dark:text-gray-200 font-medium">
                          {i + 1}. {s.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </button>
          ))}
          <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-xs text-amber-900 dark:text-amber-200">
            <p className="font-semibold">{t('workflows.custom.title', 'Custom builder')}</p>
            <p className="mt-0.5 opacity-80">{t('workflows.custom.desc', 'Need a fully custom workflow? The visual builder will be available soon.')}</p>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.name || t('workflows.title', 'Workflow')} description={t('workflows.modal.detailsDesc', 'Execution log and stats')} size="lg">
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label={t('workflows.stats.runs', 'Total runs')} value={(edit.runs || 0).toLocaleString()} icon={<Activity className="h-4 w-4" />} />
              <Stat label={t('workflows.stats.success', 'Success rate')} value={`${edit.success_rate || 0}%`} icon={<CheckCircle2 className="h-4 w-4" />} />
              <Stat label={t('workflows.stats.lastRun', 'Last run')} value={edit.last_run ? new Date(edit.last_run).toLocaleString() : t('workflows.never', 'Never')} icon={<Clock className="h-4 w-4" />} />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">{t('workflows.steps', 'Steps')}</h4>
              <div className="space-y-1.5">
                {edit.steps.map((s, i) => {
                  const Icon = s.icon;
                  const meta = STEP_TYPE_BADGE[s.type];
                  return (
                    <div key={s.id} className="flex items-center gap-2 p-2.5 rounded-md border border-gray-100 dark:border-surface-700 bg-gray-50 dark:bg-surface-800">
                      <span className="text-xs font-bold text-gray-500 w-5 text-center">{i + 1}</span>
                      <div className={`h-7 w-7 rounded-md bg-gradient-to-br ${s.color} flex items-center justify-center text-white shrink-0`}>
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </div>
                      <span className="text-sm text-gray-900 dark:text-gray-100 flex-1">{s.label}</span>
                      <Badge variant={meta.variant} size="sm">
                        {meta.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-surface-700">
              <Button variant="secondary" onClick={() => setEdit(null)}>{t('common.close', 'Close')}</Button>
              <Button
                variant="primary"
                onClick={async () => { await runNow(edit); setEdit(null); }}
                leftIcon={busyId === edit.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                loading={busyId === edit.id}
              >
                {t('workflows.runNow', 'Run now')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        title={t('workflows.deleteTitle', 'Delete workflow?')}
        description={t('workflows.deleteDesc', 'This will permanently remove "{name}". Any active runs will be cancelled.').replace('{name}', confirmDelete?.name || '')}
        confirmLabel={t('workflows.delete', 'Delete workflow')}
        destructive
        loading={!!busyId && busyId === confirmDelete?.id}
      />
    </div>
  );
}

function WorkflowCard({
  workflow,
  busy,
  onToggle,
  onDuplicate,
  onDelete,
  onEdit,
  onRun,
  menuOpen,
  onMenuToggle,
}: {
  workflow: Workflow;
  busy: boolean;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onRun: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
}) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white shrink-0`}>
            <WorkflowIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {workflow.name}
                  {workflow.is_active ? (
                    <Badge variant="success" size="sm" dot>{t('workflows.active', 'Active')}</Badge>
                  ) : (
                    <Badge variant="default" size="sm" dot>{t('workflows.pausedBadge', 'Paused')}</Badge>
                  )}
                </h3>
                {workflow.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{workflow.description}</p>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  data-menu-btn
                  data-tour="workflows-actions"
                  onClick={onMenuToggle}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-surface-800 text-gray-500 dark:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label={t('workflows.moreActions', 'More actions')}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <div
                    data-menu
                    role="menu"
                    className="absolute right-0 top-9 z-10 w-44 rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { onEdit(); onMenuToggle(); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-800"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> {t('workflows.actions.view', 'View details')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { onDuplicate(); onMenuToggle(); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-800"
                    >
                      <Copy className="h-3.5 w-3.5" /> {t('workflows.actions.duplicate', 'Duplicate')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { onDelete(); onMenuToggle(); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t('workflows.actions.delete', 'Delete')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
              {workflow.steps.map((s, i) => {
                const Icon = s.icon;
                const meta = STEP_TYPE_BADGE[s.type];
                return (
                  <div key={s.id} className="flex items-center gap-1 shrink-0">
                    <div className={`h-8 w-8 rounded-md bg-gradient-to-br ${s.color} flex items-center justify-center text-white`} title={`${meta.label}: ${s.label}`}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                    {i < workflow.steps.length - 1 && (
                      <div className="h-0.5 w-4 bg-gray-200 dark:bg-surface-700" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-gray-100 dark:border-surface-700">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                <span><strong className="text-gray-900 dark:text-gray-100">{(workflow.runs || 0).toLocaleString()}</strong> {t('workflows.runs', 'runs')}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span><strong className="text-gray-900 dark:text-gray-100">{workflow.success_rate || 0}%</strong> {t('workflows.success', 'success')}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('workflows.last', 'Last')}: <strong className="text-gray-900 dark:text-gray-100">{workflow.last_run ? new Date(workflow.last_run).toLocaleDateString() : t('workflows.never', 'never')}</strong></span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  data-tour="workflows-activate"
                  variant="ghost"
                  size="sm"
                  leftIcon={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : workflow.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  onClick={onToggle}
                  disabled={busy}
                >
                  {workflow.is_active ? t('workflows.pause', 'Pause') : t('workflows.activate', 'Activate')}
                </Button>
                <Button variant="secondary" size="sm" leftIcon={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} onClick={onRun} disabled={busy}>
                  {t('workflows.runNow', 'Run now')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-surface-800 rounded-lg border border-gray-100 dark:border-surface-700">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </div>
      <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
    </div>
  );
}
