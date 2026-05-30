'use client';

import { useState } from 'react';

export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState('2025-01-22');
  
  const slots = [
    { time: '09:00', candidate: 'John Smith', type: 'Technical', interviewer: 'Alex Chen', status: 'confirmed' },
    { time: '10:00', candidate: null, type: null, interviewer: null, status: 'available' },
    { time: '11:00', candidate: 'Sarah Chen', type: 'System Design', interviewer: 'Maria Garcia', status: 'confirmed' },
    { time: '13:00', candidate: null, type: null, interviewer: null, status: 'available' },
    { time: '14:00', candidate: 'Mike Johnson', type: 'PPE', interviewer: 'AI Agent', status: 'scheduled' },
    { time: '15:00', candidate: null, type: null, interviewer: null, status: 'available' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Interview Scheduling</h1>
        <p className="text-gray-500">AI-optimized interview scheduling</p>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Schedule</h2>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm" />
        </div>
        <div className="space-y-2">
          {slots.map((slot, i) => (
            <div key={i} className={`flex items-center gap-4 p-3 rounded-lg ${slot.status === 'available' ? 'border border-dashed border-gray-300' : 'border border-gray-200 bg-white'}`}>
              <span className="w-16 text-sm font-medium text-gray-600">{slot.time}</span>
              {slot.candidate ? (
                <>
                  <div className="flex-1">
                    <p className="font-medium">{slot.candidate}</p>
                    <p className="text-sm text-gray-500">{slot.type} with {slot.interviewer}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${slot.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                    {slot.status}
                  </span>
                </>
              ) : (
                <span className="text-sm text-gray-400">Available</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
