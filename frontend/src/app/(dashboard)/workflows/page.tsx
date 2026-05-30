'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.listWorkflows();
      setWorkflows(data?.data || []);
    } catch (e) {
      console.error('Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  const workflowTemplates = [
    { name: 'Auto-Screen Applicants', description: 'Automatically screen new applications with AI', trigger: 'application.submitted', icon: '🤖' },
    { name: 'Interview Reminder', description: 'Send reminders before scheduled interviews', trigger: 'interview.scheduled', icon: '⏰' },
    { name: 'PPE Evaluation Pipeline', description: 'Run PPE evaluation after technical screening', trigger: 'technical_screen.passed', icon: '💻' },
    { name: 'Hire Notification', description: 'Notify stakeholders on hiring decision', trigger: 'hiring.decision_made', icon: '🎉' },
    { name: 'Compliance Check', description: 'Run compliance checks before offer', trigger: 'offer.pending', icon: '✅' },
    { name: 'Candidate Follow-up', description: 'Automated follow-up with candidates', trigger: 'candidate.no_response', icon: '📧' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflow Automation</h1>
          <p className="text-gray-500">No-code automation for your recruitment workflows</p>
        </div>
        <button onClick={loadData} className="text-sm text-blue-600 hover:text-blue-700">Refresh</button>
      </div>

      {/* Active Workflows */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Active Workflows</h3>
          <Badge variant="info">{workflows.length} workflows</Badge>
        </div>
        {loading ? (
          <p className="text-gray-500">Loading workflows...</p>
        ) : workflows.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No active workflows. Create one from the templates below.</p>
        ) : (
          <div className="space-y-3">
            {workflows.map((wf: any) => (
              <div key={wf.id} className="flex items-center gap-4 p-4 border rounded-lg hover:shadow-sm transition">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <span className="text-lg">⚡</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{wf.name}</h4>
                    <Badge variant={wf.status === 'active' ? 'success' : 'warning'}>{wf.status}</Badge>
                  </div>
                  <p className="text-sm text-gray-500">Trigger: {wf.trigger_type} • {wf.steps_config?.length || 0} steps</p>
                </div>
                <button className="text-sm text-blue-600 hover:text-blue-700">Configure</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Workflow Templates */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Workflow Templates</h3>
          <Badge variant="default">{workflowTemplates.length} templates</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflowTemplates.map((template, i) => (
            <div key={i} className="border rounded-lg p-4 hover:shadow-md transition cursor-pointer">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{template.icon}</span>
                <h4 className="font-medium">{template.name}</h4>
              </div>
              <p className="text-sm text-gray-500 mb-3">{template.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Trigger: {template.trigger}</span>
                <button className="text-sm text-blue-600 hover:text-blue-700">Use Template</button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
