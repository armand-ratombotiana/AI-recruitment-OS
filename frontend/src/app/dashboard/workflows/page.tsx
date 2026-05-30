'use client';
import { useState } from 'react';

const mockWorkflows = [
  { id: '1', name: 'Auto-Screen New Applicants', trigger: 'application.submitted', status: 'active', runs: 156, lastRun: '5 min ago', steps: 4 },
  { id: '2', name: 'Interview Reminder', trigger: 'interview.scheduled', status: 'active', runs: 89, lastRun: '1 hr ago', steps: 3 },
  { id: '3', name: 'PPE Evaluation Pipeline', trigger: 'ppe.session.completed', status: 'active', runs: 42, lastRun: '30 min ago', steps: 5 },
  { id: '4', name: 'Hire Rejection Auto-Email', trigger: 'hiring.decision.made', status: 'paused', runs: 23, lastRun: '2 days ago', steps: 2 },
];

export default function WorkflowsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflows</h1>
          <p className="text-sm text-gray-500">Automation workflows and rules</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Create Workflow</button>
      </div>

      <div className="space-y-4">
        {mockWorkflows.map((wf) => (
          <div key={wf.id} className="bg-white rounded-xl border p-4 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
              <span className="text-blue-600 text-lg">⚡</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{wf.name}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${wf.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{wf.status}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Trigger: {wf.trigger} • {wf.steps} steps</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-medium">{wf.runs} runs</p>
              <p className="text-xs text-gray-500">{wf.lastRun}</p>
            </div>
            <button className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50">
              {wf.status === 'active' ? '⏸ Pause' : '▶ Start'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
