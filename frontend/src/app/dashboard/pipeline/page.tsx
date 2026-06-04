'use client';

import { useState, useEffect, useCallback } from 'react';
import { Briefcase, Loader2, Mail, MapPin, RefreshCw } from 'lucide-react';
import { api } from '@/services/api/client';
import { EmptyState, Button, Skeleton, useToast, Modal, ConfirmDialog } from '@/components';

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
  const [detail, setDetail] = useState<any | null>(null);
  const [confirmMove, setConfirmMove] = useState<{ id: string; from: string; to: string } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { push, ToastContainer } = useToast();

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const d: any = await api.candidates.list({ page_size: '100' });
      const items = Array.isArray(d) ? d : (d?.data || d?.items || []);
      setCandidates(items);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err?.message || 'Failed to load pipeline');
      if (!isBackground) setCandidates([]);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load(true), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const doMove = async (id: string, newStatus: string) => {
    setMoving(id);
    try {
      await api.updateCandidate(id, { status: newStatus });
      setCandidates((p) => p.map((c) => (c.id === id ? { ...c, status: newStatus } : c)));
      push('success', `Moved to ${newStatus}`);
    } catch (err: any) {
      push('error', err?.message || 'Failed to move candidate');
    } finally {
      setMoving(null);
    }
  };

  const moveCandidate = (id: string, newStatus: string) => {
    const current = candidates.find((c) => c.id === id);
    if (newStatus === 'rejected' || newStatus === 'hired') {
      setConfirmMove({ id, from: current?.status || 'unknown', to: newStatus });
    } else {
      doMove(id, newStatus);
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
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pipeline</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {candidates.length} candidates across {COLUMNS.length} stages. Drag to move between stages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 inline-flex items-center gap-1.5" aria-live="polite">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 pulse-dot" aria-hidden="true" />
              Live · {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => load(false)} aria-label="Refresh pipeline">
            Refresh
          </Button>
        </div>
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
          action={<Button variant="primary" onClick={() => load(false)}>Retry</Button>}
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
                className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-3 min-h-[200px] flex flex-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) moveCandidate(id, col.id);
                }}
              >
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                  <h2 className="font-semibold text-sm text-gray-900 dark:text-gray-100 capitalize">{col.title}</h2>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto bg-gray-100 dark:bg-surface-800 rounded-full px-2 py-0.5 font-semibold">
                    {list.length}
                  </span>
                </div>
                <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
                  {list.length === 0 ? (
                    <p className="text-xs text-gray-300 dark:text-gray-600 text-center py-6">No candidates</p>
                  ) : (
                    list.map((c) => {
                      const initials = (c.full_name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                      return (
                        <div
                          key={c.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                          onClick={() => setDetail(c)}
                          className="bg-gray-50 dark:bg-surface-800 hover:bg-white dark:hover:bg-surface-700 border border-gray-200 dark:border-surface-700 hover:border-blue-300 dark:hover:border-brand-500/40 rounded-lg p-2.5 cursor-grab active:cursor-grabbing transition group"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                              {initials}
                            </div>
                            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate flex-1">{c.full_name}</p>
                            {moving === c.id && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                          </div>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                            <Mail className="h-2.5 w-2.5" /> {c.email}
                          </p>
                          {c.location && (
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1 mt-0.5">
                              <MapPin className="h-2.5 w-2.5" /> {c.location}
                            </p>
                          )}
                          {c.skills && c.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {c.skills.slice(0, 2).map((s: string) => (
                                <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-brand-500/20 text-blue-700 dark:text-brand-300 font-medium">
                                  {s}
                                </span>
                              ))}
                              {c.skills.length > 2 && (
                                <span className="text-[9px] text-gray-400 dark:text-gray-500">+{c.skills.length - 2}</span>
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

      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail?.full_name || 'Candidate'} size="md">
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                {(detail.full_name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{detail.full_name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{detail.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2 bg-gray-50 dark:bg-surface-800 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
                <p className="font-semibold capitalize text-gray-900 dark:text-gray-100">{detail.status || '—'}</p>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-surface-800 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">Location</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{detail.location || '—'}</p>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-surface-800 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">Experience</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{detail.experience_years ? `${detail.experience_years}y` : '—'}</p>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-surface-800 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">Score</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{detail.score ?? '—'}</p>
              </div>
            </div>
            {detail.skills?.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Skills</p>
                <div className="flex flex-wrap gap-1">
                  {detail.skills.map((s: string) => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-brand-500/20 text-blue-700 dark:text-brand-300">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmMove}
        onClose={() => setConfirmMove(null)}
        onConfirm={async () => {
          if (confirmMove) {
            const { id, to } = confirmMove;
            setConfirmMove(null);
            await doMove(id, to);
          }
        }}
        title="Confirm move"
        description={`Move this candidate from ${confirmMove?.from || 'current stage'} to ${confirmMove?.to}? This is a significant status change.`}
        confirmLabel="Move candidate"
      />
    </div>
  );
}
