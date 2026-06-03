'use client';

import { useState, useEffect } from 'react';
import { Briefcase, Loader2, Mail, MapPin, User } from 'lucide-react';
import { api } from '@/services/api/client';
import { EmptyState, Button, Skeleton, useToast } from '@/components';

const COLUMNS = [
  { id: 'active', title: 'Active', color: 'bg-blue-500' },
  { id: 'screening', title: 'Screening', color: 'bg-yellow-500' },
  { id: 'ppe', title: 'PPE', color: 'bg-amber-500' },
  { id: 'interviewing', title: 'Interview', color: 'bg-purple-500' },
  { id: 'offer', title: 'Offer', color: 'bg-green-500' },
  { id: 'hired', title: 'Hired', color: 'bg-emerald-600' },
  { id: 'rejected', title: 'Rejected', color: 'bg-gray-400' },
];

export default function PipelinePage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const { push, ToastContainer } = useToast();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.listCandidates({ limit: '200' });
      setCandidates(d?.data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load pipeline');
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const moveCandidate = async (id: string, newStatus: string) => {
    setMoving(id);
    try {
      const token = api.getToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/candidates/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      setCandidates((p) => p.map((c) => (c.id === id ? { ...c, status: newStatus } : c)));
      push('success', `Moved to ${newStatus}`);
    } catch (err: any) {
      push('error', err?.message || 'Failed to move candidate');
    } finally {
      setMoving(null);
    }
  };

  const byStatus: Record<string, any[]> = {};
  for (const col of COLUMNS) byStatus[col.id] = [];
  for (const c of candidates) {
    const s = c.status || 'active';
    if (byStatus[s]) byStatus[s].push(c);
    else byStatus[s] = [c];
  }

  return (
    <div className="space-y-6">
      <ToastContainer />
      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-gray-500 mt-1">
          {candidates.length} candidates across {COLUMNS.length} stages. Drag to move between stages.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {COLUMNS.map((c) => <Skeleton key={c.id} variant="rounded" height={300} />)}
        </div>
      ) : error ? (
        <EmptyState
          icon={<Briefcase className="h-12 w-12" />}
          title="Couldn’t load pipeline"
          description={error}
          action={<Button variant="primary" onClick={load}>Retry</Button>}
        />
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-12 w-12" />}
          title="No candidates in pipeline"
          description="Add candidates and they will appear here, organized by stage."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 overflow-x-auto">
          {COLUMNS.map((col) => {
            const list = byStatus[col.id] || [];
            return (
              <div
                key={col.id}
                className="bg-white rounded-xl border border-gray-200 p-3 min-h-[200px] flex flex-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) moveCandidate(id, col.id);
                }}
              >
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                  <h2 className="font-semibold text-sm text-gray-900 capitalize">{col.title}</h2>
                  <span className="text-xs text-gray-500 ml-auto bg-gray-100 rounded-full px-2 py-0.5 font-semibold">
                    {list.length}
                  </span>
                </div>
                <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
                  {list.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-6">No candidates</p>
                  ) : (
                    list.map((c) => {
                      const initials = (c.full_name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                      return (
                        <div
                          key={c.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                          className="bg-gray-50 hover:bg-white border border-gray-200 hover:border-blue-300 rounded-lg p-2.5 cursor-grab active:cursor-grabbing transition group"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                              {initials}
                            </div>
                            <p className="text-xs font-semibold text-gray-900 truncate flex-1">{c.full_name}</p>
                            {moving === c.id && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                          </div>
                          <p className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                            <Mail className="h-2.5 w-2.5" /> {c.email}
                          </p>
                          {c.location && (
                            <p className="text-[10px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                              <MapPin className="h-2.5 w-2.5" /> {c.location}
                            </p>
                          )}
                          {c.skills && c.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {c.skills.slice(0, 2).map((s: string) => (
                                <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                                  {s}
                                </span>
                              ))}
                              {c.skills.length > 2 && (
                                <span className="text-[9px] text-gray-400">+{c.skills.length - 2}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
