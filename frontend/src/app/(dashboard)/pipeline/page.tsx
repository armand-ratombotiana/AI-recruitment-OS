'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Candidate {
  id: string;
  full_name: string;
  email: string;
  status: string;
  seniority_level: string;
  match_score: number;
}

const STAGES = [
  { id: 'new', label: 'New', color: 'bg-gray-100', textColor: 'text-gray-700' },
  { id: 'screening', label: 'Screening', color: 'bg-blue-100', textColor: 'text-blue-700' },
  { id: 'interviewing', label: 'Interviewing', color: 'bg-purple-100', textColor: 'text-purple-700' },
  { id: 'evaluation', label: 'Evaluation', color: 'bg-amber-100', textColor: 'text-amber-700' },
  { id: 'offer', label: 'Offer', color: 'bg-green-100', textColor: 'text-green-700' },
  { id: 'hired', label: 'Hired', color: 'bg-emerald-100', textColor: 'text-emerald-700' },
];

export default function PipelinePage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draggedCandidate, setDraggedCandidate] = useState<Candidate | null>(null);

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.listCandidates();
      setCandidates(data.data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (candidate: Candidate) => {
    setDraggedCandidate(candidate);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (stage: string) => {
    if (draggedCandidate) {
      setCandidates(prev => prev.map(c => 
        c.id === draggedCandidate.id ? { ...c, status: stage } : c
      ));
      setDraggedCandidate(null);
    }
  };

  const getCandidatesByStage = (stage: string) => {
    return candidates.filter(c => c.status === stage);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Candidate Pipeline</h1>
          <p className="text-gray-500">Drag and drop candidates between stages</p>
        </div>
        <button onClick={fetchCandidates} className="text-sm text-blue-600 hover:text-blue-700">Refresh</button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '500px' }}>
        {STAGES.map(stage => {
          const stageCandidates = getCandidatesByStage(stage.id);
          return (
            <div
              key={stage.id}
              className="flex-shrink-0 w-72"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(stage.id)}
            >
              <div className={`rounded-t-lg px-4 py-2 ${stage.color} ${stage.textColor}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{stage.label}</span>
                  <span className="text-sm">{stageCandidates.length}</span>
                </div>
              </div>
              <div className={`rounded-b-lg ${stage.color} min-h-[400px] p-2 space-y-2`}>
                {loading ? (
                  <div className="text-center py-8 text-gray-400">Loading...</div>
                ) : stageCandidates.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">No candidates</div>
                ) : (
                  stageCandidates.map(candidate => (
                    <div
                      key={candidate.id}
                      draggable
                      onDragStart={() => handleDragStart(candidate)}
                      className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-grab hover:shadow-md transition"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{candidate.full_name}</span>
                        {candidate.match_score != null && (
                          <span className="text-xs font-medium text-blue-600">{Math.round(candidate.match_score * 100)}%</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{candidate.seniority_level}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
