'use client';
import { useState } from 'react';

const mockCandidates = [
  { id: '1', full_name: 'Sarah Chen', email: 'sarah.chen@email.com', seniority: 'Staff', match_score: 92, status: 'interviewing' },
  { id: '2', full_name: 'James Wilson', email: 'james.w@email.com', seniority: 'Principal', match_score: 95, status: 'offer' },
  { id: '3', full_name: 'David Park', email: 'david.p@email.com', seniority: 'Senior', match_score: 91, status: 'interviewing' },
  { id: '4', full_name: 'John Smith', email: 'john.smith@email.com', seniority: 'Senior', match_score: 87, status: 'screening' },
  { id: '5', full_name: 'Emily Davis', email: 'emily.d@email.com', seniority: 'Senior', match_score: 83, status: 'screening' },
  { id: '6', full_name: 'Alex Kim', email: 'alex.kim@email.com', seniority: 'Mid', match_score: 79, status: 'hired' },
  { id: '7', full_name: 'Lisa Wang', email: 'lisa.w@email.com', seniority: 'Mid', match_score: 77, status: 'new' },
  { id: '8', full_name: 'Mike Johnson', email: 'mike.j@email.com', seniority: 'Mid', match_score: 75, status: 'new' },
];

const mockJobs = [
  { id: '1', title: 'Senior Backend Engineer' },
  { id: '2', title: 'Staff Frontend Engineer' },
  { id: '3', title: 'ML Engineer' },
];

export default function MatchingPage() {
  const [selectedJob, setSelectedJob] = useState('1');

  const scoreColor = (score: number) => score >= 90 ? 'text-green-600' : score >= 80 ? 'text-blue-600' : 'text-yellow-600';
  const scoreBadge = (score: number) => score >= 90 ? 'bg-green-100 text-green-800' : score >= 80 ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800';
  const scoreLabel = (score: number) => score >= 90 ? 'strong match' : score >= 80 ? 'good match' : 'potential match';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Candidate Matching</h1>
        <p className="text-sm text-gray-500">AI-powered candidate-job matching with semantic analysis</p>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Select Position</h2>
        <select value={selectedJob} onChange={(e) => setSelectedJob(e.target.value)} className="w-full rounded-lg border px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
          {mockJobs.map(job => (
            <option key={job.id} value={job.id}>{job.title}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {mockCandidates.map((candidate, i) => (
          <div key={candidate.id} className="bg-white rounded-xl border p-4 flex items-center gap-4 hover:shadow-sm transition">
            <span className="text-lg font-bold text-gray-400 w-8">#{i + 1}</span>
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-700">{candidate.full_name[0]}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{candidate.full_name}</h3>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${scoreBadge(candidate.match_score)}`}>{scoreLabel(candidate.match_score)}</span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{candidate.email} · {candidate.seniority}</p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${scoreColor(candidate.match_score)}`}>{candidate.match_score}%</p>
              <p className="text-xs text-gray-500">Match Score</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
