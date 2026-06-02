'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function MatchingPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setError('');
      const [jobsData, candidatesData] = await Promise.all([
        api.listJobs(),
        api.listCandidates()
      ]);
      setJobs(jobsData.data || []);
      setCandidates(candidatesData.data || []);
      if (jobsData.data?.length > 0) setSelectedJob(jobsData.data[0].id);
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (score: number) => score >= 0.9 ? 'text-green-600' : score >= 0.75 ? 'text-blue-600' : 'text-yellow-600';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Candidate Matching</h1>
        <p className="text-gray-500">AI-powered candidate-job matching with semantic analysis</p>
      </div>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Select Position</h2>
        <select value={selectedJob} onChange={(e) => setSelectedJob(e.target.value)} className="w-full rounded-lg border px-4 py-2">
          {jobs.map(job => (
            <option key={job.id} value={job.id}>{job.title}</option>
          ))}
        </select>
      </Card>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading candidates...</p>
      ) : (
        <div className="space-y-3">
          {candidates.map((candidate, i) => (
            <div key={candidate.id} className="bg-white rounded-xl border p-4 flex items-center gap-4">
              <span className="text-lg font-bold text-gray-400 w-8">#{i + 1}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{candidate.full_name}</h3>
                  <Badge variant={candidate.match_score != null ? (candidate.match_score >= 0.9 ? 'success' : candidate.match_score >= 0.75 ? 'info' : 'warning') : 'default'}>
                    {candidate.match_score != null ? (candidate.match_score >= 0.9 ? 'strong match' : candidate.match_score >= 0.75 ? 'good match' : 'potential match') : 'unmatched'}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500 mt-1">{candidate.email}</p>
              </div>
              {candidate.match_score != null && (
                <div className="text-right">
                  <p className={`text-2xl font-bold ${scoreColor(candidate.match_score)}`}>{Math.round(candidate.match_score * 100)}%</p>
                  <p className="text-xs text-gray-500">Match Score</p>
                </div>
              )}
            </div>
          ))}
          {candidates.length === 0 && <p className="text-gray-500">No candidates available for matching</p>}
        </div>
      )}
    </div>
  );
}
