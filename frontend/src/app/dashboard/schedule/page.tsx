'use client';

const EVENTS = [
  { time: '09:00', title: 'Interview - Alice Johnson', type: 'interview', color: 'border-purple-500 bg-purple-50' },
  { time: '10:30', title: 'Team Standup', type: 'meeting', color: 'border-blue-500 bg-blue-50' },
  { time: '13:00', title: 'PPE Review - Bob Smith', type: 'ppe', color: 'border-green-500 bg-green-50' },
  { time: '15:00', title: 'Debrief - David Brown', type: 'meeting', color: 'border-blue-500 bg-blue-50' },
];

export default function SchedulePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Schedule</h1>
        <div className="flex gap-2">
          {['Today','This Week','This Month'].map(p => <button key={p} className={`px-3 py-1 rounded-lg text-sm ${p==='Today' ? 'bg-blue-600 text-white' : 'border hover:bg-gray-50'}`}>{p}</button>)}
        </div>
      </div>
      <div className="bg-white rounded-xl border p-6">
        <div className="space-y-4">
          {EVENTS.map((e, i) => (
            <div key={i} className={`flex items-center gap-4 p-4 rounded-lg border-l-4 ${e.color}`}>
              <span className="text-sm font-mono font-medium text-gray-500 w-16">{e.time}</span>
              <div>
                <p className="font-medium text-sm">{e.title}</p>
                <p className="text-xs text-gray-500 capitalize">{e.type}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
