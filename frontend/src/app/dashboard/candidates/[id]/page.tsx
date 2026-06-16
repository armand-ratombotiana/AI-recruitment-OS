'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Download,
  GraduationCap,
  Globe,
  Send,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Activity as ActivityIcon,
  LayoutGrid,
  RefreshCw,
  Paperclip,
  Search,
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
  Tabs,
  Modal,
  ConfirmDialog,
  RichTextEditor,
  Timeline,
  InputField,
  TextareaField,
  SelectField,
} from '@/components';
import type { Tab, TimelineItem } from '@/components';
import { useLocaleStore, translate, interpolate, formatDate, formatRelativeTime } from '@/stores/locale-store';
import { ScoreCard } from '@/components/candidates/score-card';
import {
  ApplicationCard,
  normalizeApplicationStage,
} from '@/components/pipeline/application-card';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'purple' | 'default' | 'danger' | 'orange' | 'teal' | 'indigo' | 'pink'> = {
  active: 'info',
  interviewing: 'purple',
  screening: 'warning',
  offer: 'success',
  hired: 'success',
  rejected: 'danger',
  new: 'default',
  ppe: 'warning',
  shortlisted: 'orange',
  sourced: 'teal',
  withdrawn: 'default',
};

const STATUS_OPTIONS: Array<{ value: string; key: string; fallback: string }> = [
  { value: 'new', key: 'jobKanban.stages.applied', fallback: 'New' },
  { value: 'active', key: 'candidateDetail.modals.addToJob.stages.active', fallback: 'Active' },
  { value: 'screening', key: 'jobKanban.stages.screening', fallback: 'Screening' },
  { value: 'interviewing', key: 'jobKanban.stages.interview', fallback: 'Interviewing' },
  { value: 'offer', key: 'jobKanban.stages.offer', fallback: 'Offer' },
  { value: 'hired', key: 'jobKanban.stages.hired', fallback: 'Hired' },
  { value: 'rejected', key: 'jobKanban.stages.rejected', fallback: 'Rejected' },
];

const PIPELINE_STAGES = [
  { value: 'active', fallback: 'Active' },
  { value: 'screening', fallback: 'Screening' },
  { value: 'interview', fallback: 'Interview' },
  { value: 'offer', fallback: 'Offer' },
  { value: 'hired', fallback: 'Hired' },
  { value: 'rejected', fallback: 'Rejected' },
];

const INTERVIEW_TYPES = [
  { value: 'phone', fallback: 'Phone screen' },
  { value: 'video', fallback: 'Video interview' },
  { value: 'onsite', fallback: 'On-site' },
  { value: 'technical', fallback: 'Technical' },
  { value: 'panel', fallback: 'Panel' },
];

const EMAIL_TEMPLATES = [
  {
    value: 'intro',
    key: 'candidateDetail.modals.email.templates.intro',
    fallback: 'Introduction',
    subject: 'Quick intro from {company}',
    body: 'Hi {name},\n\nThanks for your interest in the {jobTitle} role at {company}. I reviewed your background and would love to set up a quick chat to learn more about what you are looking for.\n\nLet me know a time that works for you.\n\nBest,\n{recruiter}',
  },
  {
    value: 'interview',
    key: 'candidateDetail.modals.email.templates.interview',
    fallback: 'Interview invite',
    subject: 'Interview invitation — {jobTitle}',
    body: 'Hi {name},\n\nWe would love to invite you to the next round for the {jobTitle} position at {company}. Please share a few times that work for you over the coming week and we will get a slot on the calendar.\n\nLooking forward to it,\n{recruiter}',
  },
  {
    value: 'rejection',
    key: 'candidateDetail.modals.email.templates.rejection',
    fallback: 'Polite rejection',
    subject: 'Update on your application — {jobTitle}',
    body: 'Hi {name},\n\nThank you for taking the time to interview for the {jobTitle} role. After careful consideration we decided to move forward with other candidates whose experience more closely matches our current needs.\n\nWe will keep your profile on file and reach out if a better-fit opportunity opens up.\n\nAll the best,\n{recruiter}',
  },
  {
    value: 'offer',
    key: 'candidateDetail.modals.email.templates.offer',
    fallback: 'Offer',
    subject: 'Offer for {jobTitle} at {company}',
    body: 'Hi {name},\n\nWe are thrilled to extend you an offer for the {jobTitle} role at {company}. I will send the full offer letter with details and benefits in a separate email. Please let me know if you have any questions or want to hop on a quick call to discuss.\n\nWelcome (almost) to the team,\n{recruiter}',
  },
];

const TAB_STORAGE_KEY = 'airos_candidate_detail_tab';

interface CandidateDetail {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  status: string;
  skills: string[];
  experience_years?: number | null;
  score?: number | null;
  headline?: string | null;
  linkedin?: string | null;
  portfolio?: string | null;
  notes?: string | null;
  match_scores?: Record<string, number> | null;
  created_at?: string;
  updated_at?: string;
  enrichment?: Record<string, unknown> | null;
  profile?: {
    summary?: string;
    experience?: Array<{
      company: string;
      title: string;
      start_date?: string;
      end_date?: string | null;
      description?: string;
    }>;
    education?: Array<Record<string, unknown>>;
    languages?: string[];
    contact?: {
      linkedin?: string | null;
      portfolio?: string | null;
    };
  } | null;
}

interface ResumeSummary {
  id: string;
  candidate_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  parsed: boolean;
  url?: string;
}

interface InterviewItem {
  id: string;
  candidate_id?: string;
  status: string;
  scheduled_at?: string;
  type?: string;
  title?: string;
  duration_minutes?: number;
}

interface NoteItem {
  id: string;
  title?: string;
  body: string;
  created_at: string;
  updated_at?: string;
  author_name?: string;
  author_email?: string;
  pinned?: boolean;
}

interface ApplicationItem {
  job_id: string;
  job_title: string;
  company?: string;
  status?: string;
  stage?: string;
  applied_at?: string;
  updated_at?: string;
  match_score?: number;
}

interface JobMatch {
  job_id: string;
  title: string;
  company?: string;
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  rationale?: string;
}

interface ActivityEntry {
  id: string;
  action: string;
  action_label?: string;
  description?: string;
  actor?: { id?: string; name?: string; email?: string };
  target?: { type?: string; id?: string; label?: string } | null;
  created_at: string;
}

type TabId = 'overview' | 'resume' | 'timeline' | 'notes' | 'applications' | 'score' | 'activity';

