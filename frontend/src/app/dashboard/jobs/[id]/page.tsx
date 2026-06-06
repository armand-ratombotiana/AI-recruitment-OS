'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  Users,
  Calendar,
  DollarSign,
  FileText,
  Share2,
  Edit3,
  XCircle,
  ExternalLink,
  Clock,
  CheckCircle,
  UserPlus,
  Building2,
  Globe,
  TrendingUp,
  Award,
  LayoutGrid,
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
  Tabs,
  useToast,
} from '@/components';
import { JobApplicantsKanban } from '@/components/dashboard/job-applicants-kanban';
import { useLocaleStore, translate, formatDate, formatRelativeTime, formatNumber } from '@/stores/locale-store';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'purple' | 'default' | 'danger' | 'orange' | 'teal'> = {
  open: 'success',
  draft: 'warning',
  closed: 'default',
  on_hold: 'info',
  paused: 'warning',
  archived: 'default',
};

const PIPELINE_STAGE_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'purple' | 'default' | 'danger' | 'orange' | 'teal'> = {
  active: 'info',
  screening: 'warning',
  ppe: 'orange',
  interviewing: 'purple',
  interview: 'purple',
  offer: 'teal',
  hired: 'success',
  rejected: 'danger',
  new: 'default',
  applied: 'default',
};

interface JobDetail {
  id: string;
  title: string;
  company?: string;
  department?: string;
  location: string;
  employment_type?: string;
  type?: string;
  status: string;
  applicants_count?: number;
  created_at?: string;
  updated_at?: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency?: string | null;
  description?: string;
  requirements?: string[] | string;
  nice_to_have?: string[];
  benefits?: string[];
  skills?: string[];
  experience_years_min?: number | null;
  experience_years_max?: number | null;
  remote?: boolean;
}

interface Applicant {
  id: string;
  full_name?: string;
  name?: string;
  email?: string;
  status?: string;
  score?: number | null;
  created_at?: string;
  applied_at?: string;
}

interface PipelineStage {
  stage: string;
  count: number;
  candidates?: Array<{ id: string; full_name?: string; days_in_stage?: number }>;
}

