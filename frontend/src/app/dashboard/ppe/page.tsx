'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Code2, Play, Sparkles, CheckCircle2, XCircle, Loader2, Lightbulb, Clock, Send, AlertCircle } from 'lucide-react';
import { api } from '@/services/api/client';
import { EmptyState, Button, Skeleton, useToast, Badge } from '@/components';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'cpp', label: 'C++' },
];

const STARTERS: Record<string, string> = {
  python: '# Write your solution here\ndef solution(nums, target):\n    pass\n',
  javascript: '// Write your solution here\nfunction solution(nums, target) {\n}\n',
  typescript: '// Write your solution here\nfunction solution(nums: number[], target: number): number[] {\n  return [];\n}\n',
  java: '// Write your solution here\nclass Solution {\n    public int[] solution(int[] nums, int target) {\n        return new int[0];\n    }\n}\n',
  go: '// Write your solution here\nfunc solution(nums []int, target int) []int {\n  return nil\n}\n',
  cpp: '// Write your solution here\nclass Solution {\npublic:\n    std::vector<int> solution(std::vector<int>& nums, int target) {\n        return {};\n    }\n};\n',
};

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function PPEPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [problems, setProblems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [session, setSession] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [aiFeedback, setAiFeedback] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hinting, setHinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { push, ToastContainer } = useToast();

  useEffect(() => {
    let cancelled = false;
    api.ppe
      .listProblems()
      .then((d: any) => {
        if (cancelled) return;
        const items = Array.isArray(d) ? d : (d?.data || []);
        setProblems(items);
        if (items.length > 0) handleSelectProblem(items[0]);
      })
      .catch((err) => setError(err?.message || t('ppe.couldntLoad', "Couldn't load problems")))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (session?.id) {
      const start = Date.now();
      setStartedAt(start);
      setElapsedMs(0);
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - start), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setStartedAt(null);
      setElapsedMs(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session?.id]);

  const handleSelectProblem = useCallback(
    async (p: any) => {
      setSelected(p);
      setCode(p?.starter_code || STARTERS[language] || '');
      setResult(null);
      setAiFeedback(null);
      setSession(null);
      if (!p?.id) return;
      setStarting(true);
      try {
        const me: any = await api.auth.getMe();
        const s: any = await api.ppe.createSession({
          problem_id: p.id,
          candidate_id: me?.id,
          language,
        } as any);
        setSession(s);
        if (s?.starter_code) setCode(s.starter_code);
      } catch (err: any) {
        push('error', interpolate(t('ppe.sessionFailed', 'Could not start session: {error}'), { error: err?.message || 'unknown' }));
      } finally {
        setStarting(false);
      }
    },
    [language, push, t]
  );

  const handleRun = async () => {
    if (!session?.id) {
      push('error', t('ppe.noActiveSession', 'No active session'));
      return;
    }
    setRunning(true);
    try {
      const r: any = await api.ppe.executeCode(session.id, { code, language });
      setResult(r);
      push('success', t('ppe.executed', 'Code executed'));
    } catch (err: any) {
      push('error', err?.message || t('ppe.executionFailed', 'Execution failed'));
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!session?.id) {
      push('error', t('ppe.noActiveSession', 'No active session'));
      return;
    }
    setSubmitting(true);
    try {
      const r: any = await api.ppe.executeCode(session.id, { code, language, submit: true } as any);
      setResult(r);
      if (r?.feedback || r?.ai_feedback || r?.evaluation) {
        setAiFeedback(r.feedback || r.ai_feedback || r.evaluation);
      }
      push('success', t('ppe.submitted', 'Submitted for AI evaluation'));
    } catch (err: any) {
      push('error', err?.message || t('ppe.submitFailed', 'Submission failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleHint = async () => {
    if (!session?.id) return;
    setHinting(true);
    try {
      const h: any = await api.ppe.requestHint(session.id);
      const text = h?.hint || h?.content || h?.text || t('ppe.defaultHint', 'Consider the time complexity of your approach.');
      push('info', text, 8000);
    } catch (err: any) {
      push('error', err?.message || t('ppe.hintFailed', 'Could not fetch hint'));
    } finally {
      setHinting(false);
    }
  };

  const onLanguageChange = (l: string) => {
    setLanguage(l);
    if (!code || code === STARTERS[language]) setCode(STARTERS[l] || '');
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton variant="text" width="30%" height={32} />
        <Skeleton variant="rounded" height={500} />
      </div>
    );
  }

  const fileExt: Record<string, string> = { python: 'py', javascript: 'js', typescript: 'ts', java: 'java', go: 'go', cpp: 'cpp' };
  const testsPassed = Array.isArray(result?.test_results) ? result.test_results.filter((t: any) => t.passed).length : null;
  const testsTotal = Array.isArray(result?.test_results) ? result.test_results.length : null;

  return (
    <div className="space-y-4" style={{ height: 'calc(100vh - 140px)' }}>
      <ToastContainer />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Code2 className="h-5 w-5 text-blue-600 dark:text-brand-400" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('ppe.title', 'Pair Programming Evaluation')}</h1>
          {startedAt != null && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 ml-2 tabular-nums" aria-label={t('ppe.elapsedAria', 'Elapsed time')}>
              <Clock className="h-3 w-3" aria-hidden="true" /> {formatTime(elapsedMs)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="sr-only" htmlFor="ppe-problem">{t('ppe.selectProblem', 'Select problem…')}</label>
          <select
            id="ppe-problem"
            data-tour="ppe-problem"
            value={selected?.id || ''}
            onChange={(e) => {
              const p = problems.find((x) => x.id === e.target.value);
              if (p) handleSelectProblem(p);
            }}
            className="border border-gray-200 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={starting}
            aria-label={t('ppe.selectProblem', 'Select problem…')}
          >
            <option value="">{t('ppe.selectProblem', 'Select problem…')}</option>
            {problems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} {p.difficulty ? `(${p.difficulty})` : ''}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="ppe-language">{t('ppe.language', 'Language')}</label>
          <select
            id="ppe-language"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="border border-gray-200 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={t('ppe.language', 'Language')}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div role="alert">
          <EmptyState
            icon={<AlertCircle className="h-10 w-10 text-red-500" />}
            title={t('ppe.couldntLoad', "Couldn't load problems")}
            description={error}
            action={<Button variant="primary" onClick={() => window.location.reload()}>{t('common.retry', 'Retry')}</Button>}
          />
        </div>
      )}

      {!error && problems.length === 0 && (
        <EmptyState
          icon={<Code2 className="h-10 w-10" />}
          title={t('ppe.noProblemsTitle', 'No coding problems available')}
          description={t('ppe.noProblemsDesc', "Once an admin adds problems, you'll be able to start a pair-programming session here.")}
        />
      )}

      {!error && problems.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ height: 'calc(100% - 60px)' }}>
          <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4 sm:p-5 overflow-y-auto">
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selected.title}</h3>
                  {selected.difficulty && <Badge variant="warning" size="sm">{selected.difficulty}</Badge>}
                  {starting && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> {t('ppe.startingSession', 'Starting session…')}
                    </span>
                  )}
                  {session && !starting && (
                    <Badge variant="success" size="sm" dot>{t('ppe.sessionLive', 'Session live')}</Badge>
                  )}
                </div>
                {selected.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{selected.description}</p>
                )}
                {selected.examples && Array.isArray(selected.examples) && selected.examples.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">{t('ppe.examples', 'Examples')}</h4>
                    <div className="space-y-2">
                      {selected.examples.map((ex: any, i: number) => (
                        <div key={i} className="p-2.5 bg-gray-50 dark:bg-surface-800 rounded-lg font-mono text-xs">
                          <div><span className="text-gray-500 dark:text-gray-400">{t('ppe.input', 'Input:')}</span> {JSON.stringify(ex.input)}</div>
                          <div><span className="text-gray-500 dark:text-gray-400">{t('ppe.output', 'Output:')}</span> {JSON.stringify(ex.output)}</div>
                          {ex.explanation && <div className="text-gray-500 dark:text-gray-400 mt-1 italic">↳ {ex.explanation}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selected.constraints && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">{t('ppe.constraints', 'Constraints')}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{selected.constraints}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('ppe.selectProblemDesc', 'Select a problem to begin')}</p>
            )}
          </div>

          <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-surface-700 px-4 py-2 bg-gray-50 dark:bg-surface-800">
              <span className="text-sm font-mono font-medium text-gray-700 dark:text-gray-200">
                solution.{fileExt[language] || 'txt'}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleHint}
                  disabled={!session?.id || hinting}
                  leftIcon={hinting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
                  loading={hinting}
                  data-tour="ppe-hint"
                  aria-label={t('ppe.hintAria', 'Request a hint')}
                >
                  {hinting ? t('ppe.fetching', 'Fetching…') : t('ppe.hint', 'Hint')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRun}
                  disabled={!session?.id || running}
                  leftIcon={running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  loading={running}
                  data-tour="ppe-run"
                >
                  {running ? t('ppe.running', 'Running…') : t('ppe.runTests', 'Run tests')}
                </Button>
                <Button
                  variant="success"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!session?.id || submitting}
                  leftIcon={submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  loading={submitting}
                >
                  {submitting ? t('ppe.submitting', 'Submitting…') : t('ppe.submit', 'Submit')}
                </Button>
              </div>
            </div>
            <label className="sr-only" htmlFor="ppe-code">{t('ppe.codeEditorAria', 'Code editor')}</label>
            <textarea
              id="ppe-code"
              data-tour="ppe-editor"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              aria-label={t('ppe.codeEditorAria', 'Code editor')}
              className="flex-1 resize-none bg-gray-900 dark:bg-gray-950 p-4 font-mono text-sm text-green-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              placeholder="# Write your solution here"
            />
            {(result || aiFeedback) && (
              <div className="border-t border-gray-200 dark:border-surface-700 bg-gray-50 dark:bg-surface-800 max-h-56 overflow-y-auto">
                <div className="px-4 py-2 flex items-center justify-between sticky top-0 bg-gray-50 dark:bg-surface-800 border-b border-gray-200 dark:border-surface-700 z-10">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{t('ppe.result', 'Result')}</span>
                  <div className="flex items-center gap-2">
                    {testsPassed != null && testsTotal != null && (
                      <span className="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
                        {interpolate(t('ppe.testsPassed', '{passed} / {total} tests passed'), {
                          passed: String(testsPassed),
                          total: String(testsTotal),
                        })}
                      </span>
                    )}
                    {typeof result?.score === 'number' && (
                      <Badge variant={result.score >= 0.7 ? 'success' : 'warning'} size="sm">
                        {t('ppe.score', 'Score')}: {(result.score * 10).toFixed(1)} / 10
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="px-4 py-2 space-y-1">
                  {Array.isArray(result?.test_results) && result.test_results.map((tr: any, i: number) => (
                    <div key={i} className={`flex items-center gap-2 text-xs ${tr.passed ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                      {tr.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      <span className="font-mono">{interpolate(t('ppe.test', 'Test {n}:'), { n: String(tr.test ?? i + 1) })} {tr.input ?? ''}</span>
                      {!tr.passed && tr.expected !== undefined && (
                        <span className="text-gray-500 dark:text-gray-400">— {t('ppe.expected', 'expected')} {JSON.stringify(tr.expected)}, {t('ppe.got', 'got')} {JSON.stringify(tr.actual)}</span>
                      )}
                    </div>
                  ))}
                  {(result?.feedback || aiFeedback) && (
                    <div className="mt-2 p-2.5 bg-white dark:bg-surface-900 rounded-lg border border-gray-200 dark:border-surface-700 text-xs text-gray-700 dark:text-gray-200">
                      <div className="flex items-center gap-1 font-semibold mb-1 text-purple-700 dark:text-purple-400">
                        <Sparkles className="h-3 w-3" /> {t('ppe.aiFeedback', 'AI feedback')}
                      </div>
                      <div className="whitespace-pre-wrap">{typeof aiFeedback === 'string' ? aiFeedback : (result?.feedback || JSON.stringify(aiFeedback, null, 2))}</div>
                    </div>
                  )}
                  {result?.output && (
                    <pre className="mt-2 p-2.5 bg-gray-900 text-green-400 font-mono text-xs rounded overflow-x-auto" aria-label={t('ppe.outputAria', 'Code output')}>{result.output}</pre>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
