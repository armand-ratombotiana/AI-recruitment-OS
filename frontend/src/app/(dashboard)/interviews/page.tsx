'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInterviews();
  }, []);

  const fetchInterviews = async () => {
    try {
      const data = await api.listInterviews();
      setInterviews(data.data || []);
    } catch (e) {
      console.error('Failed to load interviews');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Interviews</h1>
        <button onClick={fetchInterviews} className="text-sm text-blue-600 hover:text-blue-700">Refresh</button>
      </div>
      {loading && <p className="text-gray-500">Loading interviews...</p>}
      {!loading && interviews.length === 0 && <p className="text-gray-500">No interviews scheduled</p>}
      {interviews.map(interview => (
        <Card key={interview.id} className="p-4 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{interview.candidate?.name || 'Unknown Candidate'}</h3>
              <p className="text-sm text-gray-500">{interview.job?.title || 'Unknown Position'} • {interview.type?.replace('_', ' ')}</p>
            </div>
            <div className="text-right">
              <Badge variant={interview.status === 'scheduled' ? 'info' : interview.status === 'completed' ? 'success' : 'warning'}>{interview.status}</Badge>
              {interview.scheduled_at && <p className="text-sm mt-1">{new Date(interview.scheduled_at).toLocaleString()}</p>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
