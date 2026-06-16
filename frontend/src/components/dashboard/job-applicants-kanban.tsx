'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Briefcase,
  Mail,
  MapPin,
  TrendingUp,
  Calendar,
  ExternalLink,
  Loader2,
  XCircle,
  Users,
  CheckSquare,
  Square,
  X,
  Move,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Card,
  CardContent,
  Button,
  Badge,
  Skeleton,
  EmptyState,
  ErrorState,
  Modal,
  ConfirmDialog,
} from '@/components';
import { useToast } from '@/components/ui/toast';
import {
  useLocaleStore,
  translate,
  interpolate,
  formatDate,
  formatRelativeTime,
  formatNumber,
  type Locale,
} from '@/stores/locale-store';

export type JobApplicantStage =
  | 'active'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'hired'
  | 'rejected';

interface StageDef {
  id: JobApplicantStage;
  titleKey: string;
  defaultTitle: string;
  color: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
}

const STAGES: StageDef[] = [
  {
    id: 'active',
    titleKey: 'jobKanban.stages.applied',
    defaultTitle: 'Applied',
    color: 'bg-blue-500',
    borderClass: 'border-blue-300 dark:border-blue-500/40',
    bgClass: 'bg-blue-50/50 dark:bg-blue-500/5',
    textClass: 'text-blue-700 dark:text-blue-300',
  },
  {
    id: 'screening',
    titleKey: 'jobKanban.stages.screening',
    defaultTitle: 'Screening',
    color: 'bg-yellow-500',
    borderClass: 'border-yellow-300 dark:border-yellow-500/40',
    bgClass: 'bg-yellow-50/50 dark:bg-yellow-500/5',
    textClass: 'text-yellow-700 dark:text-yellow-300',
  },
  {
    id: 'interview',
    titleKey: 'jobKanban.stages.interview',
    defaultTitle: 'Interview',
    color: 'bg-purple-500',
    borderClass: 'border-purple-300 dark:border-purple-500/40',
    bgClass: 'bg-purple-50/50 dark:bg-purple-500/5',
    textClass: 'text-purple-700 dark:text-purple-300',
  },
  {
    id: 'offer',
    titleKey: 'jobKanban.stages.offer',
    defaultTitle: 'Offer',
    color: 'bg-teal-500',
    borderClass: 'border-teal-300 dark:border-teal-500/40',
    bgClass: 'bg-teal-50/50 dark:bg-teal-500/5',
    textClass: 'text-teal-700 dark:text-teal-300',
  },
  {
    id: 'hired',
    titleKey: 'jobKanban.stages.hired',
    defaultTitle: 'Hired',
    color: 'bg-green-600',
    borderClass: 'border-green-300 dark:border-green-500/40',
    bgClass: 'bg-green-50/50 dark:bg-green-500/5',
    textClass: 'text-green-700 dark:text-green-300',
  },
  {
    id: 'rejected',
    titleKey: 'jobKanban.stages.rejected',
    defaultTitle: 'Rejected',
    color: 'bg-gray-400',
    borderClass: 'border-gray-300 dark:border-gray-500/40',
    bgClass: 'bg-gray-50/50 dark:bg-gray-500/5',
    textClass: 'text-gray-700 dark:text-gray-300',
  },
];

const STAGE_ID_SET = new Set<string>(STAGES.map((s) => s.id));

const REJECTION_REASONS = [
  'not_a_fit',
  'experience',
  'skills',
  'availability',
  'salary',
  'culture',
  'withdrew',
  'duplicate',
  'other',
] as const;

type RejectionReason = (typeof REJECTION_REASONS)[number];

interface Applicant {
  id: string;
  full_name?: string;
  name?: string;
  email?: string;
  status?: string;
  score?: number | null;
  created_at?: string;
  applied_at?: string;
  location?: string | null;
  headline?: string | null;
  skills?: string[];
  experience_years?: number | null;
  phone?: string | null;
  linkedin?: string | null;
  notes?: string | null;
  rejection_reason?: string | null;
}

interface PendingMove {
  candidateId: string;
  candidateName: string;
  fromStage: string;
  toStage: JobApplicantStage;
}

interface BulkMoveState {
  toStage: JobApplicantStage;
}

interface BulkRejectState {
  reason: RejectionReason;
  details: string;
}

interface ConfirmBulkState {
  ids: string[];
  toStage: JobApplicantStage;
}

export interface JobApplicantsKanbanProps {
  jobId: string;
}

