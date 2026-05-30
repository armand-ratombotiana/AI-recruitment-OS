'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function InterviewDetailPage({ params }: { params: { id: string } }) {
  const interview = {
    id: params.id,
    candidate: { name: 'John Smith', email: 'john@email.com' },
    job: { title: 'Senior Backend Engineer' },
    type: 'pair_programming',
    status: 'scheduled',
    scheduled_at: '2025-01-22T10:00:00Z',
    interviewer: 'AI PPE Agent',
    is_ai_interview: true,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <a href="/dashboard/interviews" className="text-gray-400 hover:text-gray-600">← Back</a>
        <div>
          <h1 className="text-2xl font-bold">Interview Details</h1>
          <p className="text-gray-500">{interview.candidate.name} — {interview.job.title}</p>
        </div>
        <Badge variant={interview.status === 'scheduled' ? 'info' : 'success'}>{interview.status}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Interview Info</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="font-medium capitalize">{interview.type.replace('_', ' ')}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Scheduled</span><span className="font-medium">{new Date(interview.scheduled_at).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Interviewer</span><span className="font-medium">{interview.interviewer}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">AI Interview</span><span className="font-medium">{interview.is_ai_interview ? 'Yes' : 'No'}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Join Interview</button>
            <button className="w-full px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">View Transcript</button>
            <button className="w-full px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Reschedule</button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
