'use client';

const COLUMNS = [
  { title: 'Applied', color: 'bg-blue-500', candidates: ['Alice Johnson', 'Bob Smith'] },
  { title: 'Screening', color: 'bg-yellow-500', candidates: ['Carol White'] },
  { title: 'Interview', color: 'bg-purple-500', candidates: ['David Brown', 'Eve Davis'] },
  { title: 'Offer', color: 'bg-green-500', candidates: ['Frank Wilson'] },
];

export default function PipelinePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pipeline</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map(col => (
          <div key={col.title} className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className={`h-3 w-3 rounded-full ${col.color}`} />
              <h2 className="font-semibold">{col.title}</h2>
              <span className="text-sm text-gray-500 ml-auto">{col.candidates.length}</span>
            </div>
            <div className="space-y-2">
              {col.candidates.map(name => (
                <div key={name} className="bg-gray-50 rounded-lg p-3 text-sm font-medium cursor-pointer hover:bg-gray-100 transition">{name}</div>
              ))}
              {col.candidates.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No candidates</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
