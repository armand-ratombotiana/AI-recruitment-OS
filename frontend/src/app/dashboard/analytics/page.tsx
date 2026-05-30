'use client';
import { useState } from 'react';

const hireData = [
  { month: 'Aug', hires: 3, applications: 45 },
  { month: 'Sep', hires: 5, applications: 62 },
  { month: 'Oct', hires: 4, applications: 58 },
  { month: 'Nov', hires: 6, applications: 71 },
  { month: 'Dec', hires: 7, applications: 83 },
  { month: 'Jan', hires: 7, applications: 94 },
];

const pipelineData = [
  { name: 'Applied', value: 145, color: '#3b82f6' },
  { name: 'Screening', value: 89, color: '#06b6d4' },
  { name: 'Interview', value: 42, color: '#8b5cf6' },
  { name: 'Evaluation', value: 18, color: '#f59e0b' },
  { name: 'Offer', value: 7, color: '#22c55e' },
  { name: 'Hired', value: 3, color: '#10b981' },
];

const aiPerformance = [
  { metric: 'Resume Parsing Accuracy', value: 94.2, target: 95 },
  { metric: 'Skill Extraction F1', value: 89.7, target: 90 },
  { metric: 'Seniority Estimation', value: 86.3, target: 85 },
  { metric: 'PPE Evaluation Correlation', value: 91.5, target: 90 },
  { metric: 'Interview Pass Rate', value: 78.4, target: 80 },
];

const sourceData = [
  { name: 'LinkedIn', value: 42, color: '#0077b5' },
  { name: 'Referral', value: 28, color: '#22c55e' },
  { name: 'Direct', value: 18, color: '#8b5cf6' },
  { name: 'Agency', value: 12, color: '#f59e0b' },
];

const timeToHire = [
  { stage: 'Application', days: 0 }, { stage: 'Screening', days: 1.2 },
  { stage: 'Interview', days: 5.4 }, { stage: 'Evaluation', days: 7.1 },
  { stage: 'Offer', days: 10.3 }, { stage: 'Hired', days: 14.7 },
];

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('30d');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-gray-500">Recruitment performance and AI metrics</p>
        </div>
        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Candidates', value: '1,247', color: 'bg-blue-100 text-blue-600' },
          { label: 'Total Hires', value: '32', color: 'bg-green-100 text-green-600' },
          { label: 'Avg Time to Hire', value: '14.7d', color: 'bg-purple-100 text-purple-600' },
          { label: 'AI Eval Accuracy', value: '91.5%', color: 'bg-amber-100 text-amber-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-2 ${kpi.color}`}><span className="font-bold">•</span></div>
              <div><p className="text-2xl font-bold">{kpi.value}</p><p className="text-xs text-gray-500">{kpi.label}</p></div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Hires Over Time</h3>
          <div className="flex items-end gap-2 h-48">
            {hireData.map((d) => (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-medium">{d.hires}</span>
                <div className="w-full bg-blue-500 rounded-t" style={{ height: `${(d.hires / 10) * 100}%` }} />
                <span className="text-xs text-gray-500">{d.month}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Pipeline Distribution</h3>
          <div className="space-y-3">
            {pipelineData.map((item) => (
              <div key={item.name} className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-gray-600 w-24">{item.name}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full">
                  <div className="h-2 rounded-full" style={{ width: `${(item.value / 145) * 100}%`, backgroundColor: item.color }} />
                </div>
                <span className="text-sm font-medium w-10 text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">AI Performance Metrics</h3>
          <div className="space-y-4">
            {aiPerformance.map((metric) => (
              <div key={metric.metric}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600">{metric.metric}</span>
                  <span className={`font-medium ${metric.value >= metric.target ? 'text-green-600' : 'text-amber-600'}`}>{metric.value}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className={`h-2 rounded-full ${metric.value >= metric.target ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${metric.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Candidate Sources</h3>
          <div className="space-y-3">
            {sourceData.map((item) => (
              <div key={item.name} className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-gray-600 w-20">{item.name}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full">
                  <div className="h-2 rounded-full" style={{ width: `${item.value}%`, backgroundColor: item.color }} />
                </div>
                <span className="text-sm font-medium">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-lg font-semibold mb-4">Time to Hire — Funnel</h3>
        <div className="flex items-end gap-4 h-40">
          {timeToHire.map((stage) => (
            <div key={stage.stage} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs font-medium">{stage.days > 0 ? `${stage.days}d` : '-'}</span>
              <div className="w-full rounded-t-lg bg-blue-500" style={{ height: `${(stage.days / 15) * 100}%`, minHeight: '8px' }} />
              <span className="text-xs text-gray-500">{stage.stage}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