function normalizeStatus(raw: string | undefined | null): JobApplicantStage {
  if (!raw) return 'active';
  const s = String(raw).toLowerCase().trim();
  if (STAGE_ID_SET.has(s)) return s as JobApplicantStage;
  if (s === 'applied' || s === 'new' || s === 'open') return 'active';
  if (s === 'interviewing') return 'interview';
  if (s === 'offer_extended') return 'offer';
  if (s === 'active') return 'active';
  return 'active';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

function getScoreTone(score: number | null | undefined): {
  label: string;
  classes: string;
} {
  if (typeof score !== 'number') {
    return {
      label: '—',
      classes:
        'bg-gray-100 text-gray-600 border-gray-200 dark:bg-surface-800 dark:text-gray-400 dark:border-surface-700',
    };
  }
  if (score >= 85) {
    return {
      label: String(Math.round(score)),
      classes:
        'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
    };
  }
  if (score >= 65) {
    return {
      label: String(Math.round(score)),
      classes:
        'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
    };
  }
  if (score >= 40) {
    return {
      label: String(Math.round(score)),
      classes:
        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    };
  }
  return {
    label: String(Math.round(score)),
    classes:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  };
}

export function JobApplicantsKanban({ jobId }: JobApplicantsKanbanProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fb?: string) => translate(locale, key, fb),
    [locale]
  );
  const { push } = useToast();

  const [candidates, setCandidates] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<JobApplicantStage | null>(null);
  const [detail, setDetail] = useState<Applicant | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMove, setBulkMove] = useState<BulkMoveState | null>(null);
  const [bulkReject, setBulkReject] = useState<BulkRejectState | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<ConfirmBulkState | null>(null);
  const [bulkWorking, setBulkWorking] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (isBackground = false) => {
      if (!jobId) return;
      if (!isBackground) setLoading(true);
      setError(null);
      try {
        const data: any = await api.candidates.list({
          job_id: jobId,
          page_size: '200',
        });
        const items: Applicant[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.data)
              ? data.data
              : [];
        setCandidates(items);
      } catch (err) {
        const e = err as APIError;
        if (!isBackground) {
          setError(e?.message || t('jobKanban.couldntLoad', "Couldn't load applicants"));
          setCandidates([]);
        }
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [jobId, t]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => load(true), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const name = (c.full_name || c.name || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const headline = (c.headline || '').toLowerCase();
      const skills = (c.skills || []).map((s) => s.toLowerCase()).join(' ');
      return (
        name.includes(q) ||
        email.includes(q) ||
        headline.includes(q) ||
        skills.includes(q)
      );
    });
  }, [candidates, search]);

  const byStage = useMemo(() => {
    const map: Record<JobApplicantStage, Applicant[]> = {
      active: [],
      screening: [],
      interview: [],
      offer: [],
      hired: [],
      rejected: [],
    };
    for (const c of filteredCandidates) {
      const s = normalizeStatus(c.status);
      map[s].push(c);
    }
    return map;
  }, [filteredCandidates]);

  const stageCounts = useMemo(() => {
    const counts: Record<JobApplicantStage, number> = {
      active: 0,
      screening: 0,
      interview: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
    };
    for (const c of candidates) {
      const s = normalizeStatus(c.status);
      counts[s] += 1;
    }
    return counts;
  }, [candidates]);

  const totalCount = candidates.length;
  const inProgressCount =
    stageCounts.active +
    stageCounts.screening +
    stageCounts.interview +
    stageCounts.offer;
  const hiredCount = stageCounts.hired;
  const rejectedCount = stageCounts.rejected;

  const persistMove = useCallback(
    async (id: string, newStatus: JobApplicantStage) => {
      const prev = candidates.find((c) => c.id === id)?.status;
      setCandidates((p) =>
        p.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
      );
      try {
        await api.candidates.update(id, { status: newStatus } as any);
        push(
          'success',
          interpolate(t('jobKanban.moved', 'Moved to {stage}'), {
            stage: t(
              `pipeline.stages.${newStatus}`,
              STAGES.find((s) => s.id === newStatus)?.defaultTitle || newStatus
            ),
          })
        );
      } catch (err) {
        const e = err as APIError;
        setCandidates((p) =>
          p.map((c) => (c.id === id ? { ...c, status: prev ?? c.status } : c))
        );
        push('error', e?.message || t('jobKanban.moveFailed', 'Failed to move candidate'));
      }
    },
    [candidates, push, t]
  );

  const handleMove = useCallback(
    async (id: string, fromStatus: string, toStage: JobApplicantStage) => {
      if (normalizeStatus(fromStatus) === toStage) return;
      const candidate = candidates.find((c) => c.id === id);
      const name = candidate?.full_name || candidate?.name || id;
      if (toStage === 'hired' || toStage === 'rejected') {
        setPendingMove({ candidateId: id, candidateName: name, fromStage: fromStatus, toStage });
        return;
      }
      setMovingId(id);
      try {
        await persistMove(id, toStage);
      } finally {
        setMovingId(null);
      }
    },
    [candidates, persistMove]
  );

  const confirmPendingMove = useCallback(async () => {
    if (!pendingMove) return;
    const { candidateId, toStage } = pendingMove;
    setPendingMove(null);
    setMovingId(candidateId);
    try {
      await persistMove(candidateId, toStage);
    } finally {
      setMovingId(null);
    }
  }, [pendingMove, persistMove]);

  const openDetail = useCallback(
    async (id: string) => {
      const found = candidates.find((c) => c.id === id);
      setDetail(found || { id });
      setDetailLoading(true);
      try {
        const data: any = await api.candidates.get(id);
        const detailObj: Applicant = data?.data || data;
        if (detailObj && detailObj.id) {
          setDetail(detailObj);
        }
      } catch {
        /* keep basic info if detail fetch fails */
      } finally {
        setDetailLoading(false);
      }
    },
    [candidates]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectColumn = useCallback(
    (stage: JobApplicantStage, ids: string[]) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const allSelected = ids.every((id) => next.has(id));
        if (allSelected && ids.length > 0) {
          ids.forEach((id) => next.delete(id));
        } else {
          ids.forEach((id) => next.add(id));
        }
        return next;
      });
    },
    []
  );

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectAllVisible = useCallback(() => {
    setSelected(new Set(filteredCandidates.map((c) => c.id)));
  }, [filteredCandidates]);

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selected.has(c.id)),
    [candidates, selected]
  );

  const selectedCurrentStages = useMemo(() => {
    const stages = new Set<JobApplicantStage>();
    for (const c of selectedCandidates) stages.add(normalizeStatus(c.status));
    return stages;
  }, [selectedCandidates]);

  const openBulkMove = useCallback(() => {
    setBulkMove({ toStage: 'screening' });
  }, []);

  const openBulkReject = useCallback(() => {
    setBulkReject({ reason: 'not_a_fit', details: '' });
  }, []);

  const runBulkMove = useCallback(async () => {
    if (!bulkMove || selectedCandidates.length === 0) return;
    const target = bulkMove.toStage;
    const ids = selectedCandidates.map((c) => c.id);
    if (target === 'hired' || target === 'rejected') {
      setConfirmBulk({ ids, toStage: target });
      return;
    }
    setBulkWorking(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => api.candidates.update(id, { status: target } as any))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      setCandidates((p) =>
        p.map((c) => (ids.includes(c.id) ? { ...c, status: target } : c))
      );
      clearSelection();
      setBulkMove(null);
      if (failed === 0) {
        push(
          'success',
          interpolate(t('jobKanban.bulk.movedCount', '{count} candidate(s) moved to {stage}'), {
            count: String(ids.length),
            stage: t(
              `pipeline.stages.${target}`,
              STAGES.find((s) => s.id === target)?.defaultTitle || target
            ),
          })
        );
      } else {
        push(
          'warning',
          interpolate(
            t(
              'jobKanban.bulk.movedPartial',
              '{success} moved, {failed} failed'
            ),
            { success: String(ids.length - failed), failed: String(failed) }
          )
        );
      }
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('jobKanban.bulk.moveFailed', 'Bulk move failed'));
    } finally {
      setBulkWorking(false);
    }
  }, [bulkMove, selectedCandidates, t, push, clearSelection]);

  const runBulkReject = useCallback(async () => {
    if (!bulkReject || selectedCandidates.length === 0) return;
    setBulkWorking(true);
    try {
      const reasonText = t(
        `jobKanban.rejectReasons.${bulkReject.reason}`,
        bulkReject.reason
      );
      const fullReason = bulkReject.details.trim()
        ? `${reasonText}: ${bulkReject.details.trim()}`
        : reasonText;
      const results = await Promise.allSettled(
        selectedCandidates.map((c) =>
          api.candidates.update(c.id, {
            status: 'rejected',
            notes: c.notes
              ? `${c.notes}\n\n[Rejection] ${fullReason}`
              : `[Rejection] ${fullReason}`,
          } as any)
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const ids = selectedCandidates.map((c) => c.id);
      setCandidates((p) =>
        p.map((c) => (ids.includes(c.id) ? { ...c, status: 'rejected' } : c))
      );
      clearSelection();
      setBulkReject(null);
      if (failed === 0) {
        push(
          'success',
          interpolate(t('jobKanban.bulk.rejectedCount', '{count} candidate(s) rejected'), {
            count: String(ids.length),
          })
        );
      } else {
        push(
          'warning',
          interpolate(
            t(
              'jobKanban.bulk.rejectedPartial',
              '{success} rejected, {failed} failed'
            ),
            { success: String(ids.length - failed), failed: String(failed) }
          )
        );
      }
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('jobKanban.bulk.rejectFailed', 'Bulk reject failed'));
    } finally {
      setBulkWorking(false);
    }
  }, [bulkReject, selectedCandidates, t, push, clearSelection]);

  const runConfirmBulk = useCallback(async () => {
    if (!confirmBulk) return;
    const { ids, toStage } = confirmBulk;
    setBulkWorking(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => api.candidates.update(id, { status: toStage } as any))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      setCandidates((p) =>
        p.map((c) => (ids.includes(c.id) ? { ...c, status: toStage } : c))
      );
      clearSelection();
      setConfirmBulk(null);
      setBulkMove(null);
      if (failed === 0) {
        push(
          'success',
          interpolate(t('jobKanban.bulk.movedCount', '{count} candidate(s) moved to {stage}'), {
            count: String(ids.length),
            stage: t(
              `pipeline.stages.${toStage}`,
              STAGES.find((s) => s.id === toStage)?.defaultTitle || toStage
            ),
          })
        );
      } else {
        push(
          'warning',
          interpolate(
            t('jobKanban.bulk.movedPartial', '{success} moved, {failed} failed'),
            { success: String(ids.length - failed), failed: String(failed) }
          )
        );
      }
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('jobKanban.bulk.moveFailed', 'Bulk move failed'));
    } finally {
      setBulkWorking(false);
    }
  }, [confirmBulk, t, push, clearSelection]);

  const onDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverStage(null);
  }, []);

  const onColumnDragOver = useCallback(
    (e: React.DragEvent, stage: JobApplicantStage) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragOverStage !== stage) setDragOverStage(stage);
    },
    [dragOverStage]
  );

  const onColumnDragLeave = useCallback(
    (stage: JobApplicantStage) => {
      if (dragOverStage === stage) setDragOverStage(null);
    },
    [dragOverStage]
  );

  const onColumnDrop = useCallback(
    (e: React.DragEvent, stage: JobApplicantStage) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      setDraggingId(null);
      setDragOverStage(null);
      if (!id) return;
      const candidate = candidates.find((c) => c.id === id);
      if (!candidate) return;
      handleMove(id, candidate.status || 'active', stage);
    },
    [candidates, handleMove]
  );

  if (loading) {
    return (
      <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {STAGES.map((s) => (
            <Skeleton key={s.id} variant="rounded" height={300} />
          ))}
        </div>
      </div>
    );
  }

  if (error && candidates.length === 0) {
    return (
      <div className="space-y-4"><Card>
          <CardContent className="p-0">
            <ErrorState
              title={t('jobKanban.couldntLoad', "Couldn't load applicants")}
              description={error}
              onRetry={() => load(false)}
              retryLabel={t('common.retry', 'Retry')}
              fullHeight
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4"><Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                {t('jobKanban.title', 'Applicant tracking')}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                {t(
                  'jobKanban.subtitle',
                  'Drag candidates between stages. Click a card to view full details.'
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:flex-none sm:w-56">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('jobKanban.search', 'Search applicants...')}
                  className="w-full h-8 pl-8 pr-3 rounded-md text-xs bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  aria-label={t('jobKanban.search', 'Search applicants...')}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() => load(false)}
                aria-label={t('common.refresh', 'Refresh')}
              >
                {t('common.refresh', 'Refresh')}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <StatTile
              label={t('jobKanban.stats.total', 'Total applicants')}
              value={formatNumber(totalCount, locale)}
              tone="default"
            />
            <StatTile
              label={t('jobKanban.stats.inProgress', 'In progress')}
              value={formatNumber(inProgressCount, locale)}
              tone="info"
            />
            <StatTile
              label={t('jobKanban.stats.hired', 'Hired')}
              value={formatNumber(hiredCount, locale)}
              tone="success"
            />
            <StatTile
              label={t('jobKanban.stats.rejected', 'Rejected')}
              value={formatNumber(rejectedCount, locale)}
              tone="muted"
            />
          </div>
        </CardContent>
      </Card>

      {selectedCandidates.length > 0 && (
        <div
          className="sticky top-2 z-20 rounded-lg border border-blue-300 dark:border-blue-500/40 bg-blue-50/95 dark:bg-blue-500/10 backdrop-blur p-3 flex flex-wrap items-center gap-2 shadow-sm"
          role="region"
          aria-label={t('jobKanban.bulk.region', 'Bulk actions')}
        >
          <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
            {interpolate(
              t('jobKanban.bulk.selected', '{count} selected'),
              { count: String(selectedCandidates.length) }
            )}
          </span>
          {selectedCurrentStages.size === 1 && (
            <span className="text-xs text-blue-700 dark:text-blue-300">
              {t('jobKanban.bulk.fromStage', 'from')}{' '}
              <strong>
                {t(
                  `pipeline.stages.${Array.from(selectedCurrentStages)[0]}`,
                  Array.from(selectedCurrentStages)[0]
                )}
              </strong>
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Move className="h-3.5 w-3.5" />}
              onClick={openBulkMove}
              disabled={bulkWorking}
            >
              {t('jobKanban.bulk.moveStage', 'Move to stage')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              leftIcon={<XCircle className="h-3.5 w-3.5" />}
              onClick={openBulkReject}
              disabled={bulkWorking}
            >
              {t('jobKanban.bulk.reject', 'Reject with reason')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X className="h-3.5 w-3.5" />}
              onClick={clearSelection}
              disabled={bulkWorking}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      )}

      {candidates.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Briefcase className="h-12 w-12" />}
              title={t('jobKanban.empty.title', 'No applicants yet')}
              description={t(
                'jobKanban.empty.desc',
                'When candidates apply for this job, they will appear here organized by stage.'
              )}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {STAGES.map((stage) => {
            const list = byStage[stage.id];
            const selectedInColumn = list.filter((c) => selected.has(c.id)).length;
            const allSelected = list.length > 0 && selectedInColumn === list.length;
            const isDropTarget = dragOverStage === stage.id;
            return (
              <div
                key={stage.id}
                role="region"
                aria-label={interpolate(
                  t('jobKanban.columnAria', 'Drop candidate to move to {stage}'),
                  { stage: t(stage.titleKey, stage.defaultTitle) }
                )}
                onDragOver={(e) => onColumnDragOver(e, stage.id)}
                onDragLeave={() => onColumnDragLeave(stage.id)}
                onDrop={(e) => onColumnDrop(e, stage.id)}
                className={[
                  'flex flex-col rounded-lg border bg-white dark:bg-surface-900 transition-colors min-h-[260px]',
                  isDropTarget
                    ? `${stage.borderClass} ${stage.bgClass} ring-2 ring-offset-1 ring-blue-400 dark:ring-offset-surface-900`
                    : 'border-gray-200 dark:border-surface-700',
                ].join(' ')}
              >
                <header className="flex items-center gap-2 p-2.5 border-b border-gray-100 dark:border-surface-700">
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${stage.color}`}
                    aria-hidden="true"
                  />
                  <h3
                    className={`text-xs font-semibold uppercase tracking-wider truncate ${stage.textClass}`}
                  >
                    {t(stage.titleKey, stage.defaultTitle)}
                  </h3>
                  <span className="ml-auto inline-flex items-center gap-1.5">
                    {list.length > 0 && (
                      <button
                        type="button"
                        onClick={() => selectColumn(stage.id, list.map((c) => c.id))}
                        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                        aria-label={
                          allSelected
                            ? interpolate(
                                t('jobKanban.deselectAllInColumn', 'Deselect all in {stage}'),
                                { stage: t(stage.titleKey, stage.defaultTitle) }
                              )
                            : interpolate(
                                t('jobKanban.selectAllInColumn', 'Select all in {stage}'),
                                { stage: t(stage.titleKey, stage.defaultTitle) }
                              )
                        }
                        title={
                          allSelected
                            ? t('jobKanban.deselectAllInColumn', 'Deselect all')
                            : t('jobKanban.selectAllInColumn', 'Select all')
                        }
                      >
                        {allSelected ? (
                          <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Square className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </button>
                    )}
                    <span className="text-[10px] font-bold bg-gray-100 dark:bg-surface-800 text-gray-700 dark:text-gray-300 rounded-full px-1.5 py-0.5">
                      {list.length}
                    </span>
                  </span>
                </header>

                <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[60vh]">
                  {list.length === 0 ? (
                    <p className="text-[11px] text-center text-gray-400 dark:text-gray-500 py-6">
                      {t('jobKanban.emptyColumn', 'No candidates in this stage')}
                    </p>
                  ) : (
                    list.map((c) => (
                      <ApplicantCard
                        key={c.id}
                        candidate={c}
                        isSelected={selected.has(c.id)}
                        isDragging={draggingId === c.id}
                        isMoving={movingId === c.id}
                        onToggleSelect={toggleSelect}
                        onOpen={openDetail}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        locale={locale}
                        t={t}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {candidates.length > 0 && selectedCandidates.length < filteredCandidates.length && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={selectAllVisible}
            aria-label={t('jobKanban.selectAllVisible', 'Select all visible applicants')}
          >
            {t('jobKanban.selectAllVisible', 'Select all visible applicants')}
          </Button>
        </div>
      )}

      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.full_name || detail?.name || t('candidates.title', 'Candidate')}
        size="lg"
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shrink-0"
                aria-hidden="true"
              >
                {getInitials(detail.full_name || detail.name || detail.email || '?')}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {detail.full_name || detail.name || '—'}
                </p>
                {detail.email && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {detail.email}
                  </p>
                )}
              </div>
              {detailLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-hidden="true" />
              )}
            </div>

            {detail.headline && (
              <p className="text-sm text-gray-700 dark:text-gray-300">{detail.headline}</p>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailItem
                label={t('jobKanban.detail.status', 'Status')}
                value={t(
                  `pipeline.stages.${normalizeStatus(detail.status)}`,
                  normalizeStatus(detail.status)
                )}
              />
              <DetailItem
                label={t('candidates.table.score', 'Score')}
                value={
                  typeof detail.score === 'number' ? formatNumber(detail.score, locale) : '—'
                }
              />
              <DetailItem
                label={t('candidates.table.location', 'Location')}
                value={detail.location || '—'}
              />
              <DetailItem
                label={t('candidates.table.experience', 'Experience')}
                value={
                  typeof detail.experience_years === 'number'
                    ? interpolate(t('jobKanban.yearsFmt', '{n} years'), {
                        n: String(detail.experience_years),
                      })
                    : '—'
                }
              />
              {detail.phone && <DetailItem label={t('jobKanban.detail.phone', 'Phone')} value={detail.phone} />}
              {detail.linkedin && <DetailItem label="LinkedIn" value={detail.linkedin} />}
            </div>

            {detail.applied_at && (
              <div className="rounded-md bg-gray-50 dark:bg-surface-800 p-3 text-xs text-gray-600 dark:text-gray-300">
                {t('jobKanban.detail.appliedOn', 'Applied on')}{' '}
                <strong>{formatDate(detail.applied_at, locale)}</strong>{' '}
                <span className="text-gray-500 dark:text-gray-400">
                  ({formatRelativeTime(detail.applied_at, locale)})
                </span>
              </div>
            )}

            {detail.skills && detail.skills.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                  {t('candidates.table.skills', 'Skills')}
                </p>
                <div className="flex flex-wrap gap-1">
                  {detail.skills.map((s) => (
                    <Badge key={s} variant="info" size="sm">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {detail.notes && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                  {t('jobKanban.detail.notes', 'Notes')}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {detail.notes}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-surface-700">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = `/dashboard/candidates/${detail.id}`;
                  }
                }}
              >
                {t('jobKanban.detail.openFull', 'Open full profile')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!pendingMove}
        onClose={() => setPendingMove(null)}
        onConfirm={confirmPendingMove}
        title={t('jobKanban.confirmMove.title', 'Confirm move')}
        description={
          pendingMove
            ? `${t('jobKanban.confirmMove.desc', 'Move {name} to {stage}? This is a significant status change.').replace('{name}', pendingMove.candidateName).replace('{stage}', t(`pipeline.stages.${pendingMove.toStage}`, pendingMove.toStage))}`
            : ''
        }
        confirmLabel={t('jobKanban.confirmMove.confirm', 'Move candidate')}
        variant="warning"
        destructive={pendingMove?.toStage === 'rejected'}
        loading={movingId === pendingMove?.candidateId}
      />

      <Modal
        isOpen={!!bulkMove}
        onClose={() => (bulkWorking ? undefined : setBulkMove(null))}
        title={t('jobKanban.bulk.moveTitle', 'Move candidates to stage')}
        size="sm"
        showCloseButton={!bulkWorking}
        closeOnBackdropClick={!bulkWorking}
        closeOnEscape={!bulkWorking}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button
              variant="secondary"
              onClick={() => setBulkMove(null)}
              disabled={bulkWorking}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={runBulkMove}
              loading={bulkWorking}
              leftIcon={<Move className="h-4 w-4" />}
            >
              {t('jobKanban.bulk.moveConfirm', 'Move')}
            </Button>
          </div>
        }
      >
        {bulkMove && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {interpolate(
                t(
                  'jobKanban.bulk.moveDesc',
                  'Choose the target stage for {count} candidate(s).'
                ),
                { count: String(selectedCandidates.length) }
              )}
            </p>
            <div className="space-y-1.5">
              {STAGES.map((s) => {
                const checked = bulkMove.toStage === s.id;
                return (
                  <label
                    key={s.id}
                    className={[
                      'flex items-center gap-3 rounded-md border p-2.5 cursor-pointer transition',
                      checked
                        ? 'border-blue-400 dark:border-blue-500/50 bg-blue-50/60 dark:bg-blue-500/10'
                        : 'border-gray-200 dark:border-surface-700 hover:border-gray-300 dark:hover:border-surface-600',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="bulk-move-stage"
                      value={s.id}
                      checked={checked}
                      onChange={() => setBulkMove({ toStage: s.id })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${s.color}`}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {t(s.titleKey, s.defaultTitle)}
                    </span>
                    {(s.id === 'hired' || s.id === 'rejected') && (
                      <Badge variant="warning" size="sm">
                        <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                        {t('jobKanban.terminalWarning', 'Terminal')}
                      </Badge>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!bulkReject}
        onClose={() => (bulkWorking ? undefined : setBulkReject(null))}
        title={t('jobKanban.bulk.rejectTitle', 'Reject candidates')}
        size="md"
        showCloseButton={!bulkWorking}
        closeOnBackdropClick={!bulkWorking}
        closeOnEscape={!bulkWorking}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button
              variant="secondary"
              onClick={() => setBulkReject(null)}
              disabled={bulkWorking}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={runBulkReject}
              loading={bulkWorking}
              leftIcon={<XCircle className="h-4 w-4" />}
            >
              {interpolate(
                t('jobKanban.bulk.rejectConfirm', 'Reject {count}'),
                { count: String(selectedCandidates.length) }
              )}
            </Button>
          </div>
        }
      >
        {bulkReject && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {interpolate(
                t(
                  'jobKanban.bulk.rejectDesc',
                  'Provide a reason. This will be recorded as a note on each of the {count} candidate(s).'
                ),
                { count: String(selectedCandidates.length) }
              )}
            </p>
            <div>
              <label
                htmlFor="bulk-reject-reason"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1"
              >
                {t('jobKanban.bulk.reasonLabel', 'Reason')}
              </label>
              <select
                id="bulk-reject-reason"
                value={bulkReject.reason}
                onChange={(e) =>
                  setBulkReject({ ...bulkReject, reason: e.target.value as RejectionReason })
                }
                className="w-full h-10 rounded-md border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {REJECTION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`jobKanban.rejectReasons.${r}`, r)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="bulk-reject-details"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1"
              >
                {t('jobKanban.bulk.detailsLabel', 'Additional details (optional)')}
              </label>
              <textarea
                id="bulk-reject-details"
                rows={3}
                value={bulkReject.details}
                onChange={(e) => setBulkReject({ ...bulkReject, details: e.target.value })}
                placeholder={t('jobKanban.bulk.detailsPh', 'Add any context for the candidate record…')}
                className="w-full rounded-md border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmBulk}
        onClose={() => (bulkWorking ? undefined : setConfirmBulk(null))}
        onConfirm={runConfirmBulk}
        title={t('jobKanban.bulk.confirmTerminal.title', 'Confirm terminal move')}
        description={
          confirmBulk
            ? interpolate(
                t(
                  'jobKanban.bulk.confirmTerminal.desc',
                  'You are about to move {count} candidate(s) to {stage}. This is a significant status change.'
                ),
                {
                  count: String(confirmBulk.ids.length),
                  stage: t(
                    `pipeline.stages.${confirmBulk.toStage}`,
                    confirmBulk.toStage
                  ),
                }
              )
            : ''
        }
        confirmLabel={t('jobKanban.confirmMove.confirm', 'Move candidate')}
        variant="warning"
        destructive={confirmBulk?.toStage === 'rejected'}
        loading={bulkWorking}
      />
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  tone: 'default' | 'info' | 'success' | 'muted';
}

function StatTile({ label, value, tone }: StatTileProps) {
  const toneClass = {
    default: 'text-gray-900 dark:text-gray-100',
    info: 'text-blue-600 dark:text-blue-400',
    success: 'text-green-600 dark:text-green-400',
    muted: 'text-gray-500 dark:text-gray-400',
  }[tone];
  return (
    <div className="rounded-md border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 dark:bg-surface-800 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">
        {value}
      </p>
    </div>
  );
}

interface ApplicantCardProps {
  candidate: Applicant;
  isSelected: boolean;
  isDragging: boolean;
  isMoving: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  locale: Locale;
  t: (key: string, fb?: string) => string;
}

function ApplicantCard({
  candidate,
  isSelected,
  isDragging,
  isMoving,
  onToggleSelect,
  onOpen,
  onDragStart,
  onDragEnd,
  locale,
  t,
}: ApplicantCardProps) {
  const name = candidate.full_name || candidate.name || candidate.email || t('jobKanban.unnamed', 'Unnamed');
  const initials = getInitials(name);
  const appliedAt = candidate.applied_at || candidate.created_at;
  const appliedText = appliedAt
    ? formatRelativeTime(appliedAt, locale)
    : null;
  const appliedAbsolute = appliedAt ? formatDate(appliedAt, locale) : null;
  const scoreTone = getScoreTone(candidate.score);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, candidate.id)}
      onDragEnd={onDragEnd}
      className={[
        'group rounded-md border bg-white dark:bg-surface-800 p-2 shadow-sm transition cursor-grab active:cursor-grabbing',
        isSelected
          ? 'border-blue-400 dark:border-blue-500/50 ring-1 ring-blue-300 dark:ring-blue-500/30'
          : 'border-gray-200 dark:border-surface-700 hover:border-blue-300 dark:hover:border-blue-500/40',
        isDragging ? 'opacity-50' : '',
      ].join(' ')}
      data-applicant-id={candidate.id}
      aria-grabbed={isDragging}
      aria-label={`${name} — ${t(`pipeline.stages.${normalizeStatus(candidate.status)}`, normalizeStatus(candidate.status))}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(candidate.id);
          }}
          className="shrink-0 mt-0.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          aria-label={
            isSelected
              ? t('jobKanban.deselectApplicant', 'Deselect {name}').replace('{name}', name)
              : t('jobKanban.selectApplicant', 'Select {name}').replace('{name}', name)
          }
        >
          {isSelected ? (
            <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          ) : (
            <Square className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onOpen(candidate.id)}
          className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          aria-label={t('jobKanban.openApplicant', 'Open {name}').replace('{name}', name)}
        >
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0"
              aria-hidden="true"
            >
              {initials}
            </div>
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate flex-1">
              {name}
            </p>
            {isMoving && (
              <Loader2 className="h-3 w-3 animate-spin text-gray-400 shrink-0" aria-hidden="true" />
            )}
          </div>
          {candidate.email && (
            <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
              <Mail className="h-2.5 w-2.5" aria-hidden="true" />
              <span className="truncate">{candidate.email}</span>
            </p>
          )}
          {candidate.location && (
            <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" aria-hidden="true" />
              <span className="truncate">{candidate.location}</span>
            </p>
          )}
          <div className="mt-1.5 flex items-center justify-between gap-1.5">
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-bold ${scoreTone.classes}`}
              aria-label={interpolate(t('jobKanban.scoreAria', 'Match score {score}'), {
                score: scoreTone.label,
              })}
            >
              <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" />
              {scoreTone.label}
            </span>
            {appliedText && (
              <span
                className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-0.5 truncate"
                title={appliedAbsolute || undefined}
              >
                <Calendar className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{appliedText}</span>
              </span>
            )}
          </div>
          {candidate.rejection_reason && (
            <p className="mt-1 text-[10px] text-red-600 dark:text-red-400 flex items-center gap-1 truncate">
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{candidate.rejection_reason}</span>
            </p>
          )}
        </button>
      </div>
    </div>
  );
}
