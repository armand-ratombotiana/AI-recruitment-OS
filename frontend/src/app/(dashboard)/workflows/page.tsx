'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';

const WORKFLOW_TEMPLATES = [
  { name: 'Auto-Screen Applicants', description: 'Automatically screen new applications with AI', trigger: 'application.submitted', icon: '🤖', steps: 4 },
  { name: 'Interview Reminder', description: 'Send reminders before scheduled interviews', trigger: 'interview.scheduled', icon: '⏰', steps: 2 },
  { name: 'PPE Evaluation Pipeline', description: 'Run PPE evaluation after technical screening', trigger: 'technical_screen.passed', icon: '💻', steps: 5 },
  { name: 'Hire Notification', description: 'Notify stakeholders on hiring decision', trigger: 'hiring.decision_made', icon: '🎉', steps: 3 },
  { name: 'Compliance Check', description: 'Run compliance checks before offer', trigger: 'offer.pending', icon: '✅', steps: 3 },
  { name: 'Candidate Follow-up', description: 'Automated follow-up with candidates', trigger: 'candidate.no_response', icon: '📧', steps: 2 },
];

function WorkflowCardSkeleton() {
  return (
    <Card className="p-4 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 bg-gray-200 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 bg-gray-200 rounded" />
          <div className="h-3 w-32 bg-gray-200 rounded" />
        </div>
        <div className="h-5 w-16 bg-gray-200 rounded-full" />
      </div>
    </Card>
  );
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState({
    name: '',
    description: '',
    trigger_type: '',
  });

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.listWorkflows();
      setWorkflows(data?.data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newWorkflow.name || !newWorkflow.trigger_type) return;
    try {
      setCreating(true);
      await api.createWorkflow({
        name: newWorkflow.name,
        description: newWorkflow.description,
        trigger_type: newWorkflow.trigger_type,
        status: 'active',
        steps_config: [],
      });
      setShowCreateModal(false);
      setNewWorkflow({ name: '', description: '', trigger_type: '' });
      loadWorkflows();
    } catch (e: any) {
      setError(e.message || 'Failed to create workflow');
    } finally {
      setCreating(false);
    }
  };

  const applyTemplate = (template: typeof WORKFLOW_TEMPLATES[0]) => {
    setNewWorkflow({
      name: template.name,
      description: template.description,
      trigger_type: template.trigger,
    });
    setShowCreateModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflow Automation</h1>
          <p className="text-gray-500">No-code automation for your recruitment workflows</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={loadWorkflows}>Refresh</Button>
          <Button onClick={() => setShowCreateModal(true)}>+ Create Workflow</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Active Workflows</CardTitle>
            <Badge variant="info">{workflows.length} workflows</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <WorkflowCardSkeleton key={i} />)}
            </div>
          ) : workflows.length === 0 ? (
            <EmptyState
              icon={<span className="text-4xl">⚡</span>}
              title="No active workflows"
              description="Create a workflow from a template below or build a custom one."
            />
          ) : (
            <div className="space-y-3">
              {workflows.map((wf: any) => (
                <div key={wf.id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:shadow-sm transition">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">⚡</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{wf.name}</h4>
                      <Badge variant={wf.status === 'active' ? 'success' : wf.status === 'paused' ? 'warning' : 'default'}>
                        {wf.status || 'active'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Trigger: {wf.trigger_type || 'manual'} · {wf.steps_config?.length || 0} steps
                    </p>
                  </div>
                  <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">Configure</button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Workflow Templates</CardTitle>
            <Badge variant="default">{WORKFLOW_TEMPLATES.length} templates</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {WORKFLOW_TEMPLATES.map((template, i) => (
              <div
                key={i}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition cursor-pointer group"
                onClick={() => applyTemplate(template)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{template.icon}</span>
                  <h4 className="font-medium group-hover:text-blue-600 transition-colors">{template.name}</h4>
                </div>
                <p className="text-sm text-gray-500 mb-3">{template.description}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Trigger: {template.trigger}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-400">{template.steps} steps</span>
                  </div>
                  <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">Use Template</button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Workflow" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Workflow Name *</label>
            <input
              value={newWorkflow.name}
              onChange={e => setNewWorkflow(p => ({ ...p, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="My Workflow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={newWorkflow.description}
              onChange={e => setNewWorkflow(p => ({ ...p, description: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
              placeholder="What does this workflow do?"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Trigger Type *</label>
            <select
              value={newWorkflow.trigger_type}
              onChange={e => setNewWorkflow(p => ({ ...p, trigger_type: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select trigger...</option>
              <option value="application.submitted">Application Submitted</option>
              <option value="interview.scheduled">Interview Scheduled</option>
              <option value="interview.completed">Interview Completed</option>
              <option value="technical_screen.passed">Technical Screen Passed</option>
              <option value="hiring.decision_made">Hiring Decision Made</option>
              <option value="offer.pending">Offer Pending</option>
              <option value="candidate.no_response">Candidate No Response</option>
              <option value="manual">Manual Trigger</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newWorkflow.name || !newWorkflow.trigger_type}>
              {creating ? 'Creating...' : 'Create Workflow'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
