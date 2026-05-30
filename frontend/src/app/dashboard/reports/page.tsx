'use client';

export default function ReportsPage() {
  const reports = [
    { name: 'Hiring Funnel Report', description: 'Conversion rates through pipeline stages', status: 'Ready' },
    { name: 'Candidate Quality Report', description: 'AI evaluation scores and trends', status: 'Ready' },
    { name: 'Recruiter Productivity', description: 'Recruiter performance metrics', status: 'Ready' },
    { name: 'Time-to-Hire Analysis', description: 'Average time in each stage', status: 'Ready' },
    { name: 'AI Performance Report', description: 'AI agent accuracy and efficiency', status: 'Ready' },
    { name: 'Compliance Report', description: 'GDPR and compliance status', status: 'Ready' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>
      <p className="text-gray-600">Generate and view recruitment reports.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => (
          <div key={report.name} className="p-6 bg-white rounded-lg border hover:shadow-lg transition-shadow cursor-pointer">
            <h2 className="text-lg font-semibold mb-2">{report.name}</h2>
            <p className="text-gray-600 text-sm mb-4">{report.description}</p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              {report.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
