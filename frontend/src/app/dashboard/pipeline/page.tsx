'use client';
import { useState } from 'react';

interface Candidate {
  id: string;
  full_name: string;
  email: string;
  status: string;
  seniority: string;
  match_score: number;
  location: string;
}

const mockCandidates: Candidate[] = [
  { id: '1', full_name: 'John Smith', email: 'john.smith@email.com', status: 'screening', seniority: 'Senior', match_score: 87, location: 'San Francisco, CA' },
  { id: '2', full_name: 'Sarah Chen', email: 'sarah.chen@email.com', status: 'interviewing', seniority: 'Staff', match_score: 92, location: 'New York, NY' },
  { id: '3', full_name: 'Mike Johnson', email: 'mike.j@email.com', status: 'new', seniority: 'Mid', match_score: 75, location: 'Austin, TX' },
  { id: '4', full_name: 'Emily Davis', email: 'emily.d@email.com', status: 'screening', seniority: 'Senior', match_score: 83, location: 'Remote' },
  { id: '5', full_name: 'Alex Kim', email: 'alex.kim@email.com', status: 'hired', seniority: 'Mid', match_score: 79, location: 'Seattle, WA' },
  { id: '6', full_name: 'Rachel Green', email: 'rachel.g@email.com', status: 'new', seniority: 'Junior', match_score: 68, location: 'Chicago, IL' },
  { id: '7', full_name: 'David Park', email: 'david.p@email.com', status: 'interviewing', seniority: 'Senior', match_score: 91, location: 'Los Angeles, CA' },
  { id: '8', full_name: 'Lisa Wang', email: 'lisa.w@email.com', status: 'new', seniority: 'Mid', match_score: 77, location: 'San Francisco, CA' },
  { id: '9', full_name: 'James Wilson', email: 'james.w@email.com', status: 'offer', seniority: 'Principal', match_score: 95, location: 'Boston, MA' },
  { id: '10', full_name: 'Maria Garcia', email: 'maria.g@email.com', status: 'evaluation', seniority: 'Mid', match_score: 52, location: 'Miami, FL' },
];

const STAGES = [
  { id: 'new', label: 'New', color: 'bg-gray-100', textColor: 'text-gray-700', headerBg: 'bg-gray-200' },
  { id: 'screening', label: 'Screening', color: 'bg-blue-50', textColor: 'text-blue-700', headerBg: 'bg-blue-100' },
  { id: 'interviewing', label: 'Interviewing', color: 'bg-purple-50', textColor: 'text-purple-700', headerBg: 'bg-purple-100' },
  { id: 'evaluation', label: 'Evaluation', color: 'bg-amber-50', textColor: 'text-amber-700', headerBg: 'bg-amber-100' },
  { id: 'offer', label: 'Offer', color: 'bg-green-50', textColor: 'text-green-700', headerBg: 'bg-green-100' },
  { id: 'hired', label: 'Hired', color: 'bg-emerald-50', textColor: 'text-emerald-700', headerBg: 'bg-emerald-100' },
];

export default function PipelinePage() {
  const [candidates, setCandidates] = useState<Candidate[]>(mockCandidates);
  const [draggedCandidate, setDraggedCandidate] = useState<Candidate | null>(null);

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
      <div>
        <h1 className="text-2xl font-bold">Candidate Pipeline</h1>
        <p className="text-sm text-gray-500">Drag and drop candidates between stages</p>
      </div>

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
              <div className={`rounded-t-lg px-4 py-2 ${stage.headerBg} ${stage.textColor}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{stage.label}</span>
                  <span className="text-xs font-medium bg-white rounded-full px-2 py-0.5">{stageCandidates.length}</span>
                </div>
              </div>
              <div className={`rounded-b-lg ${stage.color} min-h-[400px] p-2 space-y-2`}>
                {stageCandidates.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">No candidates</div>
                ) : (
                  stageCandidates.map(candidate => (
                    <div
                      key={candidate.id}
                      draggable
                      onDragStart={() => handleDragStart(candidate)}
                      className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-grab hover:shadow-md transition"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{candidate.full_name}</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{candidate.seniority} · {candidate.location}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full">
                          <div className={`h-1.5 rounded-full ${candidate.match_score >= 80 ? 'bg-green-500' : candidate.match_score >= 60 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${candidate.match_score}%` }} />
                        </div>
                        <span className="text-xs font-medium">{candidate.match_score}%</span>
                      </div>
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
