'use client';
import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listWorkflows().then(d => setWorkflows(d?.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workflows</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Create Workflow</button>
      </div>
      {loading ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map(w => <div key={w.id} className="bg-white rounded-xl border p-4 hover:shadow-md transition"><h3 className="font-semibold">{w.name}</h3><p className="text-sm text-gray-500 mt-1">{w.description || 'No description'}</p><div className="mt-3 flex items-center gap-2"><span className={`px-2 py-1 rounded-full text-xs ${w.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{w.is_active ? 'Active' : 'Inactive'}</span></div></div>)}
          {workflows.length === 0 && <p className="text-center py-8 text-gray-500 col-span-3">No workflows found</p>}
        </div>
      )}
    </div>
  );
}
