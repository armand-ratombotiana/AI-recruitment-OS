'use client';
import { useState } from 'react';

const mockInterviews = [
  { id: '1', candidate: 'Sarah Chen', job: 'Staff Frontend Engineer', type: 'behavioral', status: 'scheduled', date: '2026-05-31T10:00:00Z', is_ai: true, duration: 45 },
  { id: '2', candidate: 'John Smith', job: 'Senior Backend Engineer', type: 'technical', status: 'scheduled', date: '2026-05-31T14:00:00Z', is_ai: false, duration: 60 },
  { id: '3', candidate: 'Emily Davis', job: 'ML Engineer', type: 'coding', status: 'scheduled', date: '2026-06-01T09:00:00Z', is_ai: true, duration: 90 },
  { id: '4', candidate: 'David Park', job: 'Senior Backend Engineer', type: 'system_design', status: 'scheduled', date: '2026-06-01T15:00:00Z', is_ai: false, duration: 60 },
  { id: '5', candidate: 'Mike Johnson', job: 'ML Engineer', type: 'hr_screening', status: 'completed', date: '2026-05-30T11:00:00Z', is_ai: false, duration: 30 },
];

const typeLabels: Record<string, string> = {
  hr_screening: 'HR Screening', technical: 'Technical', behavioral: 'Behavioral',
  pair_programming: 'Pair Programming', system_design: 'System Design', coding: 'Coding',
};

export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const filteredInterviews = mockInterviews.filter(i => {
    if (!i.date) return false;
    return i.date.startsWith(selectedDate);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Interview Scheduling</h1>
        <p className="text-sm text-gray-500">AI-optimized interview scheduling</p>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Schedule</h2>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </div>
        <div className="space-y-2">
          {filteredInterviews.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No interviews scheduled for this date</p>
          ) : (
            filteredInterviews.map((interview) => (
              <div key={interview.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
                <span className="w-16 text-sm font-medium text-gray-600">
                  {new Date(interview.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-sm">{interview.candidate}</p>
                  <p className="text-xs text-gray-500">{typeLabels[interview.type]} · {interview.job} · {interview.duration}min</p>
                </div>
                {interview.is_ai && <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800">AI</span>}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${interview.status === 'scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{interview.status}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
