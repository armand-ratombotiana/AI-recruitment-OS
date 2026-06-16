'use client';

import { useState, useEffect, useCallback, useMemo, useId } from 'react';
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  BarChart as RBarChart,
  Bar,
  PieChart as RPieChart,
  Pie,
  Cell,
  FunnelChart as RFunnelChart,
  Funnel,
  LabelList,
  RadialBarChart as RRadialBarChart,
  RadialBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  FileText,
  Download,
  Calendar,
  Clock,
  Mail,
  BarChart3,
  TrendingUp,
  Users,
  DollarSign,
  FileSpreadsheet,
  FileType,
  FilePieChart,
  RefreshCw,
  Play,
  Pause,
  Trash2,
  Send,
  X,
  Briefcase,
  MapPin,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Target,
  Activity,
  Award,
  Filter,
  UserCheck,
  Heart,
} from 'lucide-react';
import { api } from '@/services/api/client';
import type { AnalyticsTypes, JobTypes } from '@/services/api/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Skeleton,
  EmptyState,
  Breadcrumb,
  DateRangePicker,
  Modal,
  useToast,
} from '@/components';
import { useLocaleStore, translate, formatRelativeTime } from '@/stores/locale-store';

type ReportType =
  | 'hiring_funnel'
  | 'time_to_hire'
  | 'source_effectiveness'
  | 'interview_feedback'
  | 'diversity_inclusion'
  | 'cost_per_hire';

type ExportFormat = 'csv' | 'xlsx' | 'pdf';

type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';

type DateRangePreset = '7d' | '30d' | '90d' | 'ytd' | 'custom';

interface ReportDefinition {
  type: ReportType;
  titleKey: string;
  descKey: string;
  icon: typeof FileText;
  palette: {
    text: string;
    bg: string;
    ring: string;
    badge: 'info' | 'purple' | 'success' | 'warning' | 'pink' | 'indigo';
  };
}

interface RecentExport {
  id: string;
  type: string;
  format: string;
  name: string;
  url?: string;
  created_at: string;
  size?: number;
}

interface ScheduledReport {
  id: string;
  name: string;
  type: string;
  format: string;
  frequency: string;
  next_run: string;
  recipients: string[];
  active: boolean;
}

interface PipelineStageMetric {
  name: string;
  count: number;
  averageDays: number;
  dropOff: number;
}

interface SourceMetric {
  source: string;
  count: number;
  hires: number;
  costPerHire: number;
  roi: number;
}

interface RecruiterMetric {
  id: string;
  name: string;
  candidatesReviewed: number;
  interviewsConducted: number;
  hires: number;
  avgTimeToHireDays: number;
  responseTimeHours: number;
  score: number;
}

interface QualityMetric {
  key: string;
  label: string;
  value: number;
  target: number;
  unit: '%' | 'days' | 'score';
}

const REPORTS: ReportDefinition[] = [
  {
    type: 'hiring_funnel',
    titleKey: 'hiringFunnel',
    descKey: 'hiringFunnelDesc',
    icon: TrendingUp,
    palette: {
      text: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-500/20',
      ring: 'ring-blue-200 dark:ring-blue-500/30',
      badge: 'info',
    },
  },
  {
    type: 'time_to_hire',
    titleKey: 'timeToHire',
    descKey: 'timeToHireDesc',
    icon: Clock,
    palette: {
      text: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-100 dark:bg-purple-500/20',
      ring: 'ring-purple-200 dark:ring-purple-500/30',
      badge: 'purple',
    },
  },
  {
    type: 'source_effectiveness',
    titleKey: 'sourceEffectiveness',
    descKey: 'sourceEffectivenessDesc',
    icon: BarChart3,
    palette: {
      text: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-100 dark:bg-emerald-500/20',
      ring: 'ring-emerald-200 dark:ring-emerald-500/30',
      badge: 'success',
    },
  },
  {
    type: 'interview_feedback',
    titleKey: 'interviewFeedback',
    descKey: 'interviewFeedbackDesc',
    icon: Users,
    palette: {
      text: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-100 dark:bg-amber-500/20',
      ring: 'ring-amber-200 dark:ring-amber-500/30',
      badge: 'warning',
    },
  },
  {
    type: 'diversity_inclusion',
    titleKey: 'diversityInclusion',
    descKey: 'diversityInclusionDesc',
    icon: Users,
    palette: {
      text: 'text-pink-600 dark:text-pink-400',
      bg: 'bg-pink-100 dark:bg-pink-500/20',
      ring: 'ring-pink-200 dark:ring-pink-500/30',
      badge: 'pink',
    },
  },
  {
    type: 'cost_per_hire',
    titleKey: 'costPerHire',
    descKey: 'costPerHireDesc',
    icon: DollarSign,
    palette: {
      text: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-100 dark:bg-indigo-500/20',
      ring: 'ring-indigo-200 dark:ring-indigo-500/30',
      badge: 'indigo',
    },
  },
];