interface PipelineData {
  stages: PipelineStage[];
}

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'applicants'>('overview');
  const { push, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data: any = await api.getJob(params.id);
      const detail: JobDetail = data?.data || data;
      if (!detail || !detail.id) {
        setNotFound(true);
        setJob(null);
      } else {
        setJob(detail);
      }

      try {
        const list: any = await api.listCandidates({ job_id: params.id });
        const items = list?.data || list?.items || list || [];
        setApplicants(Array.isArray(items) ? items.slice(0, 5) : []);
      } catch {
        setApplicants([]);
      }

      try {
        const pl: any = await api.getPipelineAnalytics();
        const pData: PipelineData = pl?.data || pl;
        if (pData && Array.isArray(pData.stages)) {
          const filtered = pData.stages.filter((s: PipelineStage) => {
            if (!s.candidates || s.candidates.length === 0) return true;
            return true;
          });
          setPipeline({ stages: filtered });
        } else {
          setPipeline({ stages: [] });
        }
      } catch {
        setPipeline({ stages: [] });
      }
    } catch (err) {
      const e = err as APIError;
      if (e?.status === 404) {
        setNotFound(true);
        setJob(null);
      } else {
        setError(e?.message || t('jobDetail.couldntLoad', "Couldn't load job"));
        setJob(null);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const formatSalary = useCallback(
    (min: number | null, max: number | null, currency: string | null | undefined) => {
      if (!min && !max) return null;
      const cur = currency || 'USD';
      try {
        const fmt = (n: number) =>
          new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : 'en-US', {
            style: 'currency',
            currency: cur,
            maximumFractionDigits: 0,
          }).format(n);
        if (min && max) return `${fmt(min)} – ${fmt(max)}`;
        if (min) return `${t('jobDetail.from', 'From')} ${fmt(min)}`;
        return `${t('jobDetail.upTo', 'Up to')} ${fmt(max!)}`;
      } catch {
        const fmt = (n: number) => `${cur} ${formatNumber(n, locale, { maximumFractionDigits: 0 })}`;
        if (min && max) return `${fmt(min)} – ${fmt(max)}`;
        if (min) return `${t('jobDetail.from', 'From')} ${fmt(min)}`;
        return `${t('jobDetail.upTo', 'Up to')} ${fmt(max!)}`;
      }
    },
    [locale, t]
  );

  const skills = useMemo(() => {
    if (!job) return [];
    if (Array.isArray(job.skills)) return job.skills;
    if (typeof job.skills === 'string') {
      try {
        const parsed = JSON.parse(job.skills);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return (job.skills as unknown as string).split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    return [];
  }, [job]);

  const requirements = useMemo(() => {
    if (!job) return [] as string[];
    if (Array.isArray(job.requirements)) return job.requirements;
    if (typeof job.requirements === 'string') {
      return (job.requirements as unknown as string)
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }, [job]);

  const niceToHave = useMemo(() => job?.nice_to_have || [], [job]);
  const benefits = useMemo(() => job?.benefits || [], [job]);

  const pipelineTotal = useMemo(() => {
    if (!pipeline?.stages) return 0;
    return pipeline.stages.reduce((sum, s) => sum + (s.count || 0), 0);
  }, [pipeline]);

  const totalApplicants = job?.applicants_count ?? applicants.length ?? pipelineTotal;
  const interviewsScheduled = useMemo(() => {
    if (!pipeline?.stages) return 0;
    const stage = pipeline.stages.find(
      (s) => s.stage === 'interviewing' || s.stage === 'interview' || s.stage === 'scheduled'
    );
    return stage?.count || 0;
  }, [pipeline]);
  const offersExtended = useMemo(() => {
    if (!pipeline?.stages) return 0;
    const stage = pipeline.stages.find((s) => s.stage === 'offer' || s.stage === 'offer_extended');
    return stage?.count || 0;
  }, [pipeline]);
  const hires = useMemo(() => {
    if (!pipeline?.stages) return 0;
    const stage = pipeline.stages.find((s) => s.stage === 'hired');
    return stage?.count || 0;
  }, [pipeline]);

  const handleEdit = () => {
    push('info', t('jobDetail.editSoon', 'Edit job form will open shortly'));
  };

  const handleShare = async () => {
    if (typeof window === 'undefined' || !job) return;
    const url = `${window.location.origin}/dashboard/jobs/${job.id}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setShareCopied(true);
      push('success', t('jobDetail.linkCopied', 'Job link copied to clipboard'));
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      push('error', t('jobDetail.shareFailed', 'Could not copy link'));
    }
  };

  const handleClose = async () => {
    if (!job) return;
    setActionLoading('close');
    try {
      await api.jobs.update(job.id, { status: 'closed' } as any);
      push('success', t('jobDetail.closed', 'Job closed'));
      await load();
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('jobDetail.closeFailed', 'Failed to close job'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewPipeline = () => {
    if (typeof window !== 'undefined' && job) {
      window.location.href = `/dashboard/pipeline?job_id=${job.id}`;
    }
  };

  const handleApplicantClick = (id: string) => {
    if (typeof window !== 'undefined') {
      window.location.href = `/dashboard/candidates/${id}`;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Skeleton height={20} width={180} />
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-5">
              <div className="space-y-2 flex-1">
                <Skeleton height={32} width="60%" />
                <Skeleton height={16} width="40%" />
                <div className="flex gap-2 mt-3">
                  <Skeleton height={24} width={80} />
                  <Skeleton height={24} width={120} />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton height={40} width={140} />
                <Skeleton height={40} width={140} />
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton height={220} />
            <Skeleton height={160} />
            <Skeleton height={200} />
          </div>
          <div className="space-y-6">
            <Skeleton height={180} />
            <Skeleton height={220} />
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
          href="/dashboard/jobs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          aria-label={t('jobDetail.backToJobs', 'Back to jobs')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('jobDetail.backToJobs', 'Back to jobs')}
        </Link>
        <EmptyState
          icon={<Briefcase className="h-12 w-12" />}
          title={t('jobDetail.notFound', 'Job not found')}
          description={t(
            'jobDetail.notFoundDesc',
            "The job you're looking for doesn't exist or has been removed."
          )}
          action={
            <Link href="/dashboard/jobs">
              <Button variant="primary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                {t('jobDetail.backToJobs', 'Back to jobs')}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Breadcrumb />
        <Link
          href="/dashboard/jobs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          aria-label={t('jobDetail.backToJobs', 'Back to jobs')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('jobDetail.backToJobs', 'Back to jobs')}
        </Link>
        <Card>
          <CardContent className="p-0">
            <ErrorState
              title={t('jobDetail.couldntLoad', "Couldn't load job")}
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

  if (!job) return null;

  const postedDate = job.created_at ? formatDate(job.created_at, locale) : null;
  const postedRelative = job.created_at ? formatRelativeTime(job.created_at, locale) : null;
  const salaryText = formatSalary(job.salary_min, job.salary_max, job.currency);
  const typeLabel = job.employment_type || job.type || 'Full-time';
  const isClosed = job.status === 'closed' || job.status === 'archived';
  const expText =
    job.experience_years_min != null && job.experience_years_max != null
      ? `${job.experience_years_min}–${job.experience_years_max} ${t('jobDetail.years', 'years')}`
      : job.experience_years_min != null
        ? `${t('jobDetail.minYears', 'Min.')} ${job.experience_years_min} ${t('jobDetail.years', 'years')}`
        : null;

  return (
    <div className="space-y-6">
      <ToastContainer />

      <Breadcrumb />

      <Link
        href="/dashboard/jobs"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        aria-label={t('jobDetail.backToJobs', 'Back to jobs')}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('jobDetail.backToJobs', 'Back to jobs')}
      </Link>

      <Card>
        <CardContent className="p-6">
          <header className="flex flex-col lg:flex-row gap-5 items-start lg:items-center">
            <div
              className="h-16 w-16 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center text-white shrink-0 ring-4 ring-blue-100 dark:ring-blue-500/20"
              aria-hidden="true"
            >
              <Briefcase className="h-8 w-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words">
                {job.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                {job.department && (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {job.department}
                  </span>
                )}
                {job.company && !job.department && (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {job.company}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {job.location || t('jobDetail.remote', 'Remote')}
                </span>
                {job.remote && (
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('jobDetail.remote', 'Remote')}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {typeLabel}
                </span>
                {postedRelative && (
                  <span
                    className="inline-flex items-center gap-1.5"
                    title={postedDate || undefined}
                  >
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    {postedRelative}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANT[job.status] || 'default'} dot>
                  {job.status}
                </Badge>
                {salaryText && (
                  <Badge variant="indigo">
                    <DollarSign className="h-3 w-3" aria-hidden="true" />
                    {salaryText}
                  </Badge>
                )}
                {expText && (
                  <Badge variant="outline">
                    <Award className="h-3 w-3" aria-hidden="true" />
                    {expText}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 w-full lg:w-auto lg:flex-col lg:items-stretch">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Edit3 className="h-4 w-4" />}
                onClick={handleEdit}
                aria-label={t('jobDetail.editJob', 'Edit job')}
              >
                {t('jobDetail.editJob', 'Edit job')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Share2 className="h-4 w-4" />}
                onClick={handleShare}
                aria-label={t('jobDetail.share', 'Share job')}
              >
                {shareCopied ? t('jobDetail.copied', 'Copied!') : t('jobDetail.share', 'Share')}
              </Button>
              {!isClosed && (
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<XCircle className="h-4 w-4" />}
                  onClick={handleClose}
                  loading={actionLoading === 'close'}
                  aria-label={t('jobDetail.closeJob', 'Close job')}
                >
                  {t('jobDetail.closeJob', 'Close job')}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                leftIcon={<ExternalLink className="h-4 w-4" />}
                onClick={handleViewPipeline}
                aria-label={t('jobDetail.viewPipeline', 'View pipeline')}
              >
                {t('jobDetail.viewPipeline', 'View pipeline')}
              </Button>
            </div>
          </header>
        </CardContent>
      </Card>

      <section
        aria-label={t('jobDetail.statsLabel', 'Job statistics')}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {t('jobDetail.totalApplicants', 'Total applicants')}
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {formatNumber(totalApplicants, locale)}
          </p>
        </div>
        <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            {t('jobDetail.interviewsScheduled', 'Interviews scheduled')}
          </div>
          <p className="mt-1 text-2xl font-bold text-purple-600 dark:text-purple-400">
            {formatNumber(interviewsScheduled, locale)}
          </p>
        </div>
        <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {t('jobDetail.offersExtended', 'Offers extended')}
          </div>
          <p className="mt-1 text-2xl font-bold text-teal-600 dark:text-teal-400">
            {formatNumber(offersExtended, locale)}
          </p>
        </div>
        <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('jobDetail.hires', 'Hires')}
          </div>
          <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
            {formatNumber(hires, locale)}
          </p>
        </div>
      </section>

      <Tabs
        tabs={[
          {
            id: 'overview',
            label: t('jobDetail.tabs.overview', 'Overview'),
            icon: <LayoutGrid className="h-4 w-4" aria-hidden="true" />,
          },
          {
            id: 'applicants',
            label: t('jobDetail.tabs.applicants', 'Applicants'),
            icon: <Users className="h-4 w-4" aria-hidden="true" />,
            badge: (
              <Badge variant="info" size="sm">
                {formatNumber(totalApplicants, locale)}
              </Badge>
            ),
          },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as 'overview' | 'applicants')}
        variant="underline"
        size="md"
      >
        {(active) => (
          <div className={active === 'overview' ? 'space-y-6' : ''}>
            {active === 'applicants' ? (
              <JobApplicantsKanban jobId={params.id} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section aria-labelledby="description-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2
                    id="description-section-title"
                    className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    {t('jobDetail.description', 'Description')}
                  </h2>
                </div>
                {job.description ? (
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {job.description}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {t('jobDetail.noDescription', 'No description provided.')}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="requirements-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2
                    id="requirements-section-title"
                    className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    {t('jobDetail.requirements', 'Requirements')}
                  </h2>
                </div>
                {requirements.length > 0 ? (
                  <ul className="space-y-2">
                    {requirements.map((r, idx) => (
                      <li
                        key={`${r}-${idx}`}
                        className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                      >
                        <CheckCircle
                          className="h-4 w-4 text-green-500 mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="flex-1">{r}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {t('jobDetail.noRequirements', 'No specific requirements listed.')}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="skills-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Award className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2
                    id="skills-section-title"
                    className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    {t('jobDetail.skills', 'Skills')}
                  </h2>
                  <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                    {skills.length} {t('jobDetail.total', 'total')}
                  </span>
                </div>
                {skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {skills.map((s) => (
                      <span
                        key={s}
                        className="px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 font-medium border border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {t('jobDetail.noSkills', 'No skills listed.')}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          {applicants.length > 0 && (
            <section aria-labelledby="applicants-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2
                      id="applicants-section-title"
                      className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      {t('jobDetail.recentApplicants', 'Recent applicants')}
                    </h2>
                    <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                      {t('jobDetail.topFive', 'Top 5')}
                    </span>
                  </div>
                  <ul className="space-y-2" role="list">
                    {applicants.map((a) => {
                      const name = a.full_name || a.name || a.email || t('jobDetail.unnamed', 'Unnamed');
                      const initials = name
                        .split(' ')
                        .filter(Boolean)
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase();
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => handleApplicantClick(a.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-surface-700 hover:bg-gray-50 dark:hover:bg-surface-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            aria-label={t('jobDetail.viewApplicant', 'View applicant {name}').replace(
                              '{name}',
                              name
                            )}
                          >
                            <div
                              className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0"
                              aria-hidden="true"
                            >
                              {initials || '?'}
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {name}
                              </p>
                              {a.email && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.email}</p>
                              )}
                            </div>
                            {a.status && (
                              <Badge variant={PIPELINE_STAGE_VARIANT[a.status] || 'default'} size="sm">
                                {a.status}
                              </Badge>
                            )}
                            {typeof a.score === 'number' && (
                              <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                                {Math.round(a.score)}
                              </span>
                            )}
                            <ExternalLink
                              className="h-3.5 w-3.5 text-gray-400 shrink-0"
                              aria-hidden="true"
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="pipeline-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2
                    id="pipeline-section-title"
                    className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    {t('jobDetail.pipelineProgress', 'Pipeline progress')}
                  </h2>
                </div>
                {pipeline && pipeline.stages.length > 0 ? (
                  <ol className="space-y-2.5" role="list">
                    {pipeline.stages.map((stage) => {
                      const pct = pipelineTotal > 0 ? Math.round((stage.count / pipelineTotal) * 100) : 0;
                      return (
                        <li key={stage.stage}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                              {stage.stage.replace(/_/g, ' ')}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400 font-semibold">
                              {stage.count}
                            </span>
                          </div>
                          <div
                            className="h-1.5 bg-gray-100 dark:bg-surface-800 rounded-full overflow-hidden"
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${stage.stage}: ${stage.count}`}
                          >
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {t('jobDetail.noPipeline', 'No pipeline data yet.')}
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          {salaryText && (
            <section aria-labelledby="salary-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2
                      id="salary-section-title"
                      className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      {t('jobDetail.salaryRange', 'Salary range')}
                    </h2>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{salaryText}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('jobDetail.perYear', 'per year')}
                  </p>
                </CardContent>
              </Card>
            </section>
          )}

          {(niceToHave.length > 0 || benefits.length > 0) && (
            <section aria-labelledby="perks-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Award className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2
                      id="perks-section-title"
                      className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      {t('jobDetail.perks', 'Perks & benefits')}
                    </h2>
                  </div>
                  {benefits.length > 0 && (
                    <ul className="space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
                      {benefits.map((b, i) => (
                        <li key={`b-${i}`} className="flex items-start gap-2">
                          <CheckCircle
                            className="h-4 w-4 text-green-500 mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {niceToHave.length > 0 && (
                    <>
                      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('jobDetail.niceToHave', 'Nice to have')}
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
                        {niceToHave.map((n, i) => (
                          <li key={`n-${i}`} className="flex items-start gap-2">
                            <span
                              className="h-4 w-4 mt-0.5 shrink-0 rounded-full border-2 border-gray-300 dark:border-surface-600"
                              aria-hidden="true"
                            />
                            <span>{n}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {(postedDate || postedRelative) && (
            <Card>
              <CardContent className="p-4 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                {postedDate && (
                  <p>
                    {t('jobDetail.postedOn', 'Posted on')}{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-300">{postedDate}</span>
                  </p>
                )}
                {postedRelative && (
                  <p>
                    {t('jobDetail.lastUpdated', 'Last updated')}{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-300">{postedRelative}</span>
                  </p>
                )}
                <p>
                  {t('jobDetail.idLabel', 'Job ID')}{' '}
                  <span className="font-mono text-[10px] text-gray-600 dark:text-gray-400">{job.id}</span>
                </p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
            )}
          </div>
        )}
      </Tabs>
    </div>
  );
}
