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
} from '@/components';

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

const SAMPLE_WORKFLOWS: Workflow[] = [
  {
    id: 'wf-1',
    name: 'Auto-screen new candidates',
    description: 'Run AI screener on every new application above 80% threshold',
    is_active: true,
    steps: [
      { id: 's1', type: 'trigger', label: 'New application', icon: Mail, color: 'from-blue-500 to-indigo-500' },
      { id: 's2', type: 'condition', label: 'Has resume URL', icon: GitBranch, color: 'from-amber-500 to-orange-500' },
      { id: 's3', type: 'action', label: 'AI Screener', icon: Zap, color: 'from-purple-500 to-pink-500' },
      { id: 's4', type: 'condition', label: 'Score > 80', icon: GitBranch, color: 'from-amber-500 to-orange-500' },
      { id: 's5', type: 'notification', label: 'Email hiring manager', icon: Bell, color: 'from-green-500 to-emerald-500' },
    ],
    runs: 1247,
    last_run: '12 min ago',
    success_rate: 94,
    created_at: '2026-04-15',
  },
  {
    id: 'wf-2',
    name: 'Interview no-show follow-up',
    description: 'Send a follow-up email when a candidate misses their scheduled interview',
    is_active: true,
    steps: [
      { id: 's1', type: 'trigger', label: 'Interview no-show', icon: Calendar, color: 'from-blue-500 to-indigo-500' },
      { id: 's2', type: 'action', label: 'Wait 2 hours', icon: Clock, color: 'from-amber-500 to-orange-500' },
      { id: 's3', type: 'action', label: 'Send follow-up', icon: Mail, color: 'from-purple-500 to-pink-500' },
    ],
    runs: 89,
    last_run: '3 hours ago',
    success_rate: 78,
    created_at: '2026-05-01',
  },
  {
    id: 'wf-3',
    name: 'Offer letter generation',
    description: 'Auto-generate offer letters for candidates above the offer threshold',
    is_active: false,
    steps: [
      { id: 's1', type: 'trigger', label: 'Status = Offer', icon: CheckSquare, color: 'from-blue-500 to-indigo-500' },
      { id: 's2', type: 'action', label: 'Generate document', icon: FileText, color: 'from-purple-500 to-pink-500' },
      { id: 's3', type: 'action', label: 'E-signature', icon: Edit3, color: 'from-amber-500 to-orange-500' },
      { id: 's4', type: 'notification', label: 'Notify CEO', icon: Bell, color: 'from-green-500 to-emerald-500' },
    ],
    runs: 23,
    last_run: '2 days ago',
    success_rate: 100,
    created_at: '2026-05-20',
  },
];

const STEP_TYPE_BADGE: Record<WorkflowStep['type'], { variant: any; label: string }> = {
  trigger: { variant: 'info', label: 'Trigger' },
  condition: { variant: 'warning', label: 'Condition' },
  action: { variant: 'purple', label: 'Action' },
  notification: { variant: 'success', label: 'Notify' },
};

const TEMPLATES: { name: string; description: string; steps: Omit<WorkflowStep, 'id'>[] }[] = [
  {
    name: 'High-priority candidate alert',
    description: 'Notify hiring manager when a candidate scores 90+',
    steps: [
      { type: 'trigger', label: 'New AI score', icon: Zap, color: 'from-blue-500 to-indigo-500' },
      { type: 'condition', label: 'Score > 90', icon: GitBranch, color: 'from-amber-500 to-orange-500' },
      { type: 'notification', label: 'Slack + Email', icon: Bell, color: 'from-green-500 to-emerald-500' },
    ],
  },
  {
    name: 'Weekly hiring digest',
    description: 'Send a hiring summary to leadership every Monday',
    steps: [
      { type: 'trigger', label: 'Monday 9am', icon: Clock, color: 'from-blue-500 to-indigo-500' },
      { type: 'action', label: 'Build report', icon: FileText, color: 'from-purple-500 to-pink-500' },
      { type: 'notification', label: 'Email leadership', icon: Bell, color: 'from-green-500 to-emerald-500' },
    ],
  },
  {
    name: 'Re-engage stale candidates',
    description: 'Reach out to candidates who haven\u2019t progressed in 14 days',
    steps: [
      { type: 'trigger', label: 'No activity 14d', icon: Clock, color: 'from-blue-500 to-indigo-500' },
      { type: 'condition', label: 'Status not hired', icon: GitBranch, color: 'from-amber-500 to-orange-500' },
      { type: 'action', label: 'AI outreach', icon: Mail, color: 'from-purple-500 to-pink-500' },
    ],
  },
];