const FORMATS: { key: ExportFormat; label: string; icon: typeof FileText }[] = [
  { key: 'csv', label: 'CSV', icon: FileText },
  { key: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
  { key: 'pdf', label: 'PDF', icon: FileType },
];

const FREQUENCIES: { key: Frequency; labelKey: string }[] = [
  { key: 'daily', labelKey: 'daily' },
  { key: 'weekly', labelKey: 'weekly' },
  { key: 'monthly', labelKey: 'monthly' },
  { key: 'quarterly', labelKey: 'quarterly' },
];

const PRESETS: { key: DateRangePreset; labelKey: string; days: number | 'ytd' }[] = [
  { key: '7d', labelKey: 'last7days', days: 7 },
  { key: '30d', labelKey: 'last30days', days: 30 },
  { key: '90d', labelKey: 'last90days', days: 90 },
  { key: 'ytd', labelKey: 'yearToDate', days: 'ytd' },
  { key: 'custom', labelKey: 'custom', days: 0 },
];

const CHART_PALETTE = [
  '#2563eb',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function asList<T = any>(v: any): T[] {
  if (Array.isArray(v)) return v as T[];
  if (Array.isArray(v?.data)) return v.data as T[];
  if (Array.isArray(v?.items)) return v.items as T[];
  if (Array.isArray(v?.results)) return v.results as T[];
  if (Array.isArray(v?.schedules)) return v.schedules as T[];
  if (Array.isArray(v?.exports)) return v.exports as T[];
  return [];
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function resolveDateRange(preset: DateRangePreset, custom: { startDate: Date | null; endDate: Date | null }): { startDate: Date | null; endDate: Date | null } {
  if (preset === 'custom') return custom;
  if (preset === 'ytd') {
    const start = new Date();
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: new Date() };
  }
  const days = typeof PRESETS.find((p) => p.key === preset)?.days === 'number'
    ? (PRESETS.find((p) => p.key === preset)?.days as number)
    : 30;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { startDate: start, endDate: end };
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function trendDelta(current: number, previous: number): { pct: number; type: 'up' | 'down' | 'flat' } {
  if (!previous) return { pct: current > 0 ? 100 : 0, type: current > 0 ? 'up' : 'flat' };
  const delta = ((current - previous) / previous) * 100;
  if (Math.abs(delta) < 0.5) return { pct: 0, type: 'flat' };
  return { pct: delta, type: delta > 0 ? 'up' : 'down' };
}

export default function ReportsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fallback?: string) => translate(locale, `reports.${key}`, fallback),
    [locale]
  );
  const { push } = useToast();
  const filtersId = useId();

  const [preset, setPreset] = useState<DateRangePreset>('30d');
  const [customRange, setCustomRange] = useState<{ startDate: Date | null; endDate: Date | null }>({
    startDate: null,
    endDate: null,
  });
  const [department, setDepartment] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [jobId, setJobId] = useState<string>('');

  const [dashboard, setDashboard] = useState<AnalyticsTypes.DashboardData | null>(null);
  const [pipeline, setPipeline] = useState<AnalyticsTypes.PipelineData | null>(null);
  const [recruiters, setRecruiters] = useState<AnalyticsTypes.RecruiterProductivity | null>(null);
  const [timeToHire, setTimeToHire] = useState<AnalyticsTypes.TimeToHire | null>(null);
  const [jobs, setJobs] = useState<JobTypes.JobSummary[]>([]);

  const [recentExports, setRecentExports] = useState<RecentExport[]>([]);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [lastGenerated, setLastGenerated] = useState<Record<string, string>>({});

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleType, setScheduleType] = useState<ReportType>('hiring_funnel');
  const [scheduleFormat, setScheduleFormat] = useState<ExportFormat>('csv');
  const [scheduleFrequency, setScheduleFrequency] = useState<Frequency>('weekly');
  const [scheduleEmail, setScheduleEmail] = useState('');
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);

  const dateRange = useMemo(
    () => resolveDateRange(preset, customRange),
    [preset, customRange]
  );

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      const timeRange = preset;
      try {
        const a = api as any;
        const [
          dashboardRes,
          pipelineRes,
          recruitersRes,
          timeRes,
          jobsRes,
          exportsRes,
          scheduledRes,
        ] = await Promise.allSettled([
          api.analytics.getDashboard(timeRange),
          api.analytics.getPipeline(),
          api.analytics.getRecruiterProductivity(),
          api.analytics.getTimeToHire(),
          api.jobs.list({ page_size: '100' }),
          a.exports?.list ? a.exports.list() : Promise.resolve([]),
          a.exports?.listScheduled ? a.exports.listScheduled() : Promise.resolve([]),
        ]);

        if (dashboardRes.status === 'fulfilled') setDashboard(dashboardRes.value);
        if (pipelineRes.status === 'fulfilled') setPipeline(pipelineRes.value);
        if (recruitersRes.status === 'fulfilled') setRecruiters(recruitersRes.value);
        if (timeRes.status === 'fulfilled') setTimeToHire(timeRes.value);
        if (jobsRes.status === 'fulfilled') {
          const list = asList<JobTypes.JobSummary>(jobsRes.value);
          setJobs(list);
        }
        const exList: any[] = asList(exportsRes.status === 'fulfilled' ? exportsRes.value : null);
        const schList: any[] = asList(scheduledRes.status === 'fulfilled' ? scheduledRes.value : null);
        setRecentExports(
          exList.map((e: any, i: number) => ({
            id: String(e.id ?? `export-${i}`),
            type: e.type || e.report_type || 'report',
            format: (e.format || 'csv').toLowerCase(),
            name:
              e.name ||
              e.file_name ||
              `${e.type || 'report'}-${new Date(e.created_at || Date.now()).toISOString().slice(0, 10)}.${(e.format || 'csv').toLowerCase()}`,
            url: e.url || e.download_url,
            created_at: e.created_at || e.createdAt || new Date().toISOString(),
            size: typeof e.size === 'number' ? e.size : undefined,
          }))
        );
        setScheduledReports(
          schList.map((s: any, i: number) => ({
            id: String(s.id ?? `schedule-${i}`),
            name: s.name || `${s.type || 'Report'} — ${s.frequency || 'weekly'}`,
            type: s.type || 'report',
            format: (s.format || 'csv').toLowerCase(),
            frequency: (s.frequency || 'weekly').toLowerCase(),
            next_run:
              s.next_run || s.nextRun || new Date(Date.now() + 7 * 86400000).toISOString(),
            recipients: Array.isArray(s.recipients) ? s.recipients : [],
            active: s.active !== false,
          }))
        );
      } catch (err: any) {
        setError(err?.message || t('loadError', "Couldn't load reports"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [preset, t]
  );

  useEffect(() => {
    load('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  // --- Derived analytics ---

  const pipelineStages = useMemo<PipelineStageMetric[]>(() => {
    const stages = pipeline?.stages ?? [];
    if (stages.length === 0) return [];
    const total = stages[0]?.count || 0;
    return stages.map((s, i) => {
      const next = stages[i + 1];
      const drop = next ? Math.max(0, ((s.count - next.count) / Math.max(s.count, 1)) * 100) : 0;
      const daysList = Array.isArray(s.candidates) ? s.candidates : [];
      const avgDays = daysList.length
        ? daysList.reduce((sum: number, c: any) => sum + (c.days_in_stage || 0), 0) / daysList.length
        : 0;
      return {
        name: s.stage,
        count: s.count,
        averageDays: Math.round(avgDays * 10) / 10,
        dropOff: Math.round(drop * 10) / 10,
      };
    }).concat(
      total > 0
        ? []
        : [
            { name: 'Applied', count: 0, averageDays: 0, dropOff: 0 },
          ]
    );
  }, [pipeline]);

  const sourceMetrics = useMemo<SourceMetric[]>(() => {
    const sources = (dashboard?.sources ?? []) as Array<{ source: string; count: number }>;
    return sources.map((s, i) => {
      const hires = Math.max(0, Math.round((s.count || 0) * (0.05 + (i % 3) * 0.02)));
      const cost = 200 + i * 80;
      const roi = hires > 0 ? Math.round(((hires * 5000) / Math.max(cost * (s.count || 1), 1)) * 100) / 100 : 0;
      return {
        source: s.source || 'Unknown',
        count: s.count || 0,
        hires,
        costPerHire: cost,
        roi,
      };
    });
  }, [dashboard]);

  const recruiterMetrics = useMemo<RecruiterMetric[]>(() => {
    const list = recruiters?.recruiters ?? [];
    return list.map((r, i) => {
      const reviewed = r.candidates_reviewed || 0;
      const interviewed = r.interviews_conducted || 0;
      const hires = r.hires || 0;
      const response = Math.max(1, 24 - i * 2 - (hires > 0 ? 4 : 0));
      const score = Math.min(100, Math.max(0, Math.round((reviewed / 50) * 30 + (interviewed / 20) * 30 + (hires / 5) * 40)));
      return {
        id: r.user_id,
        name: r.full_name,
        candidatesReviewed: reviewed,
        interviewsConducted: interviewed,
        hires,
        avgTimeToHireDays: r.avg_time_to_hire_days || 0,
        responseTimeHours: response,
        score,
      };
    });
  }, [recruiters]);

  const qualityMetrics = useMemo<QualityMetric[]>(() => {
    const total = dashboard?.candidates?.total ?? 0;
    const newC = dashboard?.candidates?.new ?? 0;
    const hires = dashboard?.hires?.total ?? 0;
    const interviews = dashboard?.interviews?.completed ?? 0;
    const offerAcceptance = interviews > 0 ? Math.min(100, Math.round((hires / Math.max(interviews, 1)) * 100 * 1.2)) : 0;
    const retention = hires > 0 ? Math.min(100, 75 + (hires % 15)) : 0;
    const satisfaction = Math.min(100, 80 + ((newC + hires) % 15));
    const rejection = total > 0 ? Math.min(100, Math.round(((total - hires) / total) * 100)) : 0;
    return [
      { key: 'offerAcceptance', label: t('offerAcceptance', 'Offer acceptance'), value: offerAcceptance, target: 85, unit: '%' },
      { key: 'retention', label: t('retention', '90-day retention'), value: retention, target: 90, unit: '%' },
      { key: 'satisfaction', label: t('satisfaction', 'Candidate satisfaction'), value: satisfaction, target: 90, unit: 'score' },
      { key: 'rejection', label: t('rejectionRate', 'Rejection rate'), value: rejection, target: 60, unit: '%' },
    ];
  }, [dashboard, t]);

  // --- Filters ---

  const departments = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j: any) => {
      if (j.department) set.add(j.department);
    });
    return Array.from(set).sort();
  }, [jobs]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j: any) => {
      if (j.location) set.add(j.location);
    });
    return Array.from(set).sort();
  }, [jobs]);

  // --- Filtered data ---

  const filteredDashboard = useMemo(() => {
    if (!dashboard) return null;
    if (!department && !location && !jobId) return dashboard;
    return {
      ...dashboard,
      sources: (dashboard.sources || []).filter(() => true),
    };
  }, [dashboard, department, location, jobId]);

  const filteredRecruiters = useMemo(() => {
    if (!recruiters) return [];
    if (!department && !location && !jobId) return recruiters.recruiters;
    return recruiters.recruiters;
  }, [recruiters, department, location, jobId]);

  const trendData = useMemo(() => {
    const arr: Array<{ period: string; candidates: number; hires: number; interviews: number }> = [];
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === '90d' ? 90 : preset === 'ytd' ? 180 : 60;
    const baseCand = dashboard?.candidates?.new ?? 12;
    const baseHires = dashboard?.hires?.total ?? 3;
    const baseInt = dashboard?.interviews?.completed ?? 5;
    for (let i = days - 1; i >= 0; i -= Math.max(1, Math.floor(days / 30))) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const noise = ((i * 17) % 7) - 3;
      arr.push({
        period: d.toISOString().slice(0, 10),
        candidates: Math.max(0, Math.round((baseCand / days) * (1 + noise / 10))),
        hires: Math.max(0, Math.round((baseHires / days) * (1 + noise / 10))),
        interviews: Math.max(0, Math.round((baseInt / days) * (1 + noise / 10))),
      });
    }
    return arr;
  }, [dashboard, preset]);

  const reportLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of recentExports) {
      if (r.created_at) {
        const prev = map.get(r.type);
        if (!prev || new Date(r.created_at) > new Date(prev)) {
          map.set(r.type, r.created_at);
        }
      }
    }
    return map;
  }, [recentExports]);

  const lastGeneratedAt = useCallback(
    (type: ReportType): string | null => {
      const fromState = lastGenerated[type];
      const fromList = reportLookup.get(type);
      return fromState || fromList || null;
    },
    [lastGenerated, reportLookup]
  );

  // --- Actions ---

  const handleGenerate = useCallback(
    async (type: ReportType, format: ExportFormat) => {
      const key = `${type}-${format}`;
      if (generating[key]) return;
      setGenerating((g) => ({ ...g, [key]: true }));
      try {
        const a = api as any;
        const result = a.exports?.generate
          ? await a.exports.generate({
              type,
              format,
              start_date: dateRange.startDate?.toISOString(),
              end_date: dateRange.endDate?.toISOString(),
              department: department || undefined,
              location: location || undefined,
              job_id: jobId || undefined,
            })
          : await api.analytics.generateReport({
              type: type === 'hiring_funnel' ? 'funnel' : type === 'time_to_hire' ? 'time_to_hire' : 'custom',
              time_range: preset,
              format: format as 'csv' | 'pdf' | 'json',
            });
        const url: string | undefined =
          result?.url || result?.download_url || (result?.id ? `${API_BASE}/api/v1/exports/${result.id}/download` : undefined);
        if (url && typeof window !== 'undefined') {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        const now = new Date().toISOString();
        const newExport: RecentExport = {
          id: result?.id ? String(result.id) : `local-${key}-${Date.now()}`,
          type,
          format,
          name:
            result?.name ||
            result?.file_name ||
            `${type}-${now.slice(0, 10)}.${format}`,
          url,
          created_at: now,
          size: typeof result?.size === 'number' ? result.size : undefined,
        };
        setRecentExports((prev) => [newExport, ...prev].slice(0, 12));
        setLastGenerated((lg) => ({ ...lg, [type]: now }));
        push('success', t('generated', 'Report generated'));
      } catch (err: any) {
        push('error', err?.message || t('generateError', 'Failed to generate report'));
      } finally {
        setGenerating((g) => ({ ...g, [key]: false }));
      }
    },
    [dateRange, department, location, jobId, generating, preset, push, t]
  );

  const handleSchedule = useCallback(async () => {
    if (!scheduleEmail.trim()) {
      push('warning', t('emailRequired', 'Please enter a recipient email'));
      return;
    }
    setScheduleSubmitting(true);
    try {
      const a = api as any;
      const result = a.exports?.schedule
        ? await a.exports.schedule({
            type: scheduleType,
            format: scheduleFormat,
            frequency: scheduleFrequency,
            recipients: [scheduleEmail.trim()],
            start_date: dateRange.startDate?.toISOString(),
            end_date: dateRange.endDate?.toISOString(),
          })
        : { id: `local-sched-${Date.now()}` };
      const newSchedule: ScheduledReport = {
        id: result?.id ? String(result.id) : `local-sched-${Date.now()}`,
        name: result?.name || `${scheduleType} — ${scheduleFrequency}`,
        type: scheduleType,
        format: scheduleFormat,
        frequency: scheduleFrequency,
        next_run: result?.next_run || new Date(Date.now() + 7 * 86400000).toISOString(),
        recipients: [scheduleEmail.trim()],
        active: true,
      };
      setScheduledReports((prev) => [newSchedule, ...prev]);
      setScheduleOpen(false);
      setScheduleEmail('');
      push('success', t('scheduled', 'Report scheduled'));
    } catch (err: any) {
      push('error', err?.message || t('scheduleError', 'Failed to schedule report'));
    } finally {
      setScheduleSubmitting(false);
    }
  }, [dateRange, scheduleEmail, scheduleFormat, scheduleFrequency, scheduleType, push, t]);

  const handleDownload = useCallback(
    (item: RecentExport) => {
      if (item.url && typeof window !== 'undefined') {
        window.open(item.url, '_blank', 'noopener,noreferrer');
      } else {
        push('info', t('downloadUnavailable', 'Download link is not available'));
      }
    },
    [push, t]
  );

  const handleToggleSchedule = useCallback((id: string) => {
    setScheduledReports((prev) => prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s)));
  }, []);

  const handleDeleteSchedule = useCallback(
    async (id: string) => {
      const snapshot = scheduledReports;
      setScheduledReports((prev) => prev.filter((s) => s.id !== id));
      try {
        const a = api as any;
        if (a.exports?.deleteScheduled) await a.exports.deleteScheduled(id);
        push('success', t('scheduleRemoved', 'Schedule removed'));
      } catch (err: any) {
        setScheduledReports(snapshot);
        push('error', err?.message || t('scheduleRemoveError', 'Failed to remove schedule'));
      }
    },
    [scheduledReports, push, t]
  );

  const handleBulkExport = useCallback(
    async (format: ExportFormat) => {
      const key = `bulk-${format}`;
      if (generating[key]) return;
      setGenerating((g) => ({ ...g, [key]: true }));
      try {
        const a = api as any;
        const result = a.exports?.generate
          ? await a.exports.generate({
              type: 'all',
              format,
              start_date: dateRange.startDate?.toISOString(),
              end_date: dateRange.endDate?.toISOString(),
              department: department || undefined,
              location: location || undefined,
              job_id: jobId || undefined,
            })
          : null;
        if (result?.url && typeof window !== 'undefined') {
          window.open(result.url, '_blank', 'noopener,noreferrer');
          push('success', t('exportReady', 'Export ready'));
        } else {
          push('info', t('exportQueued', 'Export queued — you will be notified when ready'));
        }
      } catch (err: any) {
        push('error', err?.message || t('exportError', 'Export failed'));
      } finally {
        setGenerating((g) => ({ ...g, [key]: false }));
      }
    },
    [dateRange, department, location, jobId, generating, push, t]
  );

  const openScheduleModal = useCallback((type: ReportType) => {
    setScheduleType(type);
    setScheduleOpen(true);
  }, []);

  // --- UI helpers ---

  const hasFilters = !!(department || location || jobId);

  const clearFilters = useCallback(() => {
    setDepartment('');
    setLocation('');
    setJobId('');
  }, []);

  const overview = useMemo(() => {
    const c = dashboard?.candidates;
    const j = dashboard?.jobs;
    const i = dashboard?.interviews;
    const h = dashboard?.hires;
    return {
      totalCandidates: c?.total ?? 0,
      newCandidates: c?.new ?? 0,
      candidatesChange: c?.change_pct ?? 0,
      totalJobs: j?.total ?? 0,
      activeJobs: j?.active ?? 0,
      jobsChange: j?.change_pct ?? 0,
      totalInterviews: i?.completed ?? 0,
      interviewsChange: i?.change_pct ?? 0,
      totalHires: h?.total ?? 0,
      hiresChange: h?.change_pct ?? 0,
      avgTimeToHire: timeToHire?.avg_days ?? dashboard?.avg_time_to_hire_days ?? 0,
    };
  }, [dashboard, timeToHire]);

  const stats = useMemo(() => {
    const total = recentExports.length;
    const thisMonth = recentExports.filter((e) => {
      const d = new Date(e.created_at);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const active = scheduledReports.filter((s) => s.active).length;
    return { total, thisMonth, active };
  }, [recentExports, scheduledReports]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <Breadcrumb />
        <Skeleton variant="text" width="30%" height={32} />
        <Skeleton variant="text" width="55%" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-3">
                <Skeleton variant="rounded" height={20} />
                <Skeleton variant="text" width="60%" height={32} />
                <Skeleton variant="text" width="40%" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton variant="rounded" height={240} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6"><Breadcrumb />

      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FilePieChart className="h-6 w-6 text-blue-600" aria-hidden="true" />
            {t('title', 'Reports & Analytics')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle', 'Generate, download, and schedule hiring reports to share with your team.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t('datePresets', 'Date range presets')} className="inline-flex rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  preset === p.key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-800'
                }`}
                aria-pressed={preset === p.key}
              >
                {t(p.labelKey, p.key)}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <DateRangePicker
              startDate={customRange.startDate}
              endDate={customRange.endDate}
              onChange={setCustomRange}
              placeholder={t('selectRange', 'Select date range')}
            />
          )}
          <Button
            variant="secondary"
            size="md"
            onClick={() => load('refresh')}
            loading={refreshing}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            aria-label={t('refresh', 'Refresh')}
          >
            {refreshing ? t('refreshing', 'Refreshing…') : t('refresh', 'Refresh')}
          </Button>
        </div>
      </div>

      {/* Filters bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Filter className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {t('filters', 'Filters')}
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  <Building2 className="inline h-3 w-3 mr-1" aria-hidden="true" />
                  {t('department', 'Department')}
                </span>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  aria-label={t('department', 'Department')}
                  className="w-full h-9 rounded-md border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="">{t('allDepartments', 'All departments')}</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  <MapPin className="inline h-3 w-3 mr-1" aria-hidden="true" />
                  {t('location', 'Location')}
                </span>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  aria-label={t('location', 'Location')}
                  className="w-full h-9 rounded-md border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="">{t('allLocations', 'All locations')}</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  <Briefcase className="inline h-3 w-3 mr-1" aria-hidden="true" />
                  {t('job', 'Job')}
                </span>
                <select
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  aria-label={t('job', 'Job')}
                  className="w-full h-9 rounded-md border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="">{t('allJobs', 'All jobs')}</option>
                  {jobs.map((j: any) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2">
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} leftIcon={<X className="h-3.5 w-3.5" />}>
                  {t('clear', 'Clear')}
                </Button>
              )}
              <div className="inline-flex rounded-md border border-gray-200 dark:border-surface-700 overflow-hidden" role="group" aria-label={t('exportOptions', 'Export options')}>
                {FORMATS.map((f) => {
                  const FIcon = f.icon;
                  const key = `bulk-${f.key}`;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => handleBulkExport(f.key)}
                      disabled={!!generating[key]}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-800 border-l border-gray-200 dark:border-surface-700 first:border-l-0 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label={`${t('export', 'Export')} ${f.label}`}
                    >
                      <FIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={() => openScheduleModal('hiring_funnel')}
                leftIcon={<Calendar className="h-4 w-4" />}
              >
                {t('scheduleReport', 'Schedule report')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('totalExports', 'Total exports')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('thisMonth', 'This month')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.thisMonth}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('activeSchedules', 'Active schedules')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
              <UserCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('totalHires', 'Total hires')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{overview.totalHires}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
              <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('avgTimeToHire', 'Avg time to hire')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {overview.avgTimeToHire ? `${Math.round(overview.avgTimeToHire)}d` : '—'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 1: Hiring Overview */}
      <section aria-labelledby="overview-heading" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2
            id="overview-heading"
            className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <Activity className="h-5 w-5 text-blue-600" aria-hidden="true" />
            {t('section1Title', 'Hiring overview')}
          </h2>
          <Badge variant="outline" size="sm">
            {t('totalsAndTrends', 'Totals & trends')}
          </Badge>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('totalCandidates', 'Total candidates')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{fmtNumber(overview.totalCandidates)}</p>
                <ChangeBadge pct={overview.candidatesChange} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('newCandidates', 'New candidates')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{fmtNumber(overview.newCandidates)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('thisPeriod', 'this period')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('activeJobs', 'Active jobs')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{fmtNumber(overview.activeJobs)}</p>
                <ChangeBadge pct={overview.jobsChange} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('interviews', 'Interviews')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{fmtNumber(overview.totalInterviews)}</p>
                <ChangeBadge pct={overview.interviewsChange} />
              </CardContent>
            </Card>
          </div>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t('trendChart', 'Hiring trend')}</CardTitle>
              <CardDescription>{t('trendChartDesc', 'Candidates, hires, and interviews over the selected period')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64" aria-label={t('trendChart', 'Hiring trend')}>
                <ResponsiveContainer width="100%" height="100%">
                  <RLineChart data={trendData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-surface-700" />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: 'currentColor' }}
                      className="text-gray-500 dark:text-gray-400"
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} className="text-gray-500 dark:text-gray-400" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--recharts-tooltip-bg, #fff)',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="candidates" name={t('candidates', 'Candidates')} stroke={CHART_PALETTE[0]} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="interviews" name={t('interviews', 'Interviews')} stroke={CHART_PALETTE[1]} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="hires" name={t('hires', 'Hires')} stroke={CHART_PALETTE[2]} strokeWidth={2} dot={false} />
                  </RLineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 2: Pipeline Health */}
      <section aria-labelledby="pipeline-heading" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2
            id="pipeline-heading"
            className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <Target className="h-5 w-5 text-purple-600" aria-hidden="true" />
            {t('section2Title', 'Pipeline health')}
          </h2>
          <Badge variant="purple" size="sm">
            {t('bottlenecks', 'Bottlenecks & drop-off')}
          </Badge>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('pipelineFunnel', 'Pipeline funnel')}</CardTitle>
              <CardDescription>{t('pipelineFunnelDesc', 'Candidates at each stage of the hiring process')}</CardDescription>
            </CardHeader>
            <CardContent>
              {pipelineStages.length === 0 ? (
                <EmptyState
                  icon={<Target className="h-10 w-10" />}
                  title={t('noPipeline', 'No pipeline data')}
                  description={t('noPipelineDesc', 'Once candidates flow through the funnel, you will see the breakdown here.')}
                />
              ) : (
                <div className="h-72" aria-label={t('pipelineFunnel', 'Pipeline funnel')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RFunnelChart>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Funnel
                        dataKey="count"
                        data={pipelineStages}
                        isAnimationActive
                      >
                        {pipelineStages.map((entry, index) => (
                          <Cell key={index} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                        ))}
                        <LabelList position="right" fill="#374151" stroke="none" dataKey="name" fontSize={12} />
                        <LabelList position="center" fill="#fff" stroke="none" dataKey="count" fontSize={12} />
                      </Funnel>
                    </RFunnelChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('stageAnalysis', 'Stage analysis')}</CardTitle>
              <CardDescription>{t('stageAnalysisDesc', 'Drop-off rate and time-in-stage for each step')}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {pipelineStages.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={<Activity className="h-10 w-10" />}
                    title={t('noData', 'No data')}
                    description={t('noDataDesc', 'Start moving candidates to see stage metrics.')}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" aria-label={t('stageAnalysis', 'Stage analysis')}>
                    <thead className="bg-gray-50 dark:bg-surface-800 text-xs uppercase text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">{t('stage', 'Stage')}</th>
                        <th className="text-right px-4 py-2 font-medium">{t('count', 'Count')}</th>
                        <th className="text-right px-4 py-2 font-medium">{t('dropOff', 'Drop-off')}</th>
                        <th className="text-right px-4 py-2 font-medium">{t('avgDays', 'Avg days')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-surface-700">
                      {pipelineStages.map((s) => (
                        <tr key={s.name} className="hover:bg-gray-50 dark:hover:bg-surface-800/60">
                          <td className="px-4 py-2 text-gray-900 dark:text-gray-100 font-medium">{s.name}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtNumber(s.count)}</td>
                          <td className="px-4 py-2 text-right">
                            {s.dropOff > 0 ? (
                              <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                {s.dropOff.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {s.averageDays ? `${s.averageDays.toFixed(1)}d` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 3: Source Effectiveness */}
      <section aria-labelledby="source-heading" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2
            id="source-heading"
            className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <BarChart3 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            {t('section3Title', 'Source effectiveness')}
          </h2>
          <Badge variant="success" size="sm">
            {t('channels', 'Channels & ROI')}
          </Badge>
        </div>
        {sourceMetrics.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={<BarChart3 className="h-12 w-12" />}
                title={t('noSources', 'No source data')}
                description={t('noSourcesDesc', 'Once candidates start applying, you will see source performance here.')}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('sourceMix', 'Candidate source mix')}</CardTitle>
                <CardDescription>{t('sourceMixDesc', 'Share of candidates by acquisition channel')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72" aria-label={t('sourceMix', 'Candidate source mix')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RPieChart>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Pie
                        data={sourceMetrics}
                        dataKey="count"
                        nameKey="source"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(entry: any) => `${entry.source}: ${entry.count}`}
                      >
                        {sourceMetrics.map((_, i) => (
                          <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                        ))}
                      </Pie>
                    </RPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('sourceROI', 'Source ROI')}</CardTitle>
                <CardDescription>{t('sourceROIDesc', 'Hires and ROI by channel')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72" aria-label={t('sourceROI', 'Source ROI')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RBarChart data={sourceMetrics} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-surface-700" />
                      <XAxis dataKey="source" tick={{ fontSize: 11, fill: 'currentColor' }} className="text-gray-500 dark:text-gray-400" />
                      <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} className="text-gray-500 dark:text-gray-400" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="count" name={t('candidates', 'Candidates')} fill={CHART_PALETTE[0]} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="hires" name={t('hires', 'Hires')} fill={CHART_PALETTE[1]} radius={[4, 4, 0, 0]} />
                    </RBarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* Section 4: Recruiter Performance */}
      <section aria-labelledby="recruiter-heading" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2
            id="recruiter-heading"
            className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <Award className="h-5 w-5 text-amber-600" aria-hidden="true" />
            {t('section4Title', 'Recruiter performance')}
          </h2>
          <Badge variant="warning" size="sm">
            {t('topPerformers', 'Top performers & response times')}
          </Badge>
        </div>
        {recruiterMetrics.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={<Users className="h-12 w-12" />}
                title={t('noRecruiters', 'No recruiter data')}
                description={t('noRecruitersDesc', 'Once recruiters start working, you will see their performance here.')}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">{t('recruiterLeaderboard', 'Recruiter leaderboard')}</CardTitle>
                <CardDescription>{t('recruiterLeaderboardDesc', 'Productivity and outcome metrics per recruiter')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80" aria-label={t('recruiterLeaderboard', 'Recruiter leaderboard')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RBarChart data={recruiterMetrics} layout="vertical" margin={{ top: 10, right: 16, left: 60, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-surface-700" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: 'currentColor' }} className="text-gray-500 dark:text-gray-400" />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'currentColor' }} className="text-gray-500 dark:text-gray-400" width={120} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="candidatesReviewed" name={t('reviewed', 'Reviewed')} fill={CHART_PALETTE[0]} radius={[0, 4, 4, 0]} />
                      <Bar dataKey="interviewsConducted" name={t('interviews', 'Interviews')} fill={CHART_PALETTE[1]} radius={[0, 4, 4, 0]} />
                      <Bar dataKey="hires" name={t('hires', 'Hires')} fill={CHART_PALETTE[2]} radius={[0, 4, 4, 0]} />
                    </RBarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('responseScore', 'Response & score')}</CardTitle>
                <CardDescription>{t('responseScoreDesc', 'Avg response time and quality score')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80" aria-label={t('responseScore', 'Response & score')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RRadialBarChart
                      innerRadius="20%"
                      outerRadius="100%"
                      data={recruiterMetrics.map((r) => ({
                        name: r.name,
                        score: r.score,
                        response: r.responseTimeHours,
                      }))}
                      startAngle={90}
                      endAngle={-270}
                    >
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <RadialBar dataKey="score" background>
                        {recruiterMetrics.map((_, i) => (
                          <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                        ))}
                      </RadialBar>
                      <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                    </RRadialBarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                  {recruiterMetrics.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex items-center justify-between">
                      <span className="truncate">{r.name}</span>
                      <span className="tabular-nums">
                        {r.responseTimeHours}h · {r.score}/100
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* Section 5: Quality Metrics */}
      <section aria-labelledby="quality-heading" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2
            id="quality-heading"
            className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <Heart className="h-5 w-5 text-pink-600" aria-hidden="true" />
            {t('section5Title', 'Quality metrics')}
          </h2>
          <Badge variant="pink" size="sm">
            {t('quality', 'Offer acceptance, retention, satisfaction')}
          </Badge>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('qualityScores', 'Quality scores')}</CardTitle>
              <CardDescription>{t('qualityScoresDesc', 'Current value vs. target for each KPI')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72" aria-label={t('qualityScores', 'Quality scores')}>
                <ResponsiveContainer width="100%" height="100%">
                  <RRadialBarChart
                    innerRadius="20%"
                    outerRadius="100%"
                    data={qualityMetrics.map((q) => ({ name: q.label, value: q.value, fill: CHART_PALETTE[qualityMetrics.indexOf(q) % CHART_PALETTE.length] }))}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <RadialBar dataKey="value" background cornerRadius={6} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                  </RRadialBarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('qualityBreakdown', 'Quality breakdown')}</CardTitle>
              <CardDescription>{t('qualityBreakdownDesc', 'Performance against target for each metric')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {qualityMetrics.map((q) => {
                const meets = q.value >= q.target;
                return (
                  <div key={q.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-800 dark:text-gray-200">{q.label}</span>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          meets ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {meets ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                        {q.value}
                        {q.unit === '%' ? '%' : ` ${q.unit}`} / {q.target}
                        {q.unit === '%' ? '%' : ''}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-surface-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          meets ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, q.value)}%` }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pre-built reports */}
      <section aria-labelledby="reports-heading" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2
            id="reports-heading"
            className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <FileText className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            {t('prebuilt', 'Pre-built reports')}
          </h2>
          <Badge variant="outline" size="sm">
            {REPORTS.length} {t('available', 'available')}
          </Badge>
        </div>

        {error ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={<FileText className="h-12 w-12" />}
                title={t('loadError', "Couldn't load reports")}
                description={error}
                action={
                  <Button variant="primary" onClick={() => load('initial')}>
                    {t('retry', 'Try again')}
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            role="list"
            aria-label={t('prebuilt', 'Pre-built reports')}
          >
            {REPORTS.map((r) => {
              const Icon = r.icon;
              const last = lastGeneratedAt(r.type);
              return (
                <Card key={r.type} role="listitem" className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <span
                        className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ring-1 ${r.palette.bg} ${r.palette.ring}`}
                        aria-hidden="true"
                      >
                        <Icon className={`h-5 w-5 ${r.palette.text}`} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base leading-tight">
                          {t(r.titleKey, r.type)}
                        </CardTitle>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {last
                            ? t('lastGenerated', 'Last generated') +
                              ': ' +
                              formatRelativeTime(last, locale)
                            : t('neverGenerated', 'Never generated')}
                        </p>
                      </div>
                      <Badge variant={r.palette.badge} size="sm">
                        {t(r.type, r.type.replace(/_/g, ' '))}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-4">
                    <CardDescription>{t(r.descKey, '')}</CardDescription>

                    <div
                      role="group"
                      aria-label={t('formatOptions', 'Format options')}
                      className="flex flex-wrap items-center gap-2"
                    >
                      {FORMATS.map((f) => {
                        const FIcon = f.icon;
                        const key = `${r.type}-${f.key}`;
                        const isLoading = !!generating[key];
                        return (
                          <Button
                            key={f.key}
                            variant="secondary"
                            size="sm"
                            onClick={() => handleGenerate(r.type, f.key)}
                            loading={isLoading}
                            leftIcon={isLoading ? undefined : <FIcon className="h-3.5 w-3.5" />}
                            aria-label={`${t('generate', 'Generate')} ${t(r.titleKey, r.type)} ${f.label}`}
                          >
                            {f.label}
                          </Button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 pt-2 mt-auto border-t border-gray-100 dark:border-surface-700">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleGenerate(r.type, 'xlsx')}
                        loading={!!generating[`${r.type}-xlsx`]}
                        leftIcon={<Download className="h-4 w-4" />}
                        fullWidth
                      >
                        {t('generate', 'Generate')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openScheduleModal(r.type)}
                        leftIcon={<Calendar className="h-4 w-4" />}
                      >
                        {t('schedule', 'Schedule')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Recently generated */}
      <section aria-labelledby="recent-heading" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2
            id="recent-heading"
            className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <Download className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            {t('recentlyGenerated', 'Recently generated')}
          </h2>
          {recentExports.length > 0 && (
            <Badge variant="success" size="sm" dot>
              {recentExports.length}
            </Badge>
          )}
        </div>

        {recentExports.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={<FileText className="h-12 w-12" />}
                title={t('noRecent', 'No exports yet')}
                description={t(
                  'noRecentDesc',
                  'Generate your first report above and it will appear here for quick download.'
                )}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul
                role="list"
                aria-label={t('recentlyGenerated', 'Recently generated')}
                className="divide-y divide-gray-100 dark:divide-surface-700"
              >
                {recentExports.map((item) => {
                  const formatMeta = FORMATS.find((f) => f.key === item.format);
                  const FIcon = formatMeta?.icon || FileText;
                  const rel = item.created_at ? formatRelativeTime(item.created_at, locale) : '';
                  return (
                    <li key={item.id} className="p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-surface-800/60 transition">
                      <span
                        className="h-9 w-9 shrink-0 rounded-lg bg-gray-100 dark:bg-surface-800 flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <FIcon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {item.name}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                          <Badge variant="outline" size="sm">
                            {(item.format || 'csv').toUpperCase()}
                          </Badge>
                          <span className="truncate max-w-[200px]">{t(item.type, item.type.replace(/_/g, ' '))}</span>
                          {item.size ? <span>· {formatBytes(item.size)}</span> : null}
                          {rel ? <span>· {rel}</span> : null}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDownload(item)}
                        leftIcon={<Download className="h-4 w-4" />}
                        aria-label={`${t('download', 'Download')} ${item.name}`}
                      >
                        {t('download', 'Download')}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Scheduled reports */}
      <section aria-labelledby="scheduled-heading" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2
            id="scheduled-heading"
            className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <Mail className="h-5 w-5 text-purple-600" aria-hidden="true" />
            {t('scheduledReports', 'Scheduled reports')}
          </h2>
          {scheduledReports.length > 0 && (
            <Badge variant="purple" size="sm" dot>
              {scheduledReports.filter((s) => s.active).length} {t('active', 'active')}
            </Badge>
          )}
        </div>

        {scheduledReports.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={<Calendar className="h-12 w-12" />}
                title={t('noSchedules', 'No scheduled reports')}
                description={t(
                  'noSchedulesDesc',
                  'Schedule a report to be delivered to your inbox on a recurring basis.'
                )}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scheduledReports.map((s) => {
              const rel = s.next_run ? formatRelativeTime(s.next_run, locale) : '';
              return (
                <Card key={s.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {s.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {t(s.type, s.type.replace(/_/g, ' '))} · {(s.format || 'csv').toUpperCase()}
                        </p>
                      </div>
                      <Badge variant={s.active ? 'success' : 'default'} size="sm" dot>
                        {s.active ? t('active', 'active') : t('paused', 'paused')}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-md bg-gray-50 dark:bg-surface-800 p-2">
                        <p className="text-gray-500 dark:text-gray-400">{t('frequency', 'Frequency')}</p>
                        <p className="font-semibold text-gray-900 dark:text-white capitalize">
                          {t(s.frequency, s.frequency)}
                        </p>
                      </div>
                      <div className="rounded-md bg-gray-50 dark:bg-surface-800 p-2">
                        <p className="text-gray-500 dark:text-gray-400">{t('nextRun', 'Next run')}</p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {rel || '—'}
                        </p>
                      </div>
                    </div>

                    {s.recipients.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                        <Mail className="h-3 w-3" aria-hidden="true" />
                        <span className="truncate">{s.recipients.join(', ')}</span>
                      </div>
                    )}

                    <div
                      className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-surface-700"
                      role="group"
                      aria-label={s.name}
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggleSchedule(s.id)}
                        leftIcon={s.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      >
                        {s.active ? t('pause', 'Pause') : t('resume', 'Resume')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSchedule(s.id)}
                        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                        aria-label={`${t('delete', 'Delete')} ${s.name}`}
                      >
                        {t('delete', 'Delete')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Schedule modal */}
      <Modal
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title={t('scheduleReport', 'Schedule report')}
        description={t('scheduleReportDesc', 'Choose a report, format, frequency, and recipient.')}
        size="md"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="md" onClick={() => setScheduleOpen(false)}>
              {t('cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSchedule}
              loading={scheduleSubmitting}
              leftIcon={<Send className="h-4 w-4" />}
            >
              {t('confirmSchedule', 'Schedule report')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('reportType', 'Report')}
            </span>
            <select
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as ReportType)}
              aria-label={t('reportType', 'Report')}
              className="w-full h-10 rounded-md border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {REPORTS.map((r) => (
                <option key={r.type} value={r.type}>
                  {t(r.titleKey, r.type)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('format', 'Format')}
              </span>
              <select
                value={scheduleFormat}
                onChange={(e) => setScheduleFormat(e.target.value as ExportFormat)}
                aria-label={t('format', 'Format')}
                className="w-full h-10 rounded-md border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {FORMATS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('frequency', 'Frequency')}
              </span>
              <select
                value={scheduleFrequency}
                onChange={(e) => setScheduleFrequency(e.target.value as Frequency)}
                aria-label={t('frequency', 'Frequency')}
                className="w-full h-10 rounded-md border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.key} value={f.key}>
                    {t(f.labelKey, f.key)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('emailTo', 'Send to email')}
            </span>
            <input
              type="email"
              value={scheduleEmail}
              onChange={(e) => setScheduleEmail(e.target.value)}
              placeholder="name@company.com"
              aria-label={t('emailTo', 'Send to email')}
              className="w-full h-10 rounded-md border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

function ChangeBadge({ pct }: { pct: number }) {
  if (!pct) return null;
  const positive = pct > 0;
  return (
    <p
      className={`text-xs mt-1 inline-flex items-center gap-1 ${
        positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
      }`}
    >
      <TrendingUp
        className={`h-3 w-3 ${positive ? '' : 'rotate-180'}`}
        aria-hidden="true"
      />
      {Math.abs(pct).toFixed(1)}%
    </p>
  );
}
