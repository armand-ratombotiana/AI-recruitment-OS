'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchInterviews();
  }, []);

  const fetchInterviews = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.listInterviews();
      setInterviews(data.data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load interviews');
    } finally {
      setLoading(false);
    }
  };

  const filteredInterviews = interviews.filter(i => {
    if (!i.scheduled_at) return false;
    return i.scheduled_at.startsWith(selectedDate);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Interview Scheduling</h1>
        <p className="text-gray-500">AI-optimized interview scheduling</p>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Schedule</h2>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
        </div>
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">{error}</div>
        )}
        {loading ? (
          <p className="text-gray-500">Loading schedule...</p>
        ) : (
          <div className="space-y-2">
            {filteredInterviews.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No interviews scheduled for this date</p>
            ) : (
              filteredInterviews.map((interview, i) => (
                <div key={interview.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 bg-white">
                  <span className="w-16 text-sm font-medium text-gray-600">
                    {interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{interview.candidate?.name || 'Unknown Candidate'}</p>
                    <p className="text-sm text-gray-500">{interview.type?.replace('_', ' ')} • {interview.job?.title || 'Unknown Position'}</p>
                  </div>
                  <Badge variant={interview.status === 'scheduled' ? 'info' : interview.status === 'completed' ? 'success' : 'warning'}>
                    {interview.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
