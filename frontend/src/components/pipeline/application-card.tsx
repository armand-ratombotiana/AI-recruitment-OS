'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Calendar,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  TrendingUp,
  XCircle,
  ExternalLink,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import { useToast } from '@/components';
import {
  useLocaleStore,
  translate,
  interpolate,
  formatRelativeTime,
} from '@/stores/locale-store';

export type ApplicationStage =
  | 'active'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'hired'
  | 'rejected';

export const APPLICATION_STAGE_IDS: ApplicationStage[] = [
  'active',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
];

export interface ApplicationStageDef {
  id: ApplicationStage;
  titleKey: string;
  defaultTitle: string;
  color: string;
  badgeClass: string;
}

export const APPLICATION_STAGES: ApplicationStageDef[] = [
  {
    id: 'active',
    titleKey: 'pipeline.stages.active',
    defaultTitle: 'Applied',
    color: 'bg-blue-500',
    badgeClass:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  },
  {
    id: 'screening',
    titleKey: 'pipeline.stages.screening',
    defaultTitle: 'Screening',
    color: 'bg-yellow-500',
    badgeClass:
      'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30',
  },
  {
    id: 'interview',
    titleKey: 'pipeline.stages.interview',
    defaultTitle: 'Interview',
    color: 'bg-purple-500',
    badgeClass:
      'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30',
  },
  {
    id: 'offer',
    titleKey: 'pipeline.stages.offer',
    defaultTitle: 'Offer',
    color: 'bg-teal-500',
    badgeClass:
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30',
  },
  {
    id: 'hired',
    titleKey: 'pipeline.stages.hired',
    defaultTitle: 'Hired',
    color: 'bg-green-600',
    badgeClass:
      'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
  },
  {
    id: 'rejected',
    titleKey: 'pipeline.stages.rejected',
    defaultTitle: 'Rejected',
    color: 'bg-gray-400',
    badgeClass:
      'bg-gray-100 text-gray-700 border-gray-200 dark:bg-surface-800 dark:text-gray-300 dark:border-surface-700',
  },
];

const STAGE_SET = new Set<string>(APPLICATION_STAGE_IDS);

export function normalizeApplicationStage(raw: string | null | undefined): ApplicationStage {
  if (!raw) return 'active';
  const s = String(raw).toLowerCase().trim();
  if (STAGE_SET.has(s)) return s as ApplicationStage;
  if (s === 'applied' || s === 'new' || s === 'open') return 'active';
  if (s === 'interviewing') return 'interview';
  if (s === 'offer_extended') return 'offer';
  if (s === 'sourced' || s === 'matched') return 'screening';
  return 'active';
}

export interface ApplicationItem {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email?: string | null;
  candidate_headline?: string | null;
  candidate_location?: string | null;
  candidate_skills?: string[];
  job_id: string;
  job_title: string;
  job_company?: string | null;
  job_location?: string | null;
  stage: ApplicationStage;
  status_raw?: string;
  score?: number | null;
  days_in_stage?: number | null;
  applied_at?: string | null;
  last_activity_at?: string | null;
  recruiter_id?: string | null;
  recruiter_name?: string | null;
}

export interface ApplicationCardProps {
  application: ApplicationItem;
  onMoved?: (id: string, to: ApplicationStage) => void;
  onActivity?: (id: string) => void;
  variant?: 'kanban' | 'list';
  showJob?: boolean;
  showRecruiter?: boolean;
  onClick?: (app: ApplicationItem) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  ariaLabel?: string;
}

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
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

