import {
  Briefcase,
  Calendar,
  CheckSquare,
  Loader2,
  Mail,
  MapPin,
  Square,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components';
import {
  formatDate,
  formatRelativeTime,
  interpolate,
  type Locale,
} from '@/stores/locale-store';

export type JobApplicantStage =
  | 'active'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'hired'
  | 'rejected';

export interface Applicant {
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

export function normalizeStatus(raw: string | undefined | null): JobApplicantStage {
  const STAGE_ID_SET = new Set<string>([
    'active',
    'screening',
    'interview',
    'offer',
    'hired',
    'rejected',
  ]);
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

export interface KanbanCardProps {
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

export function KanbanCard({
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
}: KanbanCardProps) {
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