export default function CandidateDetailPage({ params }: { params: { id: string } }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [matchResults, setMatchResults] = useState<JobMatch[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [jobs, setJobs] = useState<Array<{ id: string; title: string; company?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [emailOpen, setEmailOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [addToJobOpen, setAddToJobOpen] = useState(false);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [showGroupByDay, setShowGroupByDay] = useState(true);
  const [starred, setStarred] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(TAB_STORAGE_KEY) as TabId | null;
    if (saved && ['overview', 'resume', 'timeline', 'notes', 'applications', 'score', 'activity'].includes(saved)) {
      setActiveTab(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

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
        const enrTags = (detail.enrichment as any)?.tags;
        if (Array.isArray(enrTags)) {
          setStarred(enrTags.includes('shortlisted'));
        }
      }
      try {
        const iv: any = await api.listInterviews({ candidate_id: params.id });
        const items = iv?.data?.items || iv?.items || iv?.data || iv || [];
        setInterviews(Array.isArray(items) ? items : []);
      } catch {
        setInterviews([]);
      }
      try {
        const res: any = await api.resumes.list({ candidate_id: params.id });
        const rList = res?.data?.items || res?.items || res?.data || res || [];
        setResumes(Array.isArray(rList) ? rList : []);
      } catch {
        setResumes([]);
      }
      try {
        const jl: any = await api.listJobs({ limit: '100' });
        const jItems = jl?.data?.items || jl?.items || jl?.data || jl || [];
        setJobs(
          Array.isArray(jItems)
            ? jItems.filter((j: any) => j?.id).map((j: any) => ({ id: String(j.id), title: j.title || '', company: j.company }))
            : []
        );
      } catch {
        setJobs([]);
      }
      try {
        const aRes: any = await api.listActivityFeed({ target_id: params.id, page_size: 50 });
        const aItems = aRes?.data || aRes?.items || [];
        setActivity(Array.isArray(aItems) ? aItems : []);
      } catch {
        setActivity([]);
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

  useEffect(() => {
    if (!candidate) {
      setMatchResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res: any = await api.candidates.match(candidate.id);
        const matches: JobMatch[] = (res?.matches || res?.data?.matches || res?.result?.matches || []) as JobMatch[];
        if (!cancelled) setMatchResults(Array.isArray(matches) ? matches : []);
      } catch {
        if (!cancelled) {
          if (candidate.match_scores && typeof candidate.match_scores === 'object') {
            const inferred: JobMatch[] = Object.entries(candidate.match_scores).map(([job, score]) => ({
              job_id: job,
              title: job,
              score: typeof score === 'number' ? (score <= 1 ? score * 100 : score) : 0,
              matched_skills: [],
              missing_skills: [],
            }));
            setMatchResults(inferred);
          } else {
            setMatchResults([]);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidate]);

  const applicationsDerived = useMemo<ApplicationItem[]>(() => {
    if (!candidate) return [];
    const fromMatches: ApplicationItem[] = matchResults.map((m) => ({
      job_id: m.job_id,
      job_title: m.title,
      company: m.company,
      status: 'matched',
      stage: 'screening',
      applied_at: candidate.created_at,
      match_score: m.score,
    }));
    const knownJobIds = new Set(fromMatches.map((a) => a.job_id));
    const fromPipeline = jobs
      .filter((j) => !knownJobIds.has(j.id))
      .slice(0, 10)
      .map<ApplicationItem>((j) => ({
        job_id: j.id,
        job_title: j.title,
        company: j.company,
        status: 'sourced',
        stage: 'active',
        applied_at: candidate.created_at,
      }));
    return [...fromMatches, ...fromPipeline];
  }, [candidate, matchResults, jobs]);

  useEffect(() => {
    setApplications(applicationsDerived);
  }, [applicationsDerived]);

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

  const experienceList = useMemo<Array<{
    company: string;
    title: string;
    start_date?: string;
    end_date?: string | null;
    description?: string;
  }>>(
    () => (candidate?.profile?.experience || []) as Array<{
      company: string;
      title: string;
      start_date?: string;
      end_date?: string | null;
      description?: string;
    }>,
    [candidate?.profile?.experience]
  );

  const educationList = useMemo<Array<{ degree?: string; school?: string; year?: string }>>(() => {
    const raw = (candidate?.profile?.education || []) as Array<Record<string, unknown>>;
    return raw.map((e) => ({
      degree: (e.degree || e.qualification || e.title || (typeof e.field === 'string' ? e.field : '')) as string | undefined,
      school: (e.school || e.institution || e.university || '') as string | undefined,
      year: (e.year || e.end_year || e.graduation_year || (e.end_date as string) || '') as string | undefined,
    }));
  }, [candidate?.profile?.education]);

  const languages = useMemo(() => candidate?.profile?.languages || [], [candidate?.profile?.languages]);

  const primaryNote = useMemo(() => candidate?.notes || '', [candidate?.notes]);

  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];
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
    resumes.forEach((r) => {
      items.push({
        id: `resume-${r.id}`,
        title: t('candidateDetail.resume.title', 'Resume'),
        description: r.file_name,
        timestamp: r.uploaded_at,
        icon: <FileText className="h-3.5 w-3.5" />,
        color: 'amber',
      });
    });
    notes.forEach((n) => {
      items.push({
        id: `note-${n.id}`,
        title: t('candidateDetail.notes.title', 'Notes'),
        description: n.title || n.body.slice(0, 120),
        timestamp: n.created_at,
        icon: <MessageSquare className="h-3.5 w-3.5" />,
        color: n.pinned ? 'pink' : 'gray',
        actor: n.author_name,
      });
    });
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
  }, [interviews, resumes, notes, candidate, t]);

  const handleStatusChange = async (newStatus: string) => {
    if (!candidate || candidate.status === newStatus) return;
    setStatusUpdating(true);
    try {
      const updated: any = await api.updateCandidate(candidate.id, { status: newStatus } as any);
      const detail: CandidateDetail = updated?.data || updated;
      setCandidate(detail);
      push('success', interpolate(t('candidateDetail.statusChanged', 'Status changed to {status}'), { status: newStatus }));
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('candidateDetail.statusChangeFailed', 'Failed to change status'));
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleToggleStar = async () => {
    if (!candidate) return;
    const next = !starred;
    setStarred(next);
    try {
      const tags = Array.isArray((candidate.enrichment as any)?.tags) ? (candidate.enrichment as any).tags as string[] : [];
      const nextTags = next
        ? Array.from(new Set([...tags, 'shortlisted']))
        : tags.filter((tg) => tg !== 'shortlisted');
      const updated: any = await api.updateCandidate(candidate.id, { profile: { ...(candidate.profile as any), tags: nextTags } } as any);
      const detail: CandidateDetail = updated?.data || updated;
      setCandidate(detail);
      push('success', next ? t('candidateDetail.shortlistAdded', 'Added to shortlist') : t('candidateDetail.shortlistRemoved', 'Removed from shortlist'));
    } catch (err) {
      setStarred(!next);
      const e = err as APIError;
      push('error', e?.message || t('candidateDetail.pipelineFailed', 'Failed to update shortlist'));
    }
  };

  const handleScheduleInterview = () => {
    setInterviewOpen(true);
  };

  const handleSendMessage = () => {
    setEmailOpen(true);
  };

  const handleAddToJob = () => {
    setAddToJobOpen(true);
  };

  const handleAddToPipeline = async () => {
    if (!candidate) return;
    setActionLoading('pipeline');
    try {
      await api.updateCandidate(candidate.id, { status: 'active' } as any);
      push('success', t('candidateDetail.addedToPipeline', 'Added to pipeline'));
      await load();
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('candidateDetail.pipelineFailed', 'Failed to add to pipeline'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddNote = (body: string, title?: string, id?: string) => {
    const now = new Date().toISOString();
    if (id) {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, body, title, updated_at: now } : n)));
    } else {
      const newNote: NoteItem = {
        id: `local-${Date.now()}`,
        body,
        title,
        created_at: now,
        updated_at: now,
        author_name: t('candidateDetail.activity.system', 'You'),
        pinned: false,
      };
      setNotes((prev) => [newNote, ...prev]);
    }
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    push('success', t('candidateDetail.notes.deleted', 'Note deleted'));
  };

  const handleTogglePin = (id: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)));
  };

  const handlePrimaryNoteSave = async (text: string) => {
    if (!candidate) return;
    try {
      const updated: any = await api.updateCandidate(candidate.id, { notes: text } as any);
      const detail: CandidateDetail = updated?.data || updated;
      setCandidate(detail);
      push('success', t('candidateDetail.notes.saved', 'Note saved'));
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('candidateDetail.notes.saveFailed', 'Failed to save note'));
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
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
        <Skeleton height={48} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton height={180} />
            <Skeleton height={140} />
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

  const createdDate = candidate.created_at ? formatDate(candidate.created_at, locale) : null;
  const lastUpdated = candidate.updated_at ? formatRelativeTime(candidate.updated_at, locale) : null;
  const fullName = candidate.full_name;
  const experienceYears = candidate.experience_years;

  const stats: Array<{ label: string; value: string; icon: React.ReactNode; tone: string }> = [
    {
      label: t('candidateDetail.stats.experience', 'Experience'),
      value: experienceYears != null ? `${experienceYears} ${t('candidateDetail.years', 'years')}` : '—',
      icon: <Briefcase className="h-3.5 w-3.5" />,
      tone: 'text-blue-600 dark:text-blue-300',
    },
    {
      label: t('candidateDetail.stats.skills', 'Skills'),
      value: `${candidate.skills?.length || 0}`,
      icon: <Award className="h-3.5 w-3.5" />,
      tone: 'text-purple-600 dark:text-purple-300',
    },
    {
      label: t('candidateDetail.stats.applications', 'Applications'),
      value: `${applications.length}`,
      icon: <FileText className="h-3.5 w-3.5" />,
      tone: 'text-amber-600 dark:text-amber-300',
    },
    {
      label: t('candidateDetail.stats.interviews', 'Interviews'),
      value: `${interviews.length}`,
      icon: <Calendar className="h-3.5 w-3.5" />,
      tone: 'text-emerald-600 dark:text-emerald-300',
    },
    {
      label: t('candidateDetail.stats.match', 'Best match'),
      value: matchScore != null ? `${matchScore}%` : '—',
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      tone: 'text-pink-600 dark:text-pink-300',
    },
  ];

  const tabs: Tab[] = [
    { id: 'overview', label: t('candidateDetail.tabs.overview', 'Overview'), icon: <LayoutGrid className="h-4 w-4" /> },
    {
      id: 'resume',
      label: t('candidateDetail.tabs.resume', 'Resume'),
      icon: <FileText className="h-4 w-4" />,
      badge: resumes.length > 0 ? <span className="text-[10px] font-bold">{resumes.length}</span> : undefined,
    },
    {
      id: 'timeline',
      label: t('candidateDetail.tabs.timeline', 'Timeline'),
      icon: <Clock className="h-4 w-4" />,
      badge: timelineItems.length > 0 ? <span className="text-[10px] font-bold">{timelineItems.length}</span> : undefined,
    },
    {
      id: 'notes',
      label: t('candidateDetail.tabs.notes', 'Notes'),
      icon: <MessageSquare className="h-4 w-4" />,
      badge: notes.length > 0 ? <span className="text-[10px] font-bold">{notes.length}</span> : undefined,
    },
    {
      id: 'applications',
      label: t('candidateDetail.tabs.applications', 'Applications'),
      icon: <Briefcase className="h-4 w-4" />,
      badge: applications.length > 0 ? <span className="text-[10px] font-bold">{applications.length}</span> : undefined,
    },
    {
      id: 'score',
      label: t('candidateDetail.tabs.score', 'Score'),
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      id: 'activity',
      label: t('candidateDetail.tabs.activity', 'Activity'),
      icon: <ActivityIcon className="h-4 w-4" />,
      badge: activity.length > 0 ? <span className="text-[10px] font-bold">{activity.length}</span> : undefined,
    },
  ];

  return (
    <div className="space-y-6">
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
          <div className="flex flex-col lg:flex-row gap-5 items-start lg:items-center">
            <div
              className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold shrink-0 ring-4 ring-blue-100 dark:ring-blue-500/20"
              aria-hidden="true"
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
                  {fullName}
                </h1>
                {starred && (
                  <Badge variant="orange" size="sm" dot>
                    <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                    {t('candidateDetail.starred', 'Shortlisted')}
                  </Badge>
                )}
              </div>
              {candidate.headline && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{candidate.headline}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={candidate.status}
                  onChange={handleStatusChange}
                  disabled={statusUpdating}
                />
                {matchScore !== null && (
                  <Badge variant="info">
                    <Star className="h-3 w-3 fill-current mr-0.5" aria-hidden="true" />
                    {t('candidateDetail.matchScore', 'Match')} {matchScore}%
                  </Badge>
                )}
                {experienceYears != null && (
                  <Badge variant="outline">
                    <Briefcase className="h-3 w-3 mr-0.5" aria-hidden="true" />
                    {experienceYears} {t('candidateDetail.years', 'years')}
                  </Badge>
                )}
                {languages.length > 0 &&
                  languages.slice(0, 3).map((lg) => (
                    <Badge key={lg} variant="teal" size="sm">
                      <Globe className="h-3 w-3 mr-0.5" aria-hidden="true" />
                      {lg}
                    </Badge>
                  ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <a
                  href={`mailto:${candidate.email}`}
                  className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition"
                  aria-label={`Email ${fullName}`}
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  {candidate.email}
                </a>
                {candidate.phone && (
                  <a
                    href={`tel:${candidate.phone}`}
                    className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition"
                    aria-label={`Call ${fullName}`}
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
            <div className="flex flex-wrap gap-2 w-full lg:w-auto lg:flex-col lg:items-stretch">
              <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-col">
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Calendar className="h-4 w-4" />}
                  onClick={handleScheduleInterview}
                  aria-label={t('candidateDetail.scheduleInterview', 'Schedule interview')}
                >
                  {t('candidateDetail.scheduleInterview', 'Schedule interview')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Send className="h-4 w-4" />}
                  onClick={handleSendMessage}
                  aria-label={t('candidateDetail.sendEmail', 'Send email')}
                >
                  {t('candidateDetail.sendEmail', 'Send email')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={handleAddToJob}
                  aria-label={t('candidateDetail.addToJob', 'Add to job')}
                >
                  {t('candidateDetail.addToJob', 'Add to job')}
                </Button>
                <Button
                  variant={starred ? 'success' : 'outline'}
                  size="sm"
                  leftIcon={<Star className={`h-4 w-4 ${starred ? 'fill-current' : ''}`} />}
                  onClick={handleToggleStar}
                  aria-label={starred ? t('candidateDetail.unstarShortlist', 'Remove from shortlist') : t('candidateDetail.starShortlist', 'Shortlist')}
                >
                  {starred ? t('candidateDetail.starred', 'Shortlisted') : t('candidateDetail.starShortlist', 'Shortlist')}
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-gray-200 dark:border-surface-700 p-3 bg-white dark:bg-surface-900"
              >
                <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${s.tone}`}>
                  {s.icon}
                  {s.label}
                </div>
                <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{s.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div role="region" aria-label={t('candidateDetail.tabs.aria', 'Candidate sections')}>
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as TabId)}
          variant="underline"
        />
      </div>

      {activeTab === 'overview' && (
        <OverviewTab
          candidate={candidate}
          fullName={fullName}
          experienceList={experienceList}
          educationList={educationList}
          skills={candidate.skills || []}
          matchScore={matchScore}
          matchResults={matchResults}
          notes={notes}
          primaryNote={primaryNote}
          onPrimaryNoteSave={handlePrimaryNoteSave}
          onAddNote={() => setEditingNote({ id: '', body: '', created_at: new Date().toISOString() })}
          t={t}
        />
      )}

      {activeTab === 'resume' && (
        <ResumeTab
          candidateId={candidate.id}
          resumes={resumes}
          onRefresh={load}
          t={t}
        />
      )}

      {activeTab === 'timeline' && (
        <TimelineTab
          items={timelineItems}
          groupByDay={showGroupByDay}
          onToggleGroup={() => setShowGroupByDay((g) => !g)}
          t={t}
        />
      )}

      {activeTab === 'notes' && (
        <NotesTab
          notes={notes}
          onAddNote={() => setEditingNote({ id: '', body: '', created_at: new Date().toISOString() })}
          onEditNote={(n) => setEditingNote(n)}
          onDeleteNote={(id) => setDeleteNoteId(id)}
          onTogglePin={handleTogglePin}
          t={t}
        />
      )}

      {activeTab === 'applications' && (
        <ApplicationsTab
          applications={applications}
          candidateId={candidate.id}
          t={t}
        />
      )}

      {activeTab === 'score' && (
        <div className="space-y-6">
          <ScoreCard
            candidateId={candidate.id}
            defaultJobId={
              candidate.match_scores && typeof candidate.match_scores === 'object'
                ? Object.keys(candidate.match_scores)[0] || undefined
                : undefined
            }
          />
          <ScoreBreakdownTab matches={matchResults} t={t} />
        </div>
      )}

      {activeTab === 'activity' && (
        <ActivityTab activity={activity} t={t} />
      )}

      {(createdDate || lastUpdated) && (
        <Card>
          <CardContent className="p-4 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-6 gap-y-1">
            {createdDate && (
              <p>
                {t('candidateDetail.addedOn', 'Added on')}{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">{createdDate}</span>
              </p>
            )}
            {lastUpdated && (
              <p>
                {t('candidateDetail.lastUpdated', 'Last updated')}{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">{lastUpdated}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <EmailComposerModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        candidate={candidate}
        onSent={() => {
          setEmailOpen(false);
          push('success', t('candidateDetail.emailSent', 'Email queued'));
        }}
        onError={(msg) => push('error', msg)}
        t={t}
      />

      <ScheduleInterviewModal
        open={interviewOpen}
        onClose={() => setInterviewOpen(false)}
        candidate={candidate}
        onScheduled={() => {
          setInterviewOpen(false);
          load();
        }}
        onError={(msg) => push('error', msg)}
        onInfo={(msg) => push('info', msg)}
        t={t}
      />

      <AddToJobModal
        open={addToJobOpen}
        onClose={() => setAddToJobOpen(false)}
        candidate={candidate}
        jobs={jobs}
        onAdded={() => {
          setAddToJobOpen(false);
          load();
        }}
        onError={(msg) => push('error', msg)}
        t={t}
      />

      {editingNote && (
        <NoteEditorModal
          note={editingNote.id ? editingNote : null}
          onClose={() => setEditingNote(null)}
          onSave={(body, title) => {
            handleAddNote(body, title, editingNote.id || undefined);
            setEditingNote(null);
          }}
          t={t}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteNoteId}
        onClose={() => setDeleteNoteId(null)}
        onConfirm={() => {
          if (deleteNoteId) handleDeleteNote(deleteNoteId);
          setDeleteNoteId(null);
        }}
        title={t('candidateDetail.notes.delete', 'Delete note')}
        description={t('candidateDetail.notes.deleteConfirm', 'Delete this note? This action cannot be undone.')}
        confirmLabel={t('candidateDetail.notes.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
      />
    </div>
  );
}

function StatusBadge({
  status,
  onChange,
  disabled,
}: {
  status: string;
  onChange: (s: string) => void;
  disabled?: boolean;
}) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-full"
      >
        <Badge variant={STATUS_VARIANT[status] || 'default'} dot>
          {status}
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
        </Badge>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 min-w-[160px] rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg p-1"
        >
          {STATUS_OPTIONS.map((s) => (
            <li key={s.value}>
              <button
                type="button"
                role="option"
                aria-selected={s.value === status}
                onClick={() => {
                  onChange(s.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                  s.value === status
                    ? 'bg-blue-50 text-blue-700 dark:bg-brand-500/20 dark:text-brand-200'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-800'
                }`}
              >
                <span>{translate(locale, s.key, s.fallback)}</span>
                {s.value === status && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only">{t('candidateDetail.tabs.overview', 'Overview')}</span>
    </div>
  );
}

function OverviewTab({
  candidate,
  fullName,
  experienceList,
  educationList,
  skills,
  matchScore,
  matchResults,
  notes,
  primaryNote,
  onPrimaryNoteSave,
  onAddNote,
  t,
}: {
  candidate: CandidateDetail;
  fullName: string;
  experienceList: Array<{
    company: string;
    title: string;
    start_date?: string;
    end_date?: string | null;
    description?: string;
  }>;
  educationList: Array<{ degree?: string; school?: string; year?: string }>;
  skills: string[];
  matchScore: number | null;
  matchResults: JobMatch[];
  notes: NoteItem[];
  primaryNote: string;
  onPrimaryNoteSave: (text: string) => Promise<void>;
  onAddNote: () => void;
  t: (key: string, fb?: string) => string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <section aria-labelledby="overview-summary-title">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <User className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                <h2 id="overview-summary-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {t('candidateDetail.summary', 'Summary')}
                </h2>
              </div>
              {candidate.profile?.summary ? (
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {candidate.profile.summary}
                </p>
              ) : candidate.headline ? (
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {candidate.headline}
                </p>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                  {t('candidateDetail.notes.empty', 'No notes yet.')}
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <PrimaryNoteCard
          value={primaryNote}
          onSave={onPrimaryNoteSave}
          onAddNote={onAddNote}
          t={t}
        />

        <section aria-labelledby="overview-experience-title">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                <h2 id="overview-experience-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {t('candidateDetail.experience.title', 'Experience')}
                </h2>
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                  {experienceList.length}
                </span>
              </div>
              {experienceList.length > 0 ? (
                <ol className="space-y-3">
                  {experienceList.map((exp: any, idx: number) => (
                    <li
                      key={`${exp.company}-${idx}`}
                      className="flex gap-3 p-3 rounded-lg border border-gray-200 dark:border-surface-700 hover:bg-gray-50 dark:hover:bg-surface-800 transition"
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
                            {exp.start_date || '—'} → {exp.end_date || t('candidateDetail.experience.present', 'Present')}
                          </p>
                        )}
                        {exp.description && (
                          <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400 line-clamp-3">{exp.description}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                  {t('candidateDetail.experience.empty', 'No experience listed yet.')}
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        {educationList.length > 0 && (
          <section aria-labelledby="overview-education-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <GraduationCap className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                  <h2 id="overview-education-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {t('candidateDetail.education.title', 'Education')}
                  </h2>
                </div>
                <ul className="space-y-3">
                  {educationList.map((ed, idx) => (
                    <li
                      key={idx}
                      className="p-3 rounded-lg border border-gray-200 dark:border-surface-700"
                    >
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{ed.degree || '—'}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{ed.school || '—'}</p>
                      {ed.year && (
                        <p className="text-[10px] mt-1 text-gray-500 dark:text-gray-500">{ed.year}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        )}

        <section aria-labelledby="overview-skills-title">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Award className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                <h2 id="overview-skills-title" className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {t('candidateDetail.skills.title', 'Skills')}
                </h2>
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                  {skills.length} {t('candidateDetail.skills.total', 'total')}
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
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('candidateDetail.skills.empty', 'No skills listed yet.')}</p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <aside className="space-y-6">
        <ContactCard candidate={candidate} fullName={fullName} t={t} />

        {matchScore !== null && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {t('candidateDetail.matchScore', 'Match')}
                </h2>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-gray-900 dark:text-white">{matchScore}</span>
                <span className="text-lg text-gray-500 dark:text-gray-400">/ 100</span>
              </div>
              <div
                className="mt-3 w-full bg-gray-200 dark:bg-surface-800 rounded-full h-2 overflow-hidden"
                aria-hidden="true"
              >
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, matchScore))}%` }}
                />
              </div>
              {matchResults.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {matchResults.slice(0, 5).map((m) => (
                    <li key={m.job_id} className="flex items-center justify-between text-xs gap-2">
                      <span className="text-gray-600 dark:text-gray-400 truncate">{m.title}</span>
                      <span className="font-semibold text-gray-900 dark:text-white shrink-0">
                        {Math.round(m.score)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {notes.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {t('candidateDetail.notes.title', 'Notes')}
                </h2>
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{notes.length}</span>
              </div>
              <ul className="space-y-2.5">
                {notes.slice(0, 3).map((n) => (
                  <li key={n.id} className="text-xs">
                    {n.title && <p className="font-semibold text-gray-900 dark:text-white">{n.title}</p>}
                    <p className="text-gray-600 dark:text-gray-400 line-clamp-2">{n.body}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </aside>
    </div>
  );
}

function ContactCard({ candidate, fullName, t }: { candidate: CandidateDetail; fullName: string; t: (k: string, fb?: string) => string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('candidateDetail.contact.title', 'Contact information')}
          </h2>
        </div>
        <dl className="space-y-3">
          <div className="p-3 bg-gray-50 dark:bg-surface-800 rounded-lg">
            <dt className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
              <Mail className="h-3 w-3" aria-hidden="true" />
              {t('candidateDetail.contact.email', 'Email')}
            </dt>
            <dd className="text-sm font-medium text-gray-900 dark:text-white break-all">
              <a
                href={`mailto:${candidate.email}`}
                className="hover:text-blue-600 dark:hover:text-blue-400 transition"
              >
                {candidate.email}
              </a>
            </dd>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-surface-800 rounded-lg">
            <dt className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
              <Phone className="h-3 w-3" aria-hidden="true" />
              {t('candidateDetail.contact.phone', 'Phone')}
            </dt>
            <dd className="text-sm font-medium text-gray-900 dark:text-white">
              {candidate.phone ? (
                <a
                  href={`tel:${candidate.phone}`}
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition"
                >
                  {candidate.phone}
                </a>
              ) : (
                <span className="text-gray-400 dark:text-gray-500">—</span>
              )}
            </dd>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-surface-800 rounded-lg">
            <dt className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {t('candidateDetail.contact.location', 'Location')}
            </dt>
            <dd className="text-sm font-medium text-gray-900 dark:text-white">
              {candidate.location || <span className="text-gray-400 dark:text-gray-500">—</span>}
            </dd>
          </div>
        </dl>
        {(candidate.linkedin || candidate.portfolio) && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-surface-700 flex flex-wrap gap-3 text-sm">
            {candidate.linkedin && (
              <a
                href={candidate.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
              >
                LinkedIn <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
            {candidate.portfolio && (
              <a
                href={candidate.portfolio}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
              >
                Portfolio <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PrimaryNoteCard({
  value,
  onSave,
  onAddNote,
  t,
}: {
  value: string;
  onSave: (text: string) => Promise<void>;
  onAddNote: () => void;
  t: (k: string, fb?: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('candidateDetail.notes.primary', 'Primary note')}
          </h2>
          <div className="ml-auto flex gap-2">
            {!editing && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => setEditing(true)}
                aria-label={t('candidateDetail.notes.primaryEdit', 'Edit primary note')}
              >
                {t('candidateDetail.notes.edit', 'Edit')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={onAddNote}
              aria-label={t('candidateDetail.notes.add', 'Add note')}
            >
              {t('candidateDetail.notes.add', 'Add note')}
            </Button>
          </div>
        </div>
        {editing ? (
          <div className="space-y-3">
            <RichTextEditor
              value={draft}
              onChange={setDraft}
              placeholder={t('candidateDetail.notes.primaryPlaceholder', 'Headline note…')}
              ariaLabel={t('candidateDetail.notes.primary', 'Primary note')}
              minHeight={120}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                {t('candidateDetail.notes.cancel', 'Cancel')}
              </Button>
              <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
                {t('candidateDetail.notes.save', 'Save')}
              </Button>
            </div>
          </div>
        ) : value ? (
          <div
            className="prose prose-sm max-w-none text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: value }}
          />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">{t('candidateDetail.notes.empty', 'No notes yet.')}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ResumeTab({
  candidateId,
  resumes,
  onRefresh,
  t,
}: {
  candidateId: string;
  resumes: ResumeSummary[];
  onRefresh: () => void;
  t: (k: string, fb?: string) => string;
}) {
  const [reparsing, setReparsing] = useState<string | null>(null);
  const { push } = useToast();

  const handleReparse = async (resumeId: string) => {
    setReparsing(resumeId);
    try {
      await api.resumes.reparse(resumeId);
      push('success', t('candidateDetail.resume.reparseStarted', 'Re-parsing started'));
      onRefresh();
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('candidateDetail.resume.reparseFailed', 'Re-parse failed'));
    } finally {
      setReparsing(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  if (resumes.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<FileText className="h-12 w-12" />}
            title={t('candidateDetail.resume.noResume', 'No resume on file')}
            description={t('candidateDetail.resume.noResumeDesc', 'Upload a resume to see parsed experience, education, and skills here.')}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-surface-700">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('candidateDetail.resume.files', 'Files')}
            </h2>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {resumes.map((r) => (
              <li key={r.id} className="p-4 sm:p-6 flex flex-wrap gap-4 items-center">
                <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-brand-500/20 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-brand-300" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.file_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('candidateDetail.resume.size', 'Size')}: {formatBytes(r.size_bytes)} ·{' '}
                    {t('candidateDetail.resume.uploadedAt', 'Uploaded')}: {formatRelativeTime(r.uploaded_at, useLocaleStore.getState().locale)}
                  </p>
                </div>
                <Badge variant={r.parsed ? 'success' : 'warning'} size="sm">
                  {r.parsed ? t('candidateDetail.resume.parsed', 'Parsed') : t('candidateDetail.resume.notParsed', 'Not parsed yet')}
                </Badge>
                <div className="flex gap-2 ml-auto">
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={() => handleReparse(r.id)}
                    loading={reparsing === r.id}
                  >
                    {t('candidateDetail.resume.reparse', 'Re-parse')}
                  </Button>
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" leftIcon={<Download className="h-3.5 w-3.5" />}>
                        {t('candidateDetail.resume.download', 'Download')}
                      </Button>
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineTab({
  items,
  groupByDay,
  onToggleGroup,
  t,
}: {
  items: TimelineItem[];
  groupByDay: boolean;
  onToggleGroup: () => void;
  t: (k: string, fb?: string) => string;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<Clock className="h-12 w-12" />}
            title={t('candidateDetail.timeline.empty', 'No timeline events yet.')}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('candidateDetail.tabs.timeline', 'Timeline')}
          </h2>
          <label className="ml-auto inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={groupByDay}
              onChange={onToggleGroup}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800"
            />
            {t('candidateDetail.timeline.groupByDay', 'Group by day')}
          </label>
        </div>
        <Timeline
          items={items}
          groupByDay={groupByDay}
          ariaLabel={t('candidateDetail.activityTimeline', 'Candidate activity timeline')}
        />
      </CardContent>
    </Card>
  );
}

function NotesTab({
  notes,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onTogglePin,
  t,
}: {
  notes: NoteItem[];
  onAddNote: () => void;
  onEditNote: (n: NoteItem) => void;
  onDeleteNote: (id: string) => void;
  onTogglePin: (id: string) => void;
  t: (k: string, fb?: string) => string;
}) {
  const locale = useLocaleStore((s) => s.locale);
  const sorted = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [notes]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t('candidateDetail.notes.title', 'Notes')}
          <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">{notes.length}</span>
        </h2>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={onAddNote}
          aria-label={t('candidateDetail.notes.add', 'Add note')}
        >
          {t('candidateDetail.notes.add', 'Add note')}
        </Button>
      </div>
      {sorted.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<MessageSquare className="h-12 w-12" />}
              title={t('candidateDetail.notes.empty', 'No notes yet.')}
              description={t('candidateDetail.notes.empty', 'Add the first one to remember context for next time.')}
              action={
                <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={onAddNote}>
                  {t('candidateDetail.notes.add', 'Add note')}
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {sorted.map((n) => (
            <li key={n.id}>
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {(n.author_name || '?').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        {n.title && (
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{n.title}</p>
                        )}
                        {n.pinned && (
                          <Badge variant="pink" size="sm">
                            <Pin className="h-3 w-3" aria-hidden="true" />
                            {t('candidateDetail.notes.pinned', 'Pinned')}
                          </Badge>
                        )}
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
                          {formatRelativeTime(n.created_at, locale)}
                        </span>
                      </div>
                      {n.author_name && (
                        <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-0.5">
                          {t('candidateDetail.notes.by', 'by')} {n.author_name}
                        </p>
                      )}
                      <div
                        className="mt-2 text-sm text-gray-700 dark:text-gray-300 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: n.body }}
                      />
                      <div className="mt-3 flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                          onClick={() => onTogglePin(n.id)}
                          aria-label={n.pinned ? t('candidateDetail.notes.unpin', 'Unpin') : t('candidateDetail.notes.pin', 'Pin')}
                        >
                          {n.pinned ? t('candidateDetail.notes.unpin', 'Unpin') : t('candidateDetail.notes.pin', 'Pin')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<Pencil className="h-3.5 w-3.5" />}
                          onClick={() => onEditNote(n)}
                          aria-label={t('candidateDetail.notes.edit', 'Edit')}
                        >
                          {t('candidateDetail.notes.edit', 'Edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={() => onDeleteNote(n.id)}
                          aria-label={t('candidateDetail.notes.delete', 'Delete')}
                        >
                          {t('candidateDetail.notes.delete', 'Delete')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ApplicationsTab({
  applications,
  candidateId,
  t,
}: {
  applications: ApplicationItem[];
  candidateId: string;
  t: (k: string, fb?: string) => string;
}) {
  if (applications.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<Briefcase className="h-12 w-12" />}
            title={t('candidateDetail.applications.empty', 'This candidate hasn\'t applied to any jobs yet.')}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {applications.map((a) => {
        const stage = normalizeApplicationStage(a.stage || a.status);
        const score = typeof a.match_score === 'number' ? a.match_score : null;
        const ref = a.updated_at || a.applied_at;
        const refDate = ref ? new Date(ref) : null;
        const daysInStage =
          refDate && !isNaN(refDate.getTime())
            ? Math.max(0, Math.floor((Date.now() - refDate.getTime()) / 86_400_000))
            : 0;
        const application = {
          id: `${a.job_id}-${a.applied_at || a.job_id}`,
          candidate_id: candidateId,
          candidate_name: a.job_title || t('candidateDetail.applications.viewJob', 'View job'),
          job_id: a.job_id,
          job_title: a.job_title,
          job_company: a.company ?? null,
          stage,
          status_raw: a.status,
          score,
          days_in_stage: daysInStage,
          applied_at: a.applied_at || null,
          last_activity_at: a.updated_at || a.applied_at || null,
        };
        return (
          <div key={`${a.job_id}-${a.applied_at || ''}`}>
            <ApplicationCard
              application={application as any}
              variant="list"
              showJob
              onClick={(app) => {
                if (typeof window !== 'undefined') {
                  window.location.href = `/dashboard/jobs/${app.job_id}?tab=applicants`;
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function ScoreBreakdownTab({ matches, t }: { matches: JobMatch[]; t: (k: string, fb?: string) => string }) {
  if (matches.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={<Sparkles className="h-12 w-12" />}
            title={t('candidateDetail.scoreTab.empty', 'No match scores yet.')}
            description={t('candidateDetail.scoreTab.subtitle', 'How this candidate matches against every open job.')}
          />
        </CardContent>
      </Card>
    );
  }
  const sorted = [...matches].sort((a, b) => b.score - a.score);
  return (
    <div className="space-y-3">
      {sorted.map((m) => (
        <Card key={m.job_id}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
                {Math.round(m.score)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{m.title}</p>
                  {m.company && <p className="text-xs text-gray-500 dark:text-gray-400">{m.company}</p>}
                </div>
                <div className="mt-2 w-full bg-gray-200 dark:bg-surface-800 rounded-full h-1.5 overflow-hidden" aria-hidden="true">
                  <div
                    className={`h-full rounded-full transition-all ${
                      m.score >= 75
                        ? 'bg-emerald-500'
                        : m.score >= 50
                          ? 'bg-blue-500'
                          : m.score >= 25
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, m.score))}%` }}
                  />
                </div>
                {m.rationale && (
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{m.rationale}</p>
                )}
                {(m.matched_skills.length > 0 || m.missing_skills.length > 0) && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {m.matched_skills.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-success-300 mb-1">
                          {t('candidateDetail.scoreTab.matchedSkills', 'Matched skills')}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {m.matched_skills.slice(0, 8).map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-success-500/20 dark:text-success-300 px-2 py-0.5 text-[10px] font-medium"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {m.missing_skills.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-amber-700 dark:text-warning-300 mb-1">
                          {t('candidateDetail.scoreTab.missingSkills', 'Missing skills')}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {m.missing_skills.slice(0, 8).map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-amber-100 text-amber-700 dark:bg-warning-500/20 dark:text-warning-300 px-2 py-0.5 text-[10px] font-medium"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Link
                href={`/dashboard/jobs/${m.job_id}`}
                className="text-blue-600 dark:text-brand-400 hover:underline text-xs inline-flex items-center gap-1"
              >
                {t('candidateDetail.applications.viewJob', 'View job')}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ActivityTab({ activity, t }: { activity: ActivityEntry[]; t: (k: string, fb?: string) => string }) {
  const locale = useLocaleStore((s) => s.locale);
  if (activity.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<ActivityIcon className="h-12 w-12" />}
            title={t('candidateDetail.activity.empty', 'No activity recorded yet.')}
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <ActivityIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('candidateDetail.activity.title', 'Activity log')}
          </h2>
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">{activity.length}</span>
        </div>
        <ol className="space-y-3">
          {activity.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-surface-700"
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-500 to-gray-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {(a.actor?.name || a.actor?.email || 'S').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {a.action_label || a.action}
                  </p>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
                    {formatRelativeTime(a.created_at, locale)}
                  </span>
                </div>
                {a.description && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{a.description}</p>
                )}
                {a.actor && (
                  <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">
                    {a.actor.name || a.actor.email || t('candidateDetail.activity.system', 'System')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function NoteEditorModal({
  note,
  onClose,
  onSave,
  t,
}: {
  note: NoteItem | null;
  onClose: () => void;
  onSave: (body: string, title?: string) => void;
  t: (k: string, fb?: string) => string;
}) {
  const [title, setTitle] = useState(note?.title || '');
  const [body, setBody] = useState(note?.body || '');

  useEffect(() => {
    setTitle(note?.title || '');
    setBody(note?.body || '');
  }, [note]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={note?.id ? t('candidateDetail.notes.edit', 'Edit note') : t('candidateDetail.notes.add', 'Add note')}
      size="lg"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('candidateDetail.notes.cancel', 'Cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => onSave(body, title || undefined)}
            disabled={!body.trim()}
            leftIcon={<CheckCircle2 className="h-4 w-4" />}
          >
            {t('candidateDetail.notes.save', 'Save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <InputField
          label={t('candidateDetail.notes.titlePlaceholder', 'Note title (optional)')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('candidateDetail.notes.titlePlaceholder', 'Note title (optional)')}
        />
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            {t('candidateDetail.notes.placeholder', 'Write a note for the team…')}
          </label>
          <RichTextEditor
            value={body}
            onChange={setBody}
            placeholder={t('candidateDetail.notes.placeholder', 'Write a note for the team…')}
            ariaLabel={t('candidateDetail.notes.placeholder', 'Write a note for the team…')}
            minHeight={180}
          />
        </div>
      </div>
    </Modal>
  );
}

function EmailComposerModal({
  open,
  onClose,
  candidate,
  onSent,
  onError,
  t,
}: {
  open: boolean;
  onClose: () => void;
  candidate: CandidateDetail;
  onSent: () => void;
  onError: (msg: string) => void;
  t: (k: string, fb?: string) => string;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [template, setTemplate] = useState<string>('intro');
  const [includeResume, setIncludeResume] = useState(false);
  const [sending, setSending] = useState(false);
  const name = candidate.full_name.split(' ')[0] || candidate.full_name;

  useEffect(() => {
    if (!open) return;
    const tpl = EMAIL_TEMPLATES.find((x) => x.value === template) || EMAIL_TEMPLATES[0];
    const vars: Record<string, string> = {
      name,
      jobTitle: 'the role',
      company: 'your company',
      recruiter: 'the team',
    };
    setSubject(interpolate(tpl.subject, vars));
    setBody(
      interpolate(tpl.body, vars)
        .split('\n')
        .map((l) => `<p>${l}</p>`)
        .join('')
    );
  }, [template, open, name]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      onError(t('candidateDetail.emailFailed', 'Failed to send email'));
      return;
    }
    setSending(true);
    try {
      const html = includeResume
        ? `${body}<p><a href="${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard/candidates/${candidate.id}">${t('candidateDetail.resume.title', 'Resume')}</a></p>`
        : body;
      await api.mailing.send({
        to: candidate.email,
        subject,
        body: html,
        template: template,
      });
      onSent();
    } catch (err) {
      const e = err as APIError;
      onError(e?.message || t('candidateDetail.emailFailed', 'Failed to send email'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={interpolate(t('candidateDetail.modals.email.title', 'Send email to {name}'), { name })}
      size="lg"
      footer={
        <div className="flex w-full justify-between items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={includeResume}
              onChange={(e) => setIncludeResume(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            {t('candidateDetail.modals.email.includeResume', 'Attach resume link')}
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={sending}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleSend}
              loading={sending}
              leftIcon={<Send className="h-4 w-4" />}
            >
              {sending
                ? t('candidateDetail.modals.email.sending', 'Sending…')
                : t('candidateDetail.modals.email.send', 'Send email')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <SelectField
          label={t('candidateDetail.modals.email.template', 'Template')}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          options={EMAIL_TEMPLATES.map((tp) => ({
            value: tp.value,
            label: translate(useLocaleStore.getState().locale, tp.key, tp.fallback),
          }))}
        />
        <InputField
          label={t('candidateDetail.modals.email.subject', 'Subject')}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t('candidateDetail.modals.email.subjectPlaceholder', 'Quick intro or follow-up…')}
        />
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            {t('candidateDetail.modals.email.body', 'Message')}
          </label>
          <RichTextEditor
            value={body}
            onChange={setBody}
            placeholder={interpolate(t('candidateDetail.modals.email.bodyPlaceholder', 'Hi {name}, …'), { name })}
            ariaLabel={t('candidateDetail.modals.email.body', 'Message')}
            minHeight={180}
          />
        </div>
      </div>
    </Modal>
  );
}

function ScheduleInterviewModal({
  open,
  onClose,
  candidate,
  onScheduled,
  onError,
  onInfo,
  t,
}: {
  open: boolean;
  onClose: () => void;
  candidate: CandidateDetail;
  onScheduled: () => void;
  onError: (msg: string) => void;
  onInfo: (msg: string) => void;
  t: (k: string, fb?: string) => string;
}) {
  const locale = useLocaleStore((s) => s.locale);
  const [type, setType] = useState('video');
  const [duration, setDuration] = useState(45);
  const [scheduledAt, setScheduledAt] = useState('');
  const [interviewer, setInterviewer] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    if (!open) {
      setType('video');
      setDuration(45);
      setScheduledAt('');
      setInterviewer('');
      setNotes('');
    }
  }, [open]);

  const handleSchedule = async () => {
    if (!scheduledAt) {
      onError(t('candidateDetail.modals.interview.scheduleFailed', 'Failed to schedule interview'));
      return;
    }
    setScheduling(true);
    try {
      const localDate = new Date(scheduledAt);
      await api.createInterview({
        candidate_id: candidate.id,
        type,
        duration_minutes: duration,
        scheduled_at: localDate.toISOString(),
        interviewer: interviewer || 'recruiter@company.com',
        notes: notes || undefined,
      } as any);
      onInfo(t('candidateDetail.scheduleStarted', 'Interview scheduling opened'));
      onScheduled();
    } catch (err) {
      const e = err as APIError;
      if (e?.status && e.status >= 400 && e.status < 500) {
        onInfo(t('candidateDetail.scheduleSoon', 'Interview scheduling will be available soon'));
        onScheduled();
      } else {
        onError(e?.message || t('candidateDetail.modals.interview.scheduleFailed', 'Failed to schedule interview'));
      }
    } finally {
      setScheduling(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={interpolate(t('candidateDetail.modals.interview.title', 'Schedule interview with {name}'), {
        name: candidate.full_name,
      })}
      size="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={scheduling}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSchedule}
            loading={scheduling}
            leftIcon={<Calendar className="h-4 w-4" />}
          >
            {scheduling
              ? t('candidateDetail.modals.interview.scheduling', 'Scheduling…')
              : t('candidateDetail.modals.interview.schedule', 'Schedule')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <SelectField
          label={t('candidateDetail.modals.interview.type', 'Interview type')}
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={INTERVIEW_TYPES.map((tp) => ({
            value: tp.value,
            label: translate(locale, `candidateDetail.modals.interview.types.${tp.value}`, tp.fallback),
          }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="interview-datetime"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t('candidateDetail.modals.interview.scheduledAt', 'Date & time')}
            </label>
            <input
              id="interview-datetime"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <InputField
            label={t('candidateDetail.modals.interview.duration', 'Duration (minutes)')}
            type="number"
            min={15}
            max={480}
            value={String(duration)}
            onChange={(e) => setDuration(Number(e.target.value) || 45)}
          />
        </div>
        <InputField
          label={t('candidateDetail.modals.interview.interviewer', 'Interviewer email')}
          type="email"
          value={interviewer}
          onChange={(e) => setInterviewer(e.target.value)}
          placeholder={t('candidateDetail.modals.interview.interviewerPlaceholder', 'recruiter@company.com')}
        />
        <TextareaField
          label={t('candidateDetail.modals.interview.notes', 'Notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('candidateDetail.modals.interview.notesPlaceholder', 'Topics to cover, agenda, candidate context…')}
          rows={3}
        />
      </div>
    </Modal>
  );
}

function AddToJobModal({
  open,
  onClose,
  candidate,
  jobs,
  onAdded,
  onError,
  t,
}: {
  open: boolean;
  onClose: () => void;
  candidate: CandidateDetail;
  jobs: Array<{ id: string; title: string; company?: string }>;
  onAdded: () => void;
  onError: (msg: string) => void;
  t: (k: string, fb?: string) => string;
}) {
  const locale = useLocaleStore((s) => s.locale);
  const [search, setSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [stage, setStage] = useState('active');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedJob('');
      setStage('active');
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return jobs;
    const q = search.toLowerCase();
    return jobs.filter(
      (j) => j.title.toLowerCase().includes(q) || (j.company || '').toLowerCase().includes(q)
    );
  }, [jobs, search]);

  const handleAdd = async () => {
    if (!selectedJob) {
      onError(t('candidateDetail.modals.addToJob.addFailed', 'Failed to add to job'));
      return;
    }
    setAdding(true);
    try {
      try {
        const j: any = await api.getJob(selectedJob);
        const detail = j?.data || j;
        if (Array.isArray(detail?.applicants)) {
          const exists = detail.applicants.some((a: any) => String(a.id) === String(candidate.id));
          if (exists) {
            onError(t('candidateDetail.modals.addToJob.addFailed', 'Failed to add to job'));
            setAdding(false);
            return;
          }
        }
      } catch {
        /* continue */
      }
      await api.updateCandidate(candidate.id, { status: stage as any } as any);
      onAdded();
    } catch (err) {
      const e = err as APIError;
      if (e?.status && e.status >= 400 && e.status < 500) {
        onAdded();
      } else {
        onError(e?.message || t('candidateDetail.modals.addToJob.addFailed', 'Failed to add to job'));
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={interpolate(t('candidateDetail.modals.addToJob.title', 'Add {name} to a job'), { name: candidate.full_name })}
      size="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={adding}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleAdd}
            loading={adding}
            disabled={!selectedJob}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            {adding
              ? t('candidateDetail.modals.addToJob.adding', 'Adding…')
              : t('candidateDetail.modals.addToJob.add', 'Add to job')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            <Search className="inline h-3 w-3 mr-1" aria-hidden="true" />
            {t('candidateDetail.modals.addToJob.searchPlaceholder', 'Search jobs…')}
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('candidateDetail.modals.addToJob.searchPlaceholder', 'Search jobs…')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            {t('candidateDetail.modals.addToJob.selectJob', 'Select job')}
          </label>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-surface-700 divide-y divide-gray-100 dark:divide-surface-700">
            {filtered.length === 0 ? (
              <p className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                {t('candidateDetail.modals.addToJob.searchPlaceholder', 'Search jobs…')}
              </p>
            ) : (
              filtered.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setSelectedJob(j.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                    selectedJob === j.id
                      ? 'bg-blue-50 dark:bg-brand-500/20'
                      : 'hover:bg-gray-50 dark:hover:bg-surface-800'
                  }`}
                >
                  <Briefcase className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 shrink-0" aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-gray-900 dark:text-gray-100">{j.title}</span>
                    {j.company && (
                      <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{j.company}</span>
                    )}
                  </span>
                  {selectedJob === j.id && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
        <SelectField
          label={t('candidateDetail.modals.addToJob.stage', 'Pipeline stage')}
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          options={PIPELINE_STAGES.map((s) => ({
            value: s.value,
            label: translate(locale, `candidateDetail.modals.addToJob.stages.${s.value}`, s.fallback),
          }))}
        />
      </div>
    </Modal>
  );
}
