'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/services/api/client';
import { EmptyState, Button, Skeleton, useToast } from '@/components';

interface CandidateWithScore {
  id: string;
  full_name: string;
  email: string;
  status?: string;
  match_score?: number;
  factors?: Record<string, number>;
  matching_skills?: string[];
  missing_skills?: string[];
  recommendation?: string;
  matching?: boolean;
}

export default function MatchingPage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [scored, setScored] = useState<Record<string, CandidateWithScore>>({});
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push, ToastContainer } = useToast();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, j] = await Promise.all([api.listCandidates({ limit: '20' }), api.listJobs({ limit: '10' })]);
      setCandidates(c?.data || []);
      setJobs(j?.data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load candidates/jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runMatching = async () => {
    if (candidates.length === 0) return;
    setScoring(true);
    const next: Record<string, CandidateWithScore> = {};
    for (const c of candidates.slice(0, 10)) {
      try {
        const r = await api.matchCandidate(c.id);
        const result = r?.result || r;
        next[c.id] = {
          ...c,
          match_score: typeof result.match_score === 'number' ? result.match_score : undefined,
          factors: result.factors || {},
          matching_skills: result.matching_skills || [],
          missing_skills: result.missing_skills || [],
          recommendation: result.recommendation,
          matching: true,
        };
      } catch (err) {
        next[c.id] = { ...c, matching: false };
      }
    }
    setScored(next);
    setScoring(false);
    push('success', 'AI matching complete');
  };

  const list = candidates.slice(0, 10).map((c) => scored[c.id] || c);

  return (
    <div className="space-y-6">
      <ToastContainer />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-blue-600" />
          AI Matching
        </h1>
        <Button
          variant="primary"
          onClick={runMatching}
          loading={scoring}
          disabled={loading || candidates.length === 0}
          leftIcon={scoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        >
          {scoring ? 'Scoring…' : 'Run AI matching'}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton variant="rounded" height={400} />
          <Skeleton variant="rounded" height={400} />
        </div>
      ) : error ? (
        <EmptyState
          icon={<Sparkles className="h-12 w-12" />}
          title="Couldn’t load data"
          description={error}
          action={<Button variant="primary" onClick={load}>Retry</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Top Candidates</h2>
              {scoring && <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Scoring…</span>}
            </div>
            <div className="space-y-3">
              {list.length === 0 ? (
                <p className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">No candidates yet</p>
              ) : (
                list.map((c) => {
                  const score = typeof c.match_score === 'number' ? c.match_score * 100 : null;
                  return (
                    <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{c.full_name || '—'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.email}</p>
                        {c.recommendation && (
                          <p className="text-[10px] text-purple-700 mt-0.5 italic">{c.recommendation}</p>
                        )}
                      </div>
                      {score !== null ? (
                        <span className={`ml-2 px-2 py-1 rounded-full text-xs font-bold ${
                          score >= 80 ? 'bg-green-100 text-green-700' : score >= 60 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {Math.round(score)}%
                        </span>
                      ) : (
                        <span className="ml-2 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">—</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Open Positions</h2>
            <div className="space-y-3">
              {jobs.length === 0 ? (
                <p className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">No open positions</p>
              ) : (
                jobs.map((j) => (
                  <div key={j.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="font-medium text-sm text-gray-900 dark:text-white">{j.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{j.department || 'General'} · {j.location || 'Remote'}</p>
                    {Array.isArray(j.skills) && j.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {j.skills.slice(0, 4).map((s: string) => (
                          <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && !error && Object.keys(scored).length > 0 && (
        <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            Match factor breakdown
          </h2>
          <div className="space-y-2">
            {Object.values(scored)
              .filter((c) => c.factors && Object.keys(c.factors).length > 0)
              .slice(0, 5)
              .map((c) => (
                <div key={c.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{c.full_name}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(c.factors || {}).map(([k, v]) => {
                      const pct = typeof v === 'number' ? Math.round(v * 100) : 0;
                      return (
                        <div key={k}>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{k.replace(/_/g, ' ')}</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-9 text-right">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {Array.isArray(c.matching_skills) && c.matching_skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.matching_skills.slice(0, 5).map((s) => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium">✓ {s}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