export default function WorkflowsPage() {
  const { success, error: errorNotify, info } = useNotification();
  const [workflows, setWorkflows] = useState<Workflow[]>(SAMPLE_WORKFLOWS);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<Workflow | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.listWorkflows()
      .then((d) => {
        if (d?.data && d.data.length > 0) {
          const merged: Workflow[] = d.data.map((w: any) => ({
            ...w,
            steps: SAMPLE_WORKFLOWS.find((s) => s.id === w.id)?.steps || SAMPLE_WORKFLOWS[0].steps,
            runs: w.runs ?? 0,
            success_rate: w.success_rate ?? 0,
            last_run: w.last_run,
          }));
          setWorkflows(merged);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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

  const toggleActive = (id: string) => {
    setWorkflows((p) =>
      p.map((w) => (w.id === id ? { ...w, is_active: !w.is_active, runs: w.is_active ? w.runs : w.runs + 1, last_run: !w.is_active ? 'just now' : w.last_run } : w))
    );
    const w = workflows.find((x) => x.id === id);
    if (w) {
      info(w.is_active ? 'Workflow paused' : 'Workflow activated', w.name);
    }
  };

  const duplicate = (w: Workflow) => {
    const copy: Workflow = {
      ...w,
      id: `wf-${Date.now()}`,
      name: `${w.name} (copy)`,
      is_active: false,
      runs: 0,
      last_run: undefined,
    };
    setWorkflows((p) => [copy, ...p]);
    success('Duplicated', `Created a copy of "${w.name}"`);
  };

  const remove = (id: string) => {
    const w = workflows.find((x) => x.id === id);
    setWorkflows((p) => p.filter((x) => x.id !== id));
    if (w) errorNotify('Deleted', `"${w.name}" has been removed.`);
  };

  const runNow = (w: Workflow) => {
    setWorkflows((p) =>
      p.map((x) => (x.id === w.id ? { ...x, runs: x.runs + 1, last_run: 'just now' } : x))
    );
    success('Workflow triggered', `"${w.name}" is running.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Workflows</h1>
          <p className="text-sm text-gray-500 mt-1">
            {workflows.length} workflows · {workflows.filter((w) => w.is_active).length} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {(['all', 'active', 'paused'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition capitalize ${
                  filter === f ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            Create workflow
          </Button>
        </div>
      </div>

      <Breadcrumb />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<WorkflowIcon className="h-12 w-12" />}
          title="No workflows yet"
          description="Build automated pipelines that screen, schedule, and message candidates without lifting a finger."
          action={
            <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Create your first workflow
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((w) => (
            <WorkflowCard
              key={w.id}
              workflow={w}
              onToggle={() => toggleActive(w.id)}
              onDuplicate={() => duplicate(w)}
              onDelete={() => remove(w.id)}
              onEdit={() => setEdit(w)}
              onRun={() => runNow(w)}
              menuOpen={menuId === w.id}
              onMenuToggle={() => setMenuId(menuId === w.id ? null : w.id)}
            />
          ))}
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create workflow" description="Pick a template to get started in seconds." size="lg">
        <div className="space-y-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => {
                const newWf: Workflow = {
                  id: `wf-${Date.now()}`,
                  name: t.name,
                  description: t.description,
                  is_active: false,
                  steps: t.steps.map((s, i) => ({ ...s, id: `s-${i}-${Date.now()}` })),
                  runs: 0,
                  success_rate: 0,
                  created_at: new Date().toISOString().slice(0, 10),
                };
                setWorkflows((p) => [newWf, ...p]);
                setCreateOpen(false);
                success('Workflow created', `"${t.name}" is ready. Toggle it on to start.`);
              }}
              className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 transition"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white shrink-0">
                  <WorkflowIcon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.steps.map((s, i) => {
                      const meta = STEP_TYPE_BADGE[s.type];
                      return (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                          {i + 1}. {s.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </button>
          ))}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            <p className="font-semibold">Custom builder</p>
            <p className="mt-0.5 opacity-80">Need a fully custom workflow? Reach out and we&apos;ll help you build it.</p>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.name || 'Workflow'} description="Execution log and stats" size="lg">
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Total runs" value={edit.runs.toLocaleString()} icon={<Activity className="h-4 w-4" />} />
              <Stat label="Success rate" value={`${edit.success_rate}%`} icon={<CheckCircle2 className="h-4 w-4" />} />
              <Stat label="Last run" value={edit.last_run || 'Never'} icon={<Clock className="h-4 w-4" />} />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Steps</h4>
              <div className="space-y-1.5">
                {edit.steps.map((s, i) => {
                  const Icon = s.icon;
                  const meta = STEP_TYPE_BADGE[s.type];
                  return (
                    <div key={s.id} className="flex items-center gap-2 p-2.5 rounded-md border border-gray-100 bg-gray-50">
                      <span className="text-xs font-bold text-gray-500 w-5 text-center">{i + 1}</span>
                      <div className={`h-7 w-7 rounded-md bg-gradient-to-br ${s.color} flex items-center justify-center text-white shrink-0`}>
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </div>
                      <span className="text-sm text-gray-900 flex-1">{s.label}</span>
                      <Badge variant={meta.variant} size="sm">
                        {meta.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setEdit(null)}>Close</Button>
              <Button variant="primary" onClick={() => { runNow(edit); setEdit(null); }} leftIcon={<Play className="h-4 w-4" />}>
                Run now
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function WorkflowCard({
  workflow,
  onToggle,
  onDuplicate,
  onDelete,
  onEdit,
  onRun,
  menuOpen,
  onMenuToggle,
}: {
  workflow: Workflow;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onRun: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
}) {
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
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  {workflow.name}
                  {workflow.is_active ? (
                    <Badge variant="success" size="sm" dot>Active</Badge>
                  ) : (
                    <Badge variant="default" size="sm" dot>Paused</Badge>
                  )}
                </h3>
                {workflow.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{workflow.description}</p>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  data-menu-btn
                  onClick={onMenuToggle}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <div
                    data-menu
                    role="menu"
                    className="absolute right-0 top-9 z-10 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { onEdit(); onMenuToggle(); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> View details
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { onDuplicate(); onMenuToggle(); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplicate
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { onDelete(); onMenuToggle(); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
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
                      <div className="h-0.5 w-4 bg-gray-200" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                <span><strong className="text-gray-900">{workflow.runs.toLocaleString()}</strong> runs</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span><strong className="text-gray-900">{workflow.success_rate}%</strong> success</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Last: <strong className="text-gray-900">{workflow.last_run || 'never'}</strong></span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={workflow.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  onClick={onToggle}
                >
                  {workflow.is_active ? 'Pause' : 'Activate'}
                </Button>
                <Button variant="secondary" size="sm" leftIcon={<Zap className="h-3.5 w-3.5" />} onClick={onRun}>
                  Run now
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
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        {label}
      </div>
      <p className="text-base font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
