'use client';

import { useState } from 'react';

export default function MatchingPage() {
  const [selectedJob, setSelectedJob] = useState('j1');
  const matches = [
    { candidate_id: 'c1', name: 'John Smith', score: 0.92, skill_match: 0.95, experience_match: 0.88, status: 'strong_match' },
    { candidate_id: 'c2', name: 'Sarah Chen', score: 0.89, skill_match: 0.92, experience_match: 0.85, status: 'strong_match' },
    { candidate_id: 'c3', name: 'Mike Johnson', score: 0.78, skill_match: 0.82, experience_match: 0.75, status: 'good_match' },
    { candidate_id: 'c4', name: 'Emily Davis', score: 0.75, skill_match: 0.78, experience_match: 0.72, status: 'good_match' },
    { candidate_id: 'c5', name: 'Alex Kim', score: 0.65, skill_match: 0.68, experience_match: 0.62, status: 'potential_match' },
  ];

  const scoreColor = (score: number) => score >= 0.9 ? 'text-green-600' : score >= 0.75 ? 'text-blue-600' : 'text-yellow-600';
  const statusBadge = (status: string) => {
    const badges: Record<string, string> = { strong_match: 'bg-green-100 text-green-800', good_match: 'bg-blue-100 text-blue-800', potential_match: 'bg-yellow-100 text-yellow-800' };
    return badges[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Candidate Matching</h1>
        <p className="text-gray-500">AI-powered candidate-job matching with semantic analysis</p>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Select Position</h2>
        <select value={selectedJob} onChange={(e) => setSelectedJob(e.target.value)} className="w-full rounded-lg border px-4 py-2">
          <option value="j1">Senior Backend Engineer</option>
          <option value="j2">Staff Frontend Engineer</option>
          <option value="j3">ML Engineer</option>
        </select>
      </div>

      <div className="space-y-3">
        {matches.map((match, i) => (
          <div key={match.candidate_id} className="bg-white rounded-xl border p-4 flex items-center gap-4">
            <span className="text-lg font-bold text-gray-400 w-8">#{i + 1}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{match.name}</h3>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(match.status)}`}>
                  {match.status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex gap-6 mt-2 text-sm text-gray-500">
                <span>Skill Match: <span className={scoreColor(match.skill_match)}>{Math.round(match.skill_match * 100)}%</span></span>
                <span>Experience: <span className={scoreColor(match.experience_match)}>{Math.round(match.experience_match * 100)}%</span></span>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${scoreColor(match.score)}`}>{Math.round(match.score * 100)}%</p>
              <p className="text-xs text-gray-500">Match Score</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
