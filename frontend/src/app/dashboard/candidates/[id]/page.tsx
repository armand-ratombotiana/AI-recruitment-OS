'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Star,
  Calendar,
  MessageSquare,
  Plus,
  FileText,
  Clock,
  User,
  Award,
  TrendingUp,
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
  Timeline,
} from '@/components';
import type { TimelineItem } from '@/components/ui/timeline';
import { useLocaleStore, translate, formatRelativeTime, formatDate } from '@/stores/locale-store';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'purple' | 'default' | 'danger'> = {
  active: 'info',
  interviewing: 'purple',
  screening: 'warning',
  offer: 'success',
  hired: 'success',
  rejected: 'danger',
  new: 'default',
  ppe: 'warning',
};

interface CandidateDetail {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  status: string;
  skills: string[];
  experience_years?: number;
  score?: number;
  headline?: string | null;
  linkedin?: string | null;
  portfolio?: string | null;
  notes?: string | null;
  match_scores?: Record<string, number> | null;
  created_at?: string;
  updated_at?: string;
  enrichment?: Record<string, unknown> | null;
  profile?: {
    experience?: Array<{ company: string; title: string; start_date?: string; end_date?: string | null }>;
    summary?: string;
  } | null;
}

interface InterviewItem {
  id: string;
  candidate_id?: string;
  status: string;
  scheduled_at?: string;
  type?: string;
  title?: string;
}

