'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const mockJob = {
  id: '1', title: 'Senior Backend Engineer', department: 'Engineering', location: 'San Francisco, CA',
  remote: 'hybrid', status: 'open', salary: '$180k-$220k', created_at: '2025-01-10', applicants: 24,
  description: 'We are looking for a Senior Backend Engineer to join our team and help build scalable distributed systems that handle millions of requests daily.',
  requirements: ['5+ years backend development', 'Strong Python/Go/Java', 'Distributed systems experience', 'PostgreSQL, Redis, Kafka', 'AWS/GCP cloud services'],
  responsibilities: ['Design scalable backend services', 'Lead architecture decisions', 'Mentor junior engineers', 'Collaborate with product teams'],
  benefits: ['Competitive salary + equity', 'Health/dental/vision', 'Flexible PTO', 'Remote-friendly'],
  pipeline: [
    { stage: 'Applied', count: 24 },
    { stage: 'Screening', count: 12 },
    { stage: 'Interviewing', count: 6 },
    { stage: 'Offer', count: 2 },
    { stage: 'Hired', count: 0 },
  ],
  team: [
    { name: 'Sarah Chen', role: 'Hiring Manager' },
    { name: 'Mike Johnson', role: 'Technical Lead' },
    { name: 'Emily Davis', role: 'HR Partner' },
  ],
};

export default function JobDetailPage() {
  const params = useParams();
  const [activeTab, setActiveTab] = useState('description');
  const job = mockJob;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/jobs" className="rounded-lg p-2 hover:bg-gray-100">← Back</Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{job.title}</h1>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">{job.status}</span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
            <span>💼 {job.department}</span>
            <span>📍 {job.location}</span>
            <span>🏠 {job.remote}</span>
            <span className="text-green-600 font-medium">💰 {job.salary}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{job.applicants}</p>
          <p className="text-sm text-gray-500">Total Applicants</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-3xl font-bold text-yellow-600">{job.pipeline[1].count}</p>
          <p className="text-sm text-gray-500">In Screening</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-3xl font-bold text-purple-600">{job.pipeline[2].count}</p>
          <p className="text-sm text-gray-500">Interviewing</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{job.pipeline[4].count}</p>
          <p className="text-sm text-gray-500">Hired</p>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {['description', 'pipeline', 'team'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'description' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-white rounded-xl border p-6">
            <h3 className="font-semibold mb-3">About the Role</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-6">{job.description}</p>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Requirements</h4>
                <ul className="space-y-1">{job.requirements.map((r, i) => <li key={i} className="text-sm text-gray-600">• {r}</li>)}</ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Responsibilities</h4>
                <ul className="space-y-1">{job.responsibilities.map((r, i) => <li key={i} className="text-sm text-gray-600">• {r}</li>)}</ul>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold mb-3">Benefits</h3>
              <ul className="space-y-2">{job.benefits.map((b, i) => <li key={i} className="text-sm text-gray-600 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />{b}</li>)}</ul>
            </div>
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold mb-3">Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Posted</span><span className="font-medium">{job.created_at}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="font-medium">Full-time</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold mb-4">Pipeline Funnel</h3>
          <div className="flex items-end gap-4 h-40">
            {job.pipeline.map((stage) => (
              <div key={stage.stage} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-medium">{stage.count}</span>
                <div className="w-full rounded-t-lg bg-blue-500" style={{ height: `${(stage.count / 24) * 100}%`, minHeight: '8px' }} />
                <span className="text-xs text-gray-500">{stage.stage}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold mb-4">Hiring Team</h3>
          <div className="grid grid-cols-3 gap-4">
            {job.team.map((member, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-4">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">{member.name[0]}</div>
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-gray-500">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