export function ApplicationCard({
  application,
  onMoved,
  onActivity,
  variant = 'kanban',
  showJob = true,
  showRecruiter = false,
  onClick,
  draggable = false,
  onDragStart,
  onDragEnd,
  isDragging = false,
  ariaLabel,
}: ApplicationCardProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fb?: string) => translate(locale, key, fb),
    [locale]
  );
  const { push } = useToast();

  const [action, setAction] = useState<'schedule' | 'reject' | 'message' | null>(null);

  const stage = useMemo(
    () => normalizeApplicationStage(application.stage),
    [application.stage]
  );
  const stageDef = useMemo(
    () => APPLICATION_STAGES.find((s) => s.id === stage) || APPLICATION_STAGES[0],
    [stage]
  );

  const candidateName = application.candidate_name || t('applicationCard.unnamed', 'Unnamed candidate');
  const initials = getInitials(candidateName);
  const scoreTone = getScoreTone(application.score ?? null);

  const lastActivity = application.last_activity_at || application.applied_at || null;
  const lastActivityLabel = lastActivity
    ? formatRelativeTime(lastActivity, locale)
    : t('applicationCard.noActivity', 'No recent activity');
  const daysInStage = application.days_in_stage ?? null;

  const handleSchedule = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (action) return;
      setAction('schedule');
      try {
        const now = new Date();
        now.setDate(now.getDate() + 1);
        now.setHours(10, 0, 0, 0);
        await api.interviews.create({
          candidate_id: application.candidate_id,
          type: 'video',
          duration_minutes: 45,
          scheduled_at: now.toISOString(),
          interviewer: 'recruiter@company.com',
          title: `${t('applicationCard.actions.schedule', 'Schedule interview')} — ${candidateName}`,
        } as any);
        push(
          'success',
          interpolate(t('applicationCard.toasts.interviewCreated', 'Interview created for {name}'), {
            name: candidateName,
          })
        );
        onActivity?.(application.id);
      } catch (err) {
        const er = err as APIError;
        push(
          'error',
          er?.message ||
            t('applicationCard.toasts.interviewFailed', 'Could not create interview')
        );
      } finally {
        setAction(null);
      }
    },
    [action, application, candidateName, onActivity, push, t]
  );

  const handleReject = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (action) return;
      setAction('reject');
      try {
        await api.candidates.update(application.candidate_id, { status: 'rejected' } as any);
        push(
          'success',
          interpolate(
            t('applicationCard.toasts.movedToRejected', '{name} moved to Rejected'),
            { name: candidateName }
          )
        );
        onMoved?.(application.id, 'rejected');
        onActivity?.(application.id);
      } catch (err) {
        const er = err as APIError;
        push(
          'error',
          er?.message ||
            interpolate(t('applicationCard.toasts.moveFailed', 'Could not move {name}'), {
              name: candidateName,
            })
        );
      } finally {
        setAction(null);
      }
    },
    [action, application, candidateName, onActivity, onMoved, push, t]
  );

  const handleMessage = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (action) return;
      if (!application.candidate_email) {
        push(
          'info',
          t(
            'applicationCard.actions.messageTooltip',
            'Send {name} a quick email'
          ).replace('{name}', candidateName)
        );
        return;
      }
      setAction('message');
      try {
        await api.mailing.send({
          to: application.candidate_email,
          subject: interpolate(
            t(
              'applicationCard.actions.message',
              'Quick follow-up from the recruiting team'
            ),
            { name: candidateName }
          ),
          body: `<p>${interpolate(
            t(
              'applicationCard.actions.messageTooltip',
              'Hi {name}, just a quick follow-up on your application for the {job} role.'
            ),
            { name: candidateName, job: application.job_title }
          )}</p>`,
          template: 'follow_up',
        } as any);
        push(
          'success',
          interpolate(t('applicationCard.toasts.messageSent', 'Email queued for {name}'), {
            name: candidateName,
          })
        );
        onActivity?.(application.id);
      } catch (err) {
        const er = err as APIError;
        push(
          'error',
          er?.message || t('applicationCard.toasts.messageFailed', 'Could not send email')
        );
      } finally {
        setAction(null);
      }
    },
    [action, application, candidateName, onActivity, push, t]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(application);
      }
    },
    [application, onClick]
  );

  const stageTitle = t(stageDef.titleKey, stageDef.defaultTitle);
  const isList = variant === 'list';
  const roleAttr = onClick ? 'button' : undefined;
  const tabIndex = onClick || draggable ? 0 : undefined;
  const stageLabel = interpolate(
    t('applicationCard.daysAria', '{n} days in the current stage'),
    { n: String(daysInStage ?? 0) }
  );
  const computedAriaLabel =
    ariaLabel ||
    `${candidateName} — ${application.job_title} — ${stageTitle} — ${stageLabel}`;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(e, application.id) : undefined}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, [data-stop-card-click="true"]')) return;
        onClick?.(application);
      }}
      onKeyDown={handleKeyDown}
      role={roleAttr}
      tabIndex={tabIndex}
      aria-grabbed={isDragging}
      aria-label={computedAriaLabel}
      data-application-id={application.id}
      className={[
        'group rounded-lg border bg-white dark:bg-surface-800 shadow-sm transition cursor-pointer',
        'hover:border-blue-300 dark:hover:border-blue-500/40',
        isDragging ? 'opacity-50' : '',
        isList ? 'p-4' : 'p-2.5',
        'border-gray-200 dark:border-surface-700',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={[
            'rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shrink-0',
            isList ? 'h-10 w-10 text-sm' : 'h-7 w-7 text-[10px]',
          ].join(' ')}
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p
                className={[
                  'font-semibold text-gray-900 dark:text-gray-100 truncate',
                  isList ? 'text-sm' : 'text-xs',
                ].join(' ')}
              >
                {candidateName}
              </p>
              {application.candidate_email && (
                <p
                  className={[
                    'text-gray-500 dark:text-gray-400 truncate flex items-center gap-1',
                    isList ? 'text-xs mt-0.5' : 'text-[10px] mt-0.5',
                  ].join(' ')}
                >
                  <Mail className={isList ? 'h-3 w-3' : 'h-2.5 w-2.5'} aria-hidden="true" />
                  <span className="truncate">{application.candidate_email}</span>
                </p>
              )}
            </div>
            <span
              className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border font-bold ${
                isList ? 'text-xs' : 'text-[10px]'
              } ${scoreTone.classes}`}
              aria-label={interpolate(t('applicationCard.scoreAria', 'Match score {score}'), {
                score: scoreTone.label,
              })}
            >
              <TrendingUp className={isList ? 'h-3 w-3' : 'h-2.5 w-2.5'} aria-hidden="true" />
              {scoreTone.label}
            </span>
          </div>

          {showJob && (
            <p
              className={[
                'text-gray-500 dark:text-gray-400 truncate flex items-center gap-1',
                isList ? 'text-xs mt-1' : 'text-[10px] mt-1',
              ].join(' ')}
              data-stop-card-click="true"
            >
              <Briefcase className={isList ? 'h-3 w-3' : 'h-2.5 w-2.5'} aria-hidden="true" />
              <span className="truncate">{application.job_title}</span>
              {application.job_company && (
                <span className="text-gray-400 dark:text-gray-500 truncate">· {application.job_company}</span>
              )}
            </p>
          )}

          {application.candidate_location && (
            <p
              className={[
                'text-gray-500 dark:text-gray-400 truncate flex items-center gap-1',
                isList ? 'text-xs mt-0.5' : 'text-[10px] mt-0.5',
              ].join(' ')}
            >
              <MapPin className={isList ? 'h-3 w-3' : 'h-2.5 w-2.5'} aria-hidden="true" />
              <span className="truncate">{application.candidate_location}</span>
            </p>
          )}

          <div
            className={[
              'flex items-center justify-between gap-1.5',
              isList ? 'mt-2' : 'mt-1.5',
            ].join(' ')}
          >
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${stageDef.badgeClass}`}
              aria-label={`${t('applicationCard.stage', 'Stage')}: ${stageTitle}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${stageDef.color}`}
                aria-hidden="true"
              />
              {stageTitle}
            </span>
            {daysInStage !== null && (
              <span
                className={[
                  'text-gray-500 dark:text-gray-400 inline-flex items-center gap-0.5',
                  isList ? 'text-xs' : 'text-[10px]',
                ].join(' ')}
                aria-label={stageLabel}
                title={stageLabel}
              >
                <Clock className={isList ? 'h-3 w-3' : 'h-2.5 w-2.5'} aria-hidden="true" />
                {isList
                  ? interpolate(t('stageSummary.days', '{n}d'), { n: String(daysInStage) })
                  : interpolate(
                      t('pipeline.v2.daysInStage', '{n}d in stage'),
                      { n: String(daysInStage) }
                    )}
              </span>
            )}
          </div>

          {isList && (
            <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
              {lastActivity
                ? interpolate(t('applicationCard.lastActivity', 'Last activity {when}'), {
                    when: lastActivityLabel,
                  })
                : t('applicationCard.noActivity', 'No recent activity')}
            </p>
          )}

          <div
            className={[
              'flex flex-wrap items-center gap-1',
              isList ? 'mt-2.5' : 'mt-2',
            ].join(' ')}
            data-stop-card-click="true"
          >
            <button
              type="button"
              onClick={handleSchedule}
              disabled={action !== null}
              className={[
                'inline-flex items-center gap-1 rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                isList
                  ? 'px-2 py-1 text-xs'
                  : 'px-1.5 py-0.5 text-[10px]',
                'border-gray-200 dark:border-surface-700',
                'bg-white dark:bg-surface-900',
                'text-gray-700 dark:text-gray-200',
                'hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700',
                'dark:hover:bg-blue-500/15 dark:hover:border-blue-500/40 dark:hover:text-blue-300',
                action === 'schedule' ? 'opacity-60' : '',
              ].join(' ')}
              aria-label={interpolate(
                t(
                  'applicationCard.actions.scheduleTooltip',
                  'Open the interview scheduler for {name}'
                ),
                { name: candidateName }
              )}
              title={interpolate(
                t(
                  'applicationCard.actions.scheduleTooltip',
                  'Open the interview scheduler for {name}'
                ),
                { name: candidateName }
              )}
            >
              {action === 'schedule' ? (
                <Loader2 className={isList ? 'h-3 w-3 animate-spin' : 'h-2.5 w-2.5 animate-spin'} aria-hidden="true" />
              ) : (
                <Calendar className={isList ? 'h-3 w-3' : 'h-2.5 w-2.5'} aria-hidden="true" />
              )}
              {isList
                ? action === 'schedule'
                  ? t('applicationCard.actions.scheduleScheduled', 'Scheduling…')
                  : t('applicationCard.actions.schedule', 'Schedule interview')
                : null}
            </button>
            <button
              type="button"
              onClick={handleMessage}
              disabled={action !== null}
              className={[
                'inline-flex items-center gap-1 rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                isList
                  ? 'px-2 py-1 text-xs'
                  : 'px-1.5 py-0.5 text-[10px]',
                'border-gray-200 dark:border-surface-700',
                'bg-white dark:bg-surface-900',
                'text-gray-700 dark:text-gray-200',
                'hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700',
                'dark:hover:bg-emerald-500/15 dark:hover:border-emerald-500/40 dark:hover:text-emerald-300',
                action === 'message' ? 'opacity-60' : '',
              ].join(' ')}
              aria-label={interpolate(
                t(
                  'applicationCard.actions.messageTooltip',
                  'Send {name} a quick email'
                ),
                { name: candidateName }
              )}
              title={interpolate(
                t(
                  'applicationCard.actions.messageTooltip',
                  'Send {name} a quick email'
                ),
                { name: candidateName }
              )}
            >
              {action === 'message' ? (
                <Loader2 className={isList ? 'h-3 w-3 animate-spin' : 'h-2.5 w-2.5 animate-spin'} aria-hidden="true" />
              ) : (
                <MessageSquare className={isList ? 'h-3 w-3' : 'h-2.5 w-2.5'} aria-hidden="true" />
              )}
              {isList
                ? action === 'message'
                  ? t('applicationCard.actions.messageSending', 'Sending…')
                  : t('applicationCard.actions.message', 'Message')
                : null}
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={action !== null || stage === 'rejected'}
              className={[
                'inline-flex items-center gap-1 rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                isList
                  ? 'px-2 py-1 text-xs'
                  : 'px-1.5 py-0.5 text-[10px]',
                'border-gray-200 dark:border-surface-700',
                'bg-white dark:bg-surface-900',
                'text-gray-700 dark:text-gray-200',
                'hover:bg-red-50 hover:border-red-300 hover:text-red-700',
                'dark:hover:bg-red-500/15 dark:hover:border-red-500/40 dark:hover:text-red-300',
                action === 'reject' || stage === 'rejected' ? 'opacity-60' : '',
              ].join(' ')}
              aria-label={interpolate(
                t(
                  'applicationCard.actions.rejectTooltip',
                  'Move {name} to the Rejected stage'
                ),
                { name: candidateName }
              )}
              title={interpolate(
                t(
                  'applicationCard.actions.rejectTooltip',
                  'Move {name} to the Rejected stage'
                ),
                { name: candidateName }
              )}
            >
              {action === 'reject' ? (
                <Loader2 className={isList ? 'h-3 w-3 animate-spin' : 'h-2.5 w-2.5 animate-spin'} aria-hidden="true" />
              ) : (
                <XCircle className={isList ? 'h-3 w-3' : 'h-2.5 w-2.5'} aria-hidden="true" />
              )}
              {isList
                ? action === 'reject'
                  ? t('applicationCard.actions.rejectRejecting', 'Rejecting…')
                  : t('applicationCard.actions.reject', 'Reject')
                : null}
            </button>
            {showRecruiter && application.recruiter_name && (
              <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[40%]" title={application.recruiter_name}>
                {application.recruiter_name}
              </span>
            )}
          </div>

          {isList && (
            <div className="mt-3 flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-surface-700">
              <Link
                href={`/dashboard/candidates/${application.candidate_id}`}
                className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 text-xs"
                aria-label={t(
                  'applicationCard.actions.openCandidate',
                  'Open candidate profile'
                )}
              >
                {t('applicationCard.actions.openCandidate', 'Open candidate profile')}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
              <Link
                href={`/dashboard/jobs/${application.job_id}?tab=applicants`}
                className="ml-auto text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 text-xs"
                aria-label={t('applicationCard.actions.openJob', 'View job applicants')}
              >
                {t('applicationCard.actions.openJob', 'View job applicants')}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



