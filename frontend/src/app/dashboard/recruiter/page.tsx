'use client';
import Link from 'next/link';

export default function RecruiterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-500">Welcome back. Here is your recruitment overview.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Candidates', value: '1,247', change: '+12%', color: 'text-blue-600', bg: 'bg-blue-100' },
          { label: 'Open Positions', value: '23', change: '+3', color: 'text-green-600', bg: 'bg-green-100' },
          { label: 'Active Interviews', value: '18', change: '5 today', color: 'text-purple-600', bg: 'bg-purple-100' },
          { label: 'Hires This Month', value: '7', change: '+40%', color: 'text-amber-600', bg: 'bg-amber-100' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-green-600 mt-1">{stat.change}</p>
              </div>
              <div className={`rounded-xl p-3 ${stat.bg}`}>
                <span className={`text-lg font-bold ${stat.color}`}>•</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Pipeline Overview</h3>
          <div className="space-y-3">
            {[
              { stage: 'Applied', count: 145, color: 'bg-blue-500' },
              { stage: 'Screening', count: 89, color: 'bg-cyan-500' },
              { stage: 'Interview', count: 42, color: 'bg-purple-500' },
              { stage: 'Evaluation', count: 18, color: 'bg-amber-500' },
              { stage: 'Offer', count: 7, color: 'bg-green-500' },
              { stage: 'Hired', count: 3, color: 'bg-emerald-600' },
            ].map((s) => (
              <div key={s.stage} className="flex items-center gap-3">
                <span className="w-24 text-sm text-gray-600">{s.stage}</span>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className={`h-2 rounded-full ${s.color}`} style={{ width: `${(s.count / 145) * 100}%` }} />
                  </div>
                </div>
                <span className="w-10 text-right text-sm font-medium">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {[
              { id: 1, message: 'John Smith completed PPE interview', time: '15 min ago', color: 'text-green-500' },
              { id: 2, message: 'New application from Sarah Chen', time: '32 min ago', color: 'text-blue-500' },
              { id: 3, message: 'AI evaluation completed for Mike Johnson', time: '1 hr ago', color: 'text-green-500' },
              { id: 4, message: 'Interview scheduled with Emily Davis', time: '2 hr ago', color: 'text-amber-500' },
              { id: 5, message: 'Offer accepted by Alex Kim', time: '3 hr ago', color: 'text-emerald-500' },
            ].map((a) => (
              <div key={a.id} className="flex gap-3">
                <span className={`mt-1 h-2 w-2 rounded-full ${a.color.replace('text-', 'bg-')}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{a.message}</p>
                  <p className="text-xs text-gray-500">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'View Candidates', href: '/dashboard/candidates' },
            { label: 'Manage Jobs', href: '/dashboard/jobs' },
            { label: 'Start PPE Session', href: '/dashboard/ppe' },
            { label: 'View Analytics', href: '/dashboard/analytics' },
          ].map((action) => (
            <Link key={action.href} href={action.href}
              className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-gray-50 transition-colors">
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