export default function CandidateDetailPage({ params }: { params: { id: string } }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
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
      const data: any = await api.getCandidate(params.id);
      const detail: CandidateDetail = data?.data || data;
      if (!detail || !detail.id) {
        setNotFound(true);
        setCandidate(null);
      } else {
        setCandidate(detail);
      }
      try {
        const iv: any = await api.listInterviews({ candidate_id: params.id });
        const items = iv?.data || iv?.items || iv || [];
        setInterviews(Array.isArray(items) ? items : []);
      } catch {
        setInterviews([]);
      }
    } catch (err) {
      const e = err as APIError;
      if (e?.status === 404) {
        setNotFound(true);
        setCandidate(null);
      } else {
        setError(e?.message || t('candidateDetail.couldntLoad', "Couldn't load candidate"));
        setCandidate(null);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const initials = useMemo(() => {
    if (!candidate?.full_name) return '?';
    return candidate.full_name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [candidate?.full_name]);

  const matchScore = useMemo(() => {
    if (!candidate) return null;
    if (typeof candidate.score === 'number') return candidate.score;
    if (candidate.match_scores && typeof candidate.match_scores === 'object') {
      const values = Object.values(candidate.match_scores).filter((v) => typeof v === 'number');
      if (values.length === 0) return null;
      const max = Math.max(...values);
      return Math.round(max * 100);
    }
    return null;
  }, [candidate]);

  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];
    if (interviews.length > 0) {
      interviews.forEach((iv) => {
        if (!iv.scheduled_at) return;
        const typeLabel = iv.type ? iv.type.charAt(0).toUpperCase() + iv.type.slice(1) : 'Interview';
        items.push({
          id: `iv-${iv.id}`,
          title: `${typeLabel} ${t('candidateDetail.timeline.scheduled', 'scheduled')}`,
          description: iv.title || `${typeLabel} ${t('candidateDetail.timeline.interview', 'interview')}`,
          timestamp: iv.scheduled_at,
          icon: <Calendar className="h-3.5 w-3.5" />,
          color: iv.status === 'completed' ? 'green' : iv.status === 'cancelled' ? 'red' : 'blue',
        });
      });
    }
    if (candidate?.created_at) {
      items.push({
        id: 'created',
        title: t('candidateDetail.timeline.added', 'Added to talent pool'),
        description: candidate.email,
        timestamp: candidate.created_at,
        icon: <User className="h-3.5 w-3.5" />,
        color: 'purple',
      });
    }
    if (candidate?.updated_at && candidate.updated_at !== candidate.created_at) {
      items.push({
        id: 'updated',
        title: t('candidateDetail.timeline.updated', 'Profile updated'),
        timestamp: candidate.updated_at,
        icon: <FileText className="h-3.5 w-3.5" />,
        color: 'gray',
      });
    }
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviews, candidate]);

  const handleScheduleInterview = async () => {
    setActionLoading('schedule');
    try {
      await api.createInterview({ candidate_id: params.id } as any);
      push('success', t('candidateDetail.scheduleStarted', 'Interview scheduling opened'));
    } catch (err) {
      const e = err as APIError;
      push('info', t('candidateDetail.scheduleSoon', 'Interview scheduling will be available soon'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendMessage = () => {
    push('info', t('candidateDetail.messageSoon', 'Messaging will be available soon'));
  };

  const handleAddToPipeline = async () => {
    setActionLoading('pipeline');
    try {
      await api.updateCandidate(params.id, { status: 'active' } as any);
      push('success', t('candidateDetail.addedToPipeline', 'Added to pipeline'));
      await load();
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('candidateDetail.pipelineFailed', 'Failed to add to pipeline'));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Skeleton height={20} width={180} />
        <Skeleton height={40} width={260} />
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-5">
              <Skeleton variant="circular" width={80} height={80} />
              <div className="flex-1 space-y-3">
                <Skeleton height={24} width="50%" />
                <Skeleton height={16} width="70%" />
                <Skeleton height={16} width="40%" />
              </div>
              <div className="space-y-2">
                <Skeleton height={40} width={140} />
                <Skeleton height={40} width={140} />
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton height={180} />
            <Skeleton height={140} />
            <Skeleton height={160} />
          </div>
          <div className="space-y-6">
            <Skeleton height={160} />
            <Skeleton height={200} />
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
          href="/dashboard/candidates"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition"
          aria-label={t('candidateDetail.backToCandidates', 'Back to candidates')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('candidateDetail.backToCandidates', 'Back to candidates')}
        </Link>
        <EmptyState
          icon={<User className="h-12 w-12" />}
          title={t('candidateDetail.notFound', 'Candidate not found')}
          description={t('candidateDetail.notFoundDesc', "The candidate you're looking for doesn't exist or has been removed.")}
          action={
            <Link href="/dashboard/candidates">
              <Button variant="primary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                {t('candidateDetail.backToCandidates', 'Back to candidates')}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (error && !candidate) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Breadcrumb />
        <Link
          href="/dashboard/candidates"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition"
          aria-label={t('candidateDetail.backToCandidates', 'Back to candidates')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('candidateDetail.backToCandidates', 'Back to candidates')}
        </Link>
        <Card>
          <CardContent className="p-0">
            <ErrorState
              title={t('candidateDetail.couldntLoad', "Couldn't load candidate")}
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

  if (!candidate) return null;

  const experienceList = candidate.profile?.experience || [];
  const createdDate = candidate.created_at ? formatDate(candidate.created_at, locale) : null;
  const lastUpdated = candidate.updated_at ? formatRelativeTime(candidate.updated_at, locale) : null;

  return (
    <div className="space-y-6">
      <ToastContainer />

      <Breadcrumb />

      <Link
        href="/dashboard/candidates"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition"
        aria-label={t('candidateDetail.backToCandidates', 'Back to candidates')}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('candidateDetail.backToCandidates', 'Back to candidates')}
      </Link>

      <Card>
        <CardContent className="p-6">
          <header className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            <div
              className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold shrink-0 ring-4 ring-blue-100 dark:ring-blue-500/20"
              aria-hidden="true"
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
                {candidate.full_name}
              </h1>
              {candidate.headline && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{candidate.headline}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANT[candidate.status] || 'default'} dot>
                  {candidate.status}
                </Badge>
                {matchScore !== null && (
                  <Badge variant="info">
                    <Star className="h-3 w-3 fill-current mr-0.5" aria-hidden="true" />
                    {t('candidateDetail.matchScore', 'Match')} {matchScore}%
                  </Badge>
                )}
                {candidate.experience_years !== undefined && candidate.experience_years !== null && (
                  <Badge variant="outline">
                    <Briefcase className="h-3 w-3 mr-0.5" aria-hidden="true" />
                    {candidate.experience_years} {t('candidateDetail.years', 'years')}
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <a
                  href={`mailto:${candidate.email}`}
                  className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition"
                  aria-label={`Email ${candidate.full_name}`}
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  {candidate.email}
                </a>
                {candidate.phone && (
                  <a
                    href={`tel:${candidate.phone}`}
                    className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition"
                    aria-label={`Call ${candidate.full_name}`}
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {candidate.phone}
                  </a>
                )}
                {candidate.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {candidate.location}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:flex-col sm:items-stretch">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Calendar className="h-4 w-4" />}
                onClick={handleScheduleInterview}
                loading={actionLoading === 'schedule'}
                aria-label={t('candidateDetail.scheduleInterview', 'Schedule interview')}
              >
                {t('candidateDetail.scheduleInterview', 'Schedule interview')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<MessageSquare className="h-4 w-4" />}
                onClick={handleSendMessage}
                aria-label={t('candidateDetail.sendMessage', 'Send message')}
              >
                {t('candidateDetail.sendMessage', 'Send message')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={handleAddToPipeline}
                loading={actionLoading === 'pipeline'}
                aria-label={t('candidateDetail.addToPipeline', 'Add to pipeline')}
              >
                {t('candidateDetail.addToPipeline', 'Add to pipeline')}
              </Button>
            </div>
          </header>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section aria-labelledby="contact-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2 id="contact-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('candidateDetail.contactInfo', 'Contact information')}
                  </h2>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <dt className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                      <Mail className="h-3 w-3" aria-hidden="true" />
                      {t('candidateDetail.email', 'Email')}
                    </dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-white break-all">
                      <a href={`mailto:${candidate.email}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                        {candidate.email}
                      </a>
                    </dd>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <dt className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                      <Phone className="h-3 w-3" aria-hidden="true" />
                      {t('candidateDetail.phone', 'Phone')}
                    </dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-white">
                      {candidate.phone ? (
                        <a href={`tel:${candidate.phone}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                          {candidate.phone}
                        </a>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </dd>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg sm:col-span-2">
                    <dt className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {t('candidateDetail.location', 'Location')}
                    </dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-white">
                      {candidate.location || <span className="text-gray-400 dark:text-gray-500">—</span>}
                    </dd>
                  </div>
                </dl>
                {(candidate.linkedin || candidate.portfolio) && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 flex flex-wrap gap-3 text-sm">
                    {candidate.linkedin && (
                      <a
                        href={candidate.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                      >
                        LinkedIn
                      </a>
                    )}
                    {candidate.portfolio && (
                      <a
                        href={candidate.portfolio}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                      >
                        Portfolio
                      </a>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="skills-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Award className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2 id="skills-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('candidateDetail.skills', 'Skills')}
                  </h2>
                  <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                    {candidate.skills?.length || 0} {t('candidateDetail.total', 'total')}
                  </span>
                </div>
                {candidate.skills && candidate.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {candidate.skills.map((s) => (
                      <span
                        key={s}
                        className="px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 font-medium border border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('candidateDetail.noSkills', 'No skills listed yet.')}</p>
                )}
              </CardContent>
            </Card>
          </section>

          {experienceList.length > 0 && (
            <section aria-labelledby="experience-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Briefcase className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2 id="experience-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {t('candidateDetail.experience', 'Experience')}
                    </h2>
                  </div>
                  <ol className="space-y-3">
                    {experienceList.map((exp, idx) => (
                      <li
                        key={`${exp.company}-${idx}`}
                        className="flex gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                      >
                        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {exp.company?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{exp.title}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{exp.company}</p>
                          {(exp.start_date || exp.end_date) && (
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 flex items-center gap-1">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {exp.start_date || '—'} → {exp.end_date || t('candidateDetail.present', 'Present')}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          {matchScore !== null && (
            <section aria-labelledby="match-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2 id="match-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {t('candidateDetail.matchScoreTitle', 'Match score')}
                    </h2>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-gray-900 dark:text-white">{matchScore}</span>
                    <span className="text-lg text-gray-500 dark:text-gray-400">/ 100</span>
                  </div>
                  <div className="mt-3 w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 overflow-hidden" aria-hidden="true">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, matchScore))}%` }}
                    />
                  </div>
                  {candidate.match_scores && typeof candidate.match_scores === 'object' && (
                    <ul className="mt-4 space-y-2">
                      {Object.entries(candidate.match_scores).map(([job, score]) => (
                        <li key={job} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 dark:text-gray-400 truncate">{job}</span>
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {Math.round((score as number) * 100)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          <section aria-labelledby="notes-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2 id="notes-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('candidateDetail.notes', 'Notes')}
                  </h2>
                </div>
                {candidate.notes ? (
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {candidate.notes}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {t('candidateDetail.noNotes', 'No notes added yet.')}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="activity-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2 id="activity-section-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('candidateDetail.activity', 'Activity')}
                  </h2>
                </div>
                {timelineItems.length > 0 ? (
                  <Timeline items={timelineItems} ariaLabel={t('candidateDetail.activityTimeline', 'Candidate activity timeline')} />
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {t('candidateDetail.noActivity', 'No activity recorded yet.')}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          {(createdDate || lastUpdated) && (
            <Card>
              <CardContent className="p-4 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                {createdDate && (
                  <p>{t('candidateDetail.addedOn', 'Added on')} <span className="font-medium text-gray-700 dark:text-gray-300">{createdDate}</span></p>
                )}
                {lastUpdated && (
                  <p>{t('candidateDetail.lastUpdated', 'Last updated')} <span className="font-medium text-gray-700 dark:text-gray-300">{lastUpdated}</span></p>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
