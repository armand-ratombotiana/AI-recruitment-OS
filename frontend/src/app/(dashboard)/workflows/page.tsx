'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      const data = await api.listWorkflows();
      setWorkflows(data.data || []);
    } catch (e) {
      console.error('Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workflows</h1>
        <button onClick={fetchWorkflows} className="text-sm text-blue-600 hover:text-blue-700">Refresh</button>
      </div>
      {loading && <p className="text-gray-500">Loading workflows...</p>}
      {!loading && workflows.length === 0 && <p className="text-gray-500">No workflows configured</p>}
      {workflows.map(w => (
        <Card key={w.id} className="p-4 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{w.name}</h3>
              <p className="text-sm text-gray-500">{w.description || 'No description'}</p>
            </div>
            <Badge variant={w.is_active ? 'success' : 'warning'}>{w.is_active ? 'Active' : 'Inactive'}</Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}
