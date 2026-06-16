'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Code2,
  Play,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Lightbulb,
  Clock,
  AlertCircle,
  FileText,
  History,
  Award,
  RotateCcw,
  RefreshCw,
  Calendar,
  ChevronRight,
  Hash,
  Cpu,
  Activity,
  User,
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
import { useLocaleStore, translate, formatDate, formatRelativeTime } from '@/stores/locale-store';

const FILE_EXT: Record<string, string> = {
  python: 'py',
  javascript: 'js',
  typescript: 'ts',
  java: 'java',
  go: 'go',
  cpp: 'cpp',
  c: 'c',
  rust: 'rs',
};

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'default' | 'danger'> = {
  pending: 'warning',
  active: 'info',
  in_progress: 'info',
  completed: 'success',
  expired: 'default',
  failed: 'danger',
};

const DIFFICULTY_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
};

function formatDuration(ms: number | null | undefined, locale: string): string {
  if (ms == null) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  if (minutes < 60) return locale === 'fr' ? `${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export default function PPESessionDetailPage({ params }: { params: { id: string } }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [session, setSession] = useState<any | null>(null);
  const [problem, setProblem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<any | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data: any = await api.ppe.getSession(params.id);
      const detail = data?.data || data;
      if (!detail || !detail.id) {
        setNotFound(true);
        setSession(null);
        return;
      }
      setSession(detail);
      setCode(detail.code || detail.starter_code || '');

      if (detail.problem_id) {
        try {
          const p: any = await api.ppe.getProblem(detail.problem_id);
          const pDetail = p?.data || p;
          setProblem(pDetail || null);
        } catch {
          setProblem(null);
        }
      }

      try {
        const r: any = await api.ppe.executeCode(detail.id, {
          code: detail.code || detail.starter_code || '',
          language: detail.language,
          run_tests: false,
        });
        if (r && (r.test_results || r.score !== undefined)) {
          setResult(r);
        }
      } catch {
        setResult(null);
      }
    } catch (err) {
      const e = err as APIError;
      if (e?.status === 404) {
        setNotFound(true);
        setSession(null);
      } else {
        setError(e?.message || t('ppeDetail.couldntLoad', "Couldn't load session"));
        setSession(null);
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
    if (session?.status === 'active' || session?.status === 'in_progress' || session?.status === 'pending') {
      const base = session.started_at ? new Date(session.started_at).getTime() : Date.now();
      startedAtRef.current = base;
      setElapsedMs(Date.now() - base);
      timerRef.current = setInterval(() => {
        if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current!);
      }, 1000);
    } else {
      if (session?.submitted_at && session?.started_at) {
        setElapsedMs(new Date(session.submitted_at).getTime() - new Date(session.started_at).getTime());
      }
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session?.status, session?.started_at, session?.submitted_at]);

  const aiFeedback = useMemo(() => {
    if (!session && !result) return null;
    return (
      result?.feedback ||
      result?.ai_feedback ||
      result?.evaluation ||
      session?.feedback ||
      session?.ai_feedback ||
      session?.evaluation ||
      null
    );
  }, [session, result]);

  const aiScore = useMemo(() => {
    if (typeof result?.score === 'number') return result.score;
    if (typeof session?.score === 'number') return session.score;
    return null;
  }, [session, result]);

  const testResults = useMemo(() => {
    const list = result?.test_results || session?.test_results || [];
    return Array.isArray(list) ? list : [];
  }, [session, result]);

  const testsPassed = testResults.filter((t: any) => t.passed).length;
  const testsTotal = testResults.length;

  const durationHistory = useMemo(() => {
    const events: Array<{ label: string; timestamp: string | null; icon: any; color: string }> = [];
    if (session?.created_at) {
      events.push({
        label: t('ppeDetail.created', 'Session created'),
        timestamp: session.created_at,
        icon: Hash,
        color: 'text-gray-500 dark:text-gray-400',
      });
    }
    if (session?.started_at) {
      events.push({
        label: t('ppeDetail.started', 'Started'),
        timestamp: session.started_at,
        icon: Play,
        color: 'text-blue-500 dark:text-blue-400',
      });
    }
    if (session?.submitted_at) {
      events.push({
        label: t('ppeDetail.submittedAt', 'Submitted'),
        timestamp: session.submitted_at,
        icon: Send,
        color: 'text-purple-500 dark:text-purple-400',
      });
    }
    if (session?.completed_at) {
      events.push({
        label: t('ppeDetail.completed', 'Completed'),
        timestamp: session.completed_at,
        icon: CheckCircle2,
        color: 'text-green-500 dark:text-green-400',
      });
    }
    return events;
  }, [session, t]);

  const handleStart = async () => {
    if (!session?.id) return;
    setActionLoading('start');
    try {
      push('info', t('ppeDetail.startSoon', 'Use the editor to begin coding.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = () => {
    push('info', t('ppeDetail.resumeSoon', 'Resume is available in the main editor.'));
  };

  const handleSubmit = async () => {
    if (!session?.id) return;
    setActionLoading('submit');
    try {
      const r: any = await api.ppe.executeCode(session.id, {
        code,
        language: session.language,
        run_tests: true,
      });
      setResult(r);
      push('success', t('ppeDetail.submitted', 'Submitted for AI evaluation'));
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('ppeDetail.submitFailed', 'Submission failed'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleHint = async () => {
    if (!session?.id) return;
    setActionLoading('hint');
    try {
      const h: any = await api.ppe.requestHint(session.id);
      const text = h?.hint || h?.content || h?.text || t('ppeDetail.defaultHint', 'Consider the time complexity of your approach.');
      push('info', text, 8000);
    } catch (err) {
      const e = err as APIError;
      push('error', e?.message || t('ppeDetail.hintFailed', 'Could not fetch hint'));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
<Skeleton height={20} width={200} />
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-5">
              <Skeleton variant="circular" width={64} height={64} />
              <div className="flex-1 space-y-3">
                <Skeleton height={28} width="55%" />
                <Skeleton height={16} width="35%" />
                <div className="flex gap-2">
                  <Skeleton height={24} width={80} />
                  <Skeleton height={24} width={100} />
                </div>
              </div>
              <div className="space-y-2 w-full sm:w-44">
                <Skeleton height={36} />
                <Skeleton height={36} />
                <Skeleton height={36} />
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton height={420} />
          <Skeleton height={420} />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-6">
<Breadcrumb />
        <Link
          href="/dashboard/ppe"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          aria-label={t('ppeDetail.backToPpe', 'Back to pair programming')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('ppeDetail.backToPpe', 'Back to pair programming')}
        </Link>
        <EmptyState
          icon={<Code2 className="h-12 w-12" />}
          title={t('ppeDetail.notFound', 'Session not found')}
          description={t('ppeDetail.notFoundDesc', "The pair-programming session you're looking for doesn't exist or has been removed.")}
          action={
            <Link href="/dashboard/ppe">
              <Button variant="primary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                {t('ppeDetail.backToPpe', 'Back to pair programming')}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="space-y-6">
<Breadcrumb />
        <Link
          href="/dashboard/ppe"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          aria-label={t('ppeDetail.backToPpe', 'Back to pair programming')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('ppeDetail.backToPpe', 'Back to pair programming')}
        </Link>
        <Card>
          <CardContent className="p-0">
            <ErrorState
              title={t('ppeDetail.couldntLoad', "Couldn't load session")}
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

  if (!session) return null;

  const status = (session.status || 'pending').toLowerCase();
  const isActive = status === 'active' || status === 'in_progress' || status === 'pending';
  const isCompleted = status === 'completed' || status === 'expired';
  const fileExt = FILE_EXT[(session.language || '').toLowerCase()] || 'txt';
  const problemTitle = problem?.title || t('ppeDetail.unknownProblem', 'Unknown problem');
  const aiScorePercent = aiScore !== null ? Math.round(aiScore * (aiScore > 1 ? 1 : 100)) : null;
  const difficulty = (problem?.difficulty || '').toLowerCase();
  const languageLabel = (session.language || '').charAt(0).toUpperCase() + (session.language || '').slice(1);

  return (
    <div className="space-y-6">
<Breadcrumb />

      <Link
        href="/dashboard/ppe"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        aria-label={t('ppeDetail.backToPpe', 'Back to pair programming')}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('ppeDetail.backToPpe', 'Back to pair programming')}
      </Link>

      <Card>
        <CardContent className="p-6">
          <header className="flex flex-col lg:flex-row gap-5 items-start lg:items-center">
            <div
              className="h-16 w-16 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center text-white shrink-0 ring-4 ring-blue-100 dark:ring-blue-500/20"
              aria-hidden="true"
            >
              <Code2 className="h-8 w-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words">
                {problemTitle}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <span className="inline-flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="font-mono text-xs">{session.id.slice(0, 12)}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
                  {languageLabel}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <time dateTime={session.created_at}>
                    {session.created_at ? formatRelativeTime(session.created_at, locale) : '—'}
                  </time>
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANT[status] || 'default'} dot>
                  {status.replace('_', ' ')}
                </Badge>
                {difficulty && (
                  <Badge variant={DIFFICULTY_VARIANT[difficulty] || 'default'} size="sm">
                    {difficulty}
                  </Badge>
                )}
                {aiScorePercent !== null && (
                  <Badge variant="purple">
                    <Sparkles className="h-3 w-3 mr-0.5" aria-hidden="true" />
                    {t('ppeDetail.score', 'Score')} {aiScorePercent}/100
                  </Badge>
                )}
                {isActive && (
                  <span
                    className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 tabular-nums"
                    aria-label={t('ppeDetail.elapsed', 'Elapsed time')}
                  >
                    <Activity className="h-3 w-3" aria-hidden="true" />
                    {formatDuration(elapsedMs, locale)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 w-full lg:w-auto lg:flex-col lg:items-stretch">
              {isActive && status === 'pending' && (
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Play className="h-4 w-4" />}
                  onClick={handleStart}
                  loading={actionLoading === 'start'}
                  aria-label={t('ppeDetail.start', 'Start session')}
                >
                  {t('ppeDetail.start', 'Start')}
                </Button>
              )}
              {isActive && status !== 'pending' && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<RotateCcw className="h-4 w-4" />}
                  onClick={handleResume}
                  aria-label={t('ppeDetail.resume', 'Resume session')}
                >
                  {t('ppeDetail.resume', 'Resume')}
                </Button>
              )}
              {isActive && (
                <Button
                  variant="success"
                  size="sm"
                  leftIcon={actionLoading === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  onClick={handleSubmit}
                  loading={actionLoading === 'submit'}
                  aria-label={t('ppeDetail.submit', 'Submit solution')}
                >
                  {actionLoading === 'submit' ? t('ppeDetail.submitting', 'Submitting…') : t('ppeDetail.submit', 'Submit')}
                </Button>
              )}
              {isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={actionLoading === 'hint' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
                  onClick={handleHint}
                  loading={actionLoading === 'hint'}
                  aria-label={t('ppeDetail.requestHint', 'Request a hint')}
                >
                  {t('ppeDetail.hint', 'Hint')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                onClick={load}
                aria-label={t('ppeDetail.refresh', 'Refresh session')}
              >
                {t('ppeDetail.refresh', 'Refresh')}
              </Button>
            </div>
          </header>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {problem && (
            <section aria-labelledby="problem-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2
                      id="problem-section-title"
                      className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      {t('ppeDetail.problem', 'Problem')}
                    </h2>
                    {problem.difficulty && (
                      <Badge variant={DIFFICULTY_VARIANT[(problem.difficulty || '').toLowerCase()] || 'default'} size="sm">
                        {problem.difficulty}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{problem.title}</h3>
                  {problem.description && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {problem.description}
                    </p>
                  )}
                  {Array.isArray(problem.tags) && problem.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {problem.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-md text-xs bg-gray-100 text-gray-700 font-medium dark:bg-surface-800 dark:text-gray-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          <section aria-labelledby="code-section-title">
            <Card>
              <CardContent className="p-0 overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-gray-200 dark:border-surface-700 px-4 py-2 bg-gray-50 dark:bg-surface-800">
                  <div className="flex items-center gap-2 text-sm font-mono font-medium text-gray-700 dark:text-gray-200">
                    <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>solution.{fileExt}</span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {t('ppeDetail.readOnly', 'Read-only')}
                  </span>
                </div>
                <label htmlFor="ppe-code" className="sr-only">
                  {t('ppeDetail.codeAria', 'Submitted code')}
                </label>
                <textarea
                  id="ppe-code"
                  readOnly
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  spellCheck={false}
                  aria-label={t('ppeDetail.codeAria', 'Submitted code')}
                  className="block w-full bg-gray-900 dark:bg-gray-950 p-4 font-mono text-sm text-green-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-none"
                  style={{ minHeight: '320px' }}
                />
              </CardContent>
            </Card>
          </section>

          {testResults.length > 0 && (
            <section aria-labelledby="tests-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2
                      id="tests-section-title"
                      className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      {t('ppeDetail.testResults', 'Test results')}
                    </h2>
                    <span
                      className="ml-auto text-xs text-gray-500 dark:text-gray-400"
                      aria-live="polite"
                    >
                      {testsPassed} / {testsTotal} {t('ppeDetail.passed', 'passed')}
                    </span>
                  </div>
                  <ul className="space-y-1.5" role="list">
                    {testResults.map((tr: any, i: number) => (
                      <li
                        key={tr.test_id || i}
                        className={`flex items-start gap-2 text-xs p-2 rounded-md ${
                          tr.passed
                            ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300'
                            : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {tr.passed ? (
                          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-mono font-medium">
                            {t('ppeDetail.test', 'Test')} {tr.test_id || i + 1}
                            {typeof tr.runtime_ms === 'number' && (
                              <span className="ml-2 text-gray-500 dark:text-gray-400">
                                ({tr.runtime_ms}ms)
                              </span>
                            )}
                          </p>
                          {tr.error && (
                            <p className="mt-1 text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap break-words">
                              {tr.error}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="ai-section-title">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden="true" />
                  <h2
                    id="ai-section-title"
                    className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    {t('ppeDetail.aiEvaluation', 'AI evaluation')}
                  </h2>
                </div>
                {aiScorePercent !== null ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-gray-900 dark:text-white">
                        {aiScorePercent}
                      </span>
                      <span className="text-lg text-gray-500 dark:text-gray-400">/ 100</span>
                    </div>
                    <div
                      className="mt-3 w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={aiScorePercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t('ppeDetail.scoreAria', 'AI score progress')}
                    >
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, aiScorePercent))}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {t('ppeDetail.noScore', 'No AI score yet. Submit your solution to receive one.')}
                  </p>
                )}
                {aiFeedback ? (
                  <p className="mt-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {typeof aiFeedback === 'string' ? aiFeedback : JSON.stringify(aiFeedback, null, 2)}
                  </p>
                ) : (
                  aiScorePercent !== null && (
                    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 italic">
                      {t('ppeDetail.noFeedback', 'No qualitative feedback was provided.')}
                    </p>
                  )
                )}
              </CardContent>
            </Card>
          </section>

          {durationHistory.length > 0 && (
            <section aria-labelledby="history-section-title">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <History className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    <h2
                      id="history-section-title"
                      className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                    >
                      {t('ppeDetail.durationHistory', 'Duration & history')}
                    </h2>
                  </div>
                  <ol className="space-y-3" role="list">
                    {durationHistory.map((ev, i) => {
                      const Icon = ev.icon;
                      return (
                        <li key={`${ev.label}-${i}`} className="flex items-start gap-3 text-sm">
                          <div
                            className="h-7 w-7 rounded-full bg-gray-100 dark:bg-surface-800 flex items-center justify-center shrink-0"
                            aria-hidden="true"
                          >
                            <Icon className={`h-3.5 w-3.5 ${ev.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white">{ev.label}</p>
                            {ev.timestamp && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                <time dateTime={ev.timestamp}>
                                  {formatDate(ev.timestamp, locale, {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })}
                                </time>
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                    {session?.started_at && session?.submitted_at && (
                      <li className="flex items-start gap-3 text-sm pt-3 border-t border-gray-200 dark:border-surface-700">
                        <div
                          className="h-7 w-7 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0"
                          aria-hidden="true"
                        >
                          <Award className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {t('ppeDetail.totalDuration', 'Total duration')}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                            {formatDuration(
                              new Date(session.submitted_at).getTime() -
                                new Date(session.started_at).getTime(),
                              locale
                            )}
                          </p>
                        </div>
                      </li>
                    )}
                  </ol>
                </CardContent>
              </Card>
            </section>
          )}

          <Card>
            <CardContent className="p-4 text-xs text-gray-500 dark:text-gray-400 space-y-1.5">
              <p className="flex items-center gap-1.5">
                <User className="h-3 w-3" aria-hidden="true" />
                {t('ppeDetail.candidate', 'Candidate')}:{' '}
                <span className="font-mono text-[10px] text-gray-700 dark:text-gray-300">
                  {session.candidate_id?.slice(0, 12) || '—'}
                </span>
              </p>
              {session.created_at && (
                <p className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  {t('ppeDetail.createdOn', 'Created on')}{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {formatDate(session.created_at, locale)}
                  </span>
                </p>
              )}
              {typeof session.hints_used === 'number' && (
                <p className="flex items-center gap-1.5">
                  <Lightbulb className="h-3 w-3" aria-hidden="true" />
                  {t('ppeDetail.hintsUsed', 'Hints used')}:{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {session.hints_used}
                  </span>
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
