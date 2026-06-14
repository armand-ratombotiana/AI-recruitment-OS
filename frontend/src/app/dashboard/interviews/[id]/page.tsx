'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Video,
  Phone,
  MapPin,
  Users,
  Calendar,
  Clock,
  FileText,
  ExternalLink,
  Edit3,
  XCircle,
  MessageSquare,
  Star,
  Award,
  Play,
  CheckCircle2,
  User,
  Briefcase,
  Sparkles,
  Code2,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  ErrorState,
  Breadcrumb,
  useToast,
} from '@/components';
import { useLocaleStore, translate, formatDate, type Locale } from '@/stores/locale-store';

function formatTime(iso: string, locale: Locale): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const bcp47 = locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : locale === 'ar' ? 'ar-SA' : locale === 'he' ? 'he-IL' : 'en-US';
  return new Intl.DateTimeFormat(bcp47, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatDateTime(iso: string, locale: Locale): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const bcp47 = locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : locale === 'ar' ? 'ar-SA' : locale === 'he' ? 'he-IL' : 'en-US';
  return new Intl.DateTimeFormat(bcp47, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'default' | 'danger'> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
  no_show: 'default',
};

const TYPE_META: Record<string, { label: string; icon: typeof Video; color: string }> = {
  phone: { label: 'Phone screen', icon: Phone, color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
  video: { label: 'Video', icon: Video, color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300' },
  onsite: { label: 'Onsite', icon: MapPin, color: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
  'pair-programming': { label: 'Pair programming', icon: Code2, color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  technical: { label: 'Technical', icon: Video, color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300' },
  panel: { label: 'Panel', icon: Users, color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
};

interface InterviewDetail {
  id: string;
  candidate_id: string;
  job_id: string;
  candidate_name?: string;
  candidate_email?: string;
  job_title?: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  type: string;
  interviewer: string;
  interviewers?: string[];
  panel?: string[];
  meeting_link?: string | null;
  location?: string | null;
  notes?: string | null;
  feedback?: string | null;
  score?: number | null;
  ai_score?: number | null;
  ai_feedback?: string | null;
  ai_summary?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  recording_url?: string | null;
}

interface CandidateInfo {
  id: string;
  full_name?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  status?: string;
}

interface JobInfo {
  id: string;
  title?: string;
  location?: string | null;
  status?: string;
}

export default function InterviewDetailPage({ params }: { params: { id: string } }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { push, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data: any = await api.interviews.get(params.id);
      const detail: InterviewDetail = data?.data || data;
      if (!detail || !detail.id) {
        setNotFound(true);
        setInterview(null);
        return;
      }
      setInterview(detail);

      const tasks: Promise<void>[] = [];
      if (detail.candidate_id) {
        tasks.push(
          api
            .getCandidate(detail.candidate_id)
            .then((res: any) => {
              const c: CandidateInfo = res?.data || res;
              setCandidate(c || null);
            })
            .catch(() => setCandidate(null)),
        );
      }
      if (detail.job_id) {
        tasks.push(
          api
            .getJob(detail.job_id)
            .then((res: any) => {
              const j: JobInfo = res?.data || res;
              setJob(j || null);
            })
            .catch(() => setJob(null)),
        );
      }
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
    } catch (err) {
      const e = err as APIError;
      if (e?.status === 404) {
        setNotFound(true);
        setInterview(null);
      } else {
        setError(e?.message || t('interviewDetail.couldntLoad', "Couldn't load interview"));
        setInterview(null);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const candidateName = useMemo(() => {
    if (candidate?.full_name) return candidate.full_name;
    if (candidate?.name) return candidate.name;
    if (interview?.candidate_name) return interview.candidate_name;
    return t('interviewDetail.candidate', 'Candidate');
  }, [candidate, interview, t]);

  const candidateInitials = useMemo(() => {
    return candidateName
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [candidateName]);

  const jobTitle = useMemo(() => {
    if (job?.title) return job.title;
    if (interview?.job_title) return interview.job_title;
    return t('interviewDetail.position', 'Position');
  }, [job, interview, t]);

  const typeMeta = useMemo(() => {
    const key = (interview?.type || '').toLowerCase();
    return TYPE_META[key] || { label: interview?.type || 'Interview', icon: Video, color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' };
  }, [interview?.type]);

  const TypeIcon = typeMeta.icon;

  const interviewerList = useMemo(() => {
    if (!interview) return [] as string[];
    if (Array.isArray(interview.interviewers) && interview.interviewers.length > 0) {
      return interview.interviewers;
    }
    if (Array.isArray(interview.panel) && interview.panel.length > 0) {
      return interview.panel;
    }
    if (interview.interviewer) {
      return interview.interviewer.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }, [interview]);

  const scheduledDate = interview?.scheduled_at ? new Date(interview.scheduled_at) : null;
  const isPast = scheduledDate ? scheduledDate.getTime() < Date.now() : false;
  const aiScore = typeof interview?.ai_score === 'number' ? interview.ai_score : typeof interview?.score === 'number' ? interview.score : null;
  const aiFeedback = interview?.ai_feedback || interview?.ai_summary || interview?.feedback || null;

  const handleJoin = () => {
    if (interview?.meeting_link) {
      window.open(interview.meeting_link, '_blank', 'noopener,noreferrer');
      push('success', t('interviewDetail.openingMeeting', 'Opening meeting...'));
    } else {
      push('info', t('interviewDetail.noLink', 'No meeting link available'));
    }
  };

  const handleStart = async () => {
    setActionLoading('start');
    try {
      await api.startInterview(interview!.id);
      push('success', t('interviewDetail.started', 'Interview started'));
      await load();
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('interviewDetail.startFailed', 'Failed to start interview'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async () => {
    setActionLoading('complete');
    try {
      await api.completeInterview(interview!.id);
      push('success', t('interviewDetail.completed', 'Interview marked complete'));
      await load();
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('interviewDetail.completeFailed', 'Failed to complete interview'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReschedule = () => {
    push('info', t('interviewDetail.rescheduleSoon', 'Rescheduling will be available soon'));
  };

  const handleCancel = async () => {
    if (!confirm(t('interviewDetail.cancelConfirm', 'Are you sure you want to cancel this interview?'))) return;
    setActionLoading('cancel');
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/interviews/${interview!.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(api.getToken() ? { Authorization: `Bearer ${api.getToken()}` } : {}),
        },
      });
      push('success', t('interviewDetail.cancelled', 'Interview cancelled'));
      await load();
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('interviewDetail.cancelFailed', 'Failed to cancel interview'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddNotes = () => {
    push('info', t('interviewDetail.notesSoon', 'Notes editor will be available soon'));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Skeleton height={20} width={180} />
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-5">
              <Skeleton variant="circular" width={80} height={80} />
              <div className="flex-1 space-y-3">
                <Skeleton height={28} width="50%" />
                <Skeleton height={16} width="70%" />
                <div className="flex gap-2 mt-2">
                  <Skeleton height={24} width={90} />
                  <Skeleton height={24} width={70} />
                </div>
              </div>
              <div className="space-y-2 w-full sm:w-44">
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton height={180} />
            <Skeleton height={200} />
            <Skeleton height={160} />
          </div>
          <div className="space-y-6">
            <Skeleton height={180} />
            <Skeleton height={160} />
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Breadcrumb />
        <Link
          href="/dashboard/interviews"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition"
          aria-label={t('interviewDetail.backToInterviews', 'Back to interviews')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('interviewDetail.backToInterviews', 'Back to interviews')}
        </Link>
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title={t('interviewDetail.notFound', 'Interview not found')}
          description={t('interviewDetail.notFoundDesc', "The interview you're looking for doesn't exist or has been removed.")}
          action={
            <Link href="/dashboard/interviews">
              <Button variant="primary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                {t('interviewDetail.backToInterviews', 'Back to interviews')}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (error && !interview) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Breadcrumb />
        <Link
          href="/dashboard/interviews"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition"
          aria-label={t('interviewDetail.backToInterviews', 'Back to interviews')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('interviewDetail.backToInterviews', 'Back to interviews')}
        </Link>
        <Card>
          <CardContent className="p-0">
            <ErrorState
              title={t('interviewDetail.couldntLoad', "Couldn't load interview")}
              description={error}
              onRetry={load}
              retryLabel={t('common.retry', 'Retry')}
              fullHeight
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!interview) return null;

  const dateLabel = scheduledDate ? formatDate(interview.scheduled_at, locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—';
  const timeLabel = scheduledDate ? formatTime(interview.scheduled_at, locale) : '—';
  const dateTimeLabel = scheduledDate ? formatDateTime(interview.scheduled_at, locale) : '—';
  const canJoin = interview.status === 'scheduled' || interview.status === 'in_progress';
  const canStart = interview.status === 'scheduled';
  const canComplete = interview.status === 'in_progress';
  const canCancel = interview.status === 'scheduled' || interview.status === 'in_progress';

  return (
    <div className="space-y-6">
      <ToastContainer />

      <Breadcrumb />

      <Link
        href="/dashboard/interviews"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition"
        aria-label={t('interviewDetail.backToInterviews', 'Back to interviews')}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('interviewDetail.backToInterviews', 'Back to interviews')}
      </Link>

      <Card>
        <CardContent className="p-6">
          <header className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            <div
              className="h-20 w-20 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 flex items-center justify-center text-white text-2xl font-bold shrink-0 ring-4 ring-purple-100 dark:ring-purple-500/20"
              aria-hidden="true"
            >
              {candidateInitials}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
                {candidateName}
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="truncate">{jobTitle}</span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANT[interview.status] || 'default'} dot>
                  {interview.status?.replace('_', ' ')}
                </Badge>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${typeMeta.color}`}
                >
                  <TypeIcon className="h-3 w-3" aria-hidden="true" />
                  {typeMeta.label}
                </span>
                {aiScore !== null && (
                  <Badge variant="purple">
                    <Sparkles className="h-3 w-3 mr-0.5" aria-hidden="true" />
                    AI {aiScore}/100
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  {dateLabel}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <time dateTime={interview.scheduled_at}>{timeLabel}</time>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {interview.duration_minutes} {t('interviewDetail.min', 'min')}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:flex-col sm:items-stretch">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Video className="h-4 w-4" />}
                onClick={handleJoin}
                disabled={!canJoin || !interview.meeting_link}
                aria-label={t('interviewDetail.joinMeeting', 'Join meeting')}
              >
                {t('interviewDetail.joinMeeting', 'Join meeting')}
              </Button>
              {canStart && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Play className="h-4 w-4" />}
                  onClick={handleStart}
                  loading={actionLoading === 'start'}
                  aria-label={t('interviewDetail.start', 'Start interview')}
                >
                  {t('interviewDetail.start', 'Start')}
                </Button>
              )}
              {canComplete && (
                <Button
                  variant="success"
                  size="sm"
                  leftIcon={<CheckCircle2 className="h-4 w-4" />}
                  onClick={handleComplete}
                  loading={actionLoading === 'complete'}
                  aria-label={t('interviewDetail.complete', 'Complete interview')}
                >
                  {t('interviewDetail.complete', 'Complete')}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Edit3 className="h-4 w-4" />}
                onClick={handleReschedule}
                disabled={!canCancel}
                aria-label={t('interviewDetail.reschedule', 'Reschedule')}
              >
                {t('interviewDetail.reschedule', 'Reschedule')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<MessageSquare className="h-4 w-4" />}
                onClick={handleAddNotes}
                aria-label={t('interviewDetail.addNotes', 'Add notes')}
              >
                {t('interviewDetail.addNotes', 'Add notes')}
              </Button>
              {canCancel && (
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<XCircle className="h-4 w-4" />}
                  onClick={handleCancel}
                  loading={actionLoading === 'cancel'}
                  aria-label={t('interviewDetail.cancel', 'Cancel interview')}
                >
                  {t('interviewDetail.cancel', 'Cancel')}
                </Button>
              )}
            </div>
          </header>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section aria-labelledby="details-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2 id="details-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('interviewDetail.details', 'Interview details')}
                  </h2>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <dt className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" aria-hidden="true" />
                      {t('interviewDetail.scheduled', 'Scheduled')}
                    </dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-white">
                      <time dateTime={interview.scheduled_at}>{dateTimeLabel}</time>
                    </dd>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <dt className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {t('interviewDetail.duration', 'Duration')}
                    </dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-white">
                      {interview.duration_minutes} {t('interviewDetail.minutes', 'minutes')}
                    </dd>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <dt className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                      <TypeIcon className="h-3 w-3" aria-hidden="true" />
                      {t('interviewDetail.type', 'Type')}
                    </dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-white">
                      {typeMeta.label}
                    </dd>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <dt className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                      {interview.meeting_link ? (
                        <Video className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                      )}
                      {interview.meeting_link ? t('interviewDetail.meetingLink', 'Meeting link') : t('interviewDetail.location', 'Location')}
                    </dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-white">
                      {interview.meeting_link ? (
                        <a
                          href={interview.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline break-all"
                        >
                          <span className="truncate max-w-[16rem]">{interview.meeting_link}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                        </a>
                      ) : interview.location ? (
                        interview.location
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="interviewers-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2 id="interviewers-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('interviewDetail.interviewers', 'Interviewers')}
                  </h2>
                  <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                    {interviewerList.length} {t('interviewDetail.assigned', 'assigned')}
                  </span>
                </div>
                {interviewerList.length > 0 ? (
                  <ul className="space-y-2">
                    {interviewerList.map((person, idx) => {
                      const initials = person
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase();
                      return (
                        <li
                          key={`${person}-${idx}`}
                          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                        >
                          <div
                            className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0"
                            aria-hidden="true"
                          >
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{person}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t('interviewDetail.panelMember', 'Panel member')}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {t('interviewDetail.noInterviewers', 'No interviewers assigned yet.')}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          {aiScore !== null || aiFeedback ? (
            <section aria-labelledby="ai-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden="true" />
                    <h2 id="ai-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {t('interviewDetail.aiEvaluation', 'AI evaluation')}
                    </h2>
                  </div>
                  {aiScore !== null && (
                    <div className="flex items-baseline gap-3 mb-3">
                      <span className="text-4xl font-bold text-gray-900 dark:text-white">{aiScore}</span>
                      <span className="text-lg text-gray-500 dark:text-gray-400">/ 100</span>
                      <div className="ml-auto flex items-center gap-1 text-amber-500">
                        <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                        <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                        <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                      </div>
                    </div>
                  )}
                  {aiScore !== null && (
                    <div
                      className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 overflow-hidden mb-4"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, aiScore))}%` }}
                      />
                    </div>
                  )}
                  {aiFeedback ? (
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {aiFeedback}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      {t('interviewDetail.noAiFeedback', 'No AI feedback available yet.')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>
          ) : null}

          <section aria-labelledby="notes-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2 id="notes-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('interviewDetail.notes', 'Notes & preparation')}
                  </h2>
                </div>
                {interview.notes ? (
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {interview.notes}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {t('interviewDetail.noNotes', 'No preparation notes yet. Use the "Add notes" button to add some.')}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        <aside className="space-y-6">
          {(candidate || interview.candidate_email || interview.candidate_name) && (
            <section aria-labelledby="candidate-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <User className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2 id="candidate-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {t('interviewDetail.candidate', 'Candidate')}
                    </h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold shrink-0"
                      aria-hidden="true"
                    >
                      {candidateInitials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{candidateName}</p>
                      {(candidate?.email || interview.candidate_email) && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {candidate?.email || interview.candidate_email}
                        </p>
                      )}
                    </div>
                  </div>
                  {interview.candidate_id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                      <Link
                        href={`/dashboard/candidates/${interview.candidate_id}`}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
                      >
                        {t('interviewDetail.viewProfile', 'View full profile')}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {(job || interview.job_title) && (
            <section aria-labelledby="job-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Briefcase className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2 id="job-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {t('interviewDetail.job', 'Job')}
                    </h2>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{jobTitle}</p>
                  {(job?.location || interview.location) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {job?.location || interview.location}
                    </p>
                  )}
                  {interview.job_id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                      <Link
                        href={`/dashboard/jobs/${interview.job_id}`}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
                      >
                        {t('interviewDetail.viewJob', 'View job posting')}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {(interview.started_at || interview.completed_at || isPast) && (
            <Card>
              <CardContent className="p-6 space-y-3 text-sm">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 uppercase text-xs font-bold tracking-wider">
                  <Award className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('interviewDetail.timeline', 'Timeline')}
                </div>
                {interview.started_at && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">{t('interviewDetail.started', 'Started')}</span>
                    <span className="font-medium text-gray-900 dark:text-white text-right">
                      {formatDateTime(interview.started_at, locale)}
                    </span>
                  </div>
                )}
                {interview.completed_at && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">{t('interviewDetail.completed', 'Completed')}</span>
                    <span className="font-medium text-gray-900 dark:text-white text-right">
                      {formatDateTime(interview.completed_at, locale)}
                    </span>
                  </div>
                )}
                {interview.recording_url && (
                  <a
                    href={interview.recording_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                  >
                    <Video className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('interviewDetail.recording', 'Watch recording')}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
