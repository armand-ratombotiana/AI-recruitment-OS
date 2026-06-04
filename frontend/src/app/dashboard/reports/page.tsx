'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Loader2,
  Play,
  Pause,
  Trash2,
  Send,
  X,
} from 'lucide-react';
import { api } from '@/services/api/client';
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

const FORMATS: { key: ExportFormat; label: string; icon: typeof FileText; mime: string }[] = [
  { key: 'csv', label: 'CSV', icon: FileText, mime: 'text/csv' },
  { key: 'xlsx', label: 'XLSX', icon: FileSpreadsheet, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { key: 'pdf', label: 'PDF', icon: FileType, mime: 'application/pdf' },
];

const FREQUENCIES: { key: Frequency; labelKey: string }[] = [
  { key: 'daily', labelKey: 'daily' },
  { key: 'weekly', labelKey: 'weekly' },
  { key: 'monthly', labelKey: 'monthly' },
  { key: 'quarterly', labelKey: 'quarterly' },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function asList<T = any>(v: any): T[] {
  if (Array.isArray(v)) return v as T[];
  if (Array.isArray(v?.data)) return v.data as T[];
  if (Array.isArray(v?.items)) return v.items as T[];
  if (Array.isArray(v?.results)) return v.results as T[];
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

export default function ReportsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fallback?: string) => translate(locale, `reports.${key}`, fallback),
    [locale]
  );
  const { push, ToastContainer } = useToast();

  const [dateRange, setDateRange] = useState<{ startDate: Date | null; endDate: Date | null }>({
    startDate: null,
    endDate: null,
  });
  const [recentExports, setRecentExports] = useState<RecentExport[]>([]);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [lastGenerated, setLastGenerated] = useState<Record<string, string>>({});
  const [openSchedule, setOpenSchedule] = useState<ReportType | null>(null);
  const [scheduleFormat, setScheduleFormat] = useState<ExportFormat>('csv');
  const [scheduleFrequency, setScheduleFrequency] = useState<Frequency>('weekly');
  const [scheduleEmail, setScheduleEmail] = useState('');
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const a = api as any;
        const [exportsRes, scheduledRes] = await Promise.allSettled([
          a.listExports(),
          a.listScheduledReports ? a.listScheduledReports() : Promise.resolve([]),
        ]);
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
    [t]
  );

  useEffect(() => {
    load('initial');
  }, [load]);

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

  const handleGenerate = useCallback(
    async (type: ReportType, format: ExportFormat) => {
      const key = `${type}-${format}`;
      if (generating[key]) return;
      setGenerating((g) => ({ ...g, [key]: true }));
      try {
        const a = api as any;
        const result = await a.exportData({
          type,
          format,
          start_date: dateRange.startDate?.toISOString(),
          end_date: dateRange.endDate?.toISOString(),
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
    [dateRange, generating, push, t]
  );

  const handleSchedule = useCallback(
    async (type: ReportType) => {
      if (!scheduleEmail.trim()) {
        push('warning', t('emailRequired', 'Please enter a recipient email'));
        return;
      }
      setScheduleSubmitting(true);
      try {
        const a = api as any;
        const result = await a.scheduleReport({
          type,
          format: scheduleFormat,
          frequency: scheduleFrequency,
          recipients: [scheduleEmail.trim()],
          start_date: dateRange.startDate?.toISOString(),
          end_date: dateRange.endDate?.toISOString(),
        });
        const newSchedule: ScheduledReport = {
          id: result?.id ? String(result.id) : `local-sched-${Date.now()}`,
          name: result?.name || `${type} — ${scheduleFrequency}`,
          type,
          format: scheduleFormat,
          frequency: scheduleFrequency,
          next_run: result?.next_run || new Date(Date.now() + 7 * 86400000).toISOString(),
          recipients: [scheduleEmail.trim()],
          active: true,
        };
        setScheduledReports((prev) => [newSchedule, ...prev]);
        setOpenSchedule(null);
        setScheduleEmail('');
        push('success', t('scheduled', 'Report scheduled'));
      } catch (err: any) {
        push('error', err?.message || t('scheduleError', 'Failed to schedule report'));
      } finally {
        setScheduleSubmitting(false);
      }
    },
    [dateRange, scheduleEmail, scheduleFormat, scheduleFrequency, push, t]
  );

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

  const handleToggleSchedule = useCallback(
    async (id: string) => {
      setScheduledReports((prev) =>
        prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
      );
    },
    []
  );

  const handleDeleteSchedule = useCallback(
    async (id: string) => {
      const snapshot = scheduledReports;
      setScheduledReports((prev) => prev.filter((s) => s.id !== id));
      try {
        const a = api as any;
        if (a.deleteScheduledReport) await a.deleteScheduledReport(id);
        push('success', t('scheduleRemoved', 'Schedule removed'));
      } catch (err: any) {
        setScheduledReports(snapshot);
        push('error', err?.message || t('scheduleRemoveError', 'Failed to remove schedule'));
      }
    },
    [scheduledReports, push, t]
  );

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton variant="circular" width={40} height={40} />
                  <div className="flex-1 space-y-2">
                    <Skeleton variant="text" width="60%" />
                    <Skeleton variant="text" width="40%" />
                  </div>
                </div>
                <Skeleton variant="text" lines={2} />
                <Skeleton variant="rounded" height={40} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer />
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
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
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={setDateRange}
            placeholder={t('selectRange', 'Select date range')}
          />
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
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
        <Card className="col-span-2 sm:col-span-1">
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
      </div>

      <section aria-labelledby="reports-heading" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2
            id="reports-heading"
            className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <BarChart3 className="h-5 w-5 text-blue-600" aria-hidden="true" />
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
              const isScheduling = openSchedule === r.type;
              return (
                <Card
                  key={r.type}
                  role="listitem"
                  className="flex flex-col"
                >
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
                            leftIcon={
                              isLoading ? undefined : <FIcon className="h-3.5 w-3.5" />
                            }
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
                        onClick={() =>
                          setOpenSchedule((cur) => (cur === r.type ? null : r.type))
                        }
                        leftIcon={<Calendar className="h-4 w-4" />}
                        aria-expanded={isScheduling}
                        aria-controls={`schedule-${r.type}`}
                      >
                        {t('schedule', 'Schedule')}
                      </Button>
                    </div>

                    {isScheduling && (
                      <div
                        id={`schedule-${r.type}`}
                        className="rounded-lg border border-gray-200 dark:border-surface-700 bg-gray-50 dark:bg-surface-800 p-3 space-y-3"
                        role="region"
                        aria-label={t('scheduleReport', 'Schedule report')}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {t('scheduleReport', 'Schedule report')}
                          </p>
                          <button
                            type="button"
                            onClick={() => setOpenSchedule(null)}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-surface-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            aria-label={t('close', 'Close')}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="space-y-1">
                            <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
                              {t('format', 'Format')}
                            </span>
                            <select
                              value={scheduleFormat}
                              onChange={(e) => setScheduleFormat(e.target.value as ExportFormat)}
                              className="w-full h-8 rounded-md border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              {FORMATS.map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
                              {t('frequency', 'Frequency')}
                            </span>
                            <select
                              value={scheduleFrequency}
                              onChange={(e) => setScheduleFrequency(e.target.value as Frequency)}
                              className="w-full h-8 rounded-md border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              {FREQUENCIES.map((f) => (
                                <option key={f.key} value={f.key}>
                                  {t(f.labelKey, f.key)}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label className="block space-y-1">
                          <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
                            {t('emailTo', 'Send to email')}
                          </span>
                          <input
                            type="email"
                            value={scheduleEmail}
                            onChange={(e) => setScheduleEmail(e.target.value)}
                            placeholder="name@company.com"
                            className="w-full h-8 rounded-md border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-2 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            aria-label={t('emailTo', 'Send to email')}
                          />
                        </label>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleSchedule(r.type)}
                          loading={scheduleSubmitting}
                          leftIcon={<Send className="h-3.5 w-3.5" />}
                          fullWidth
                        >
                          {t('confirmSchedule', 'Schedule report')}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

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
    </div>
  );
}
