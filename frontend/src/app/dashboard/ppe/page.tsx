'use client';

import { useState, useEffect } from 'react';
import { Code2, Play, Sparkles, CheckCircle2, XCircle, Loader2, Lightbulb } from 'lucide-react';
import { api } from '@/services/api/client';
import { EmptyState, Button, Skeleton, useToast, Badge } from '@/components';

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
];

const STARTERS: Record<string, string> = {
  python: '# Write your solution here\ndef solution(nums, target):\n    pass\n',
  javascript: '// Write your solution here\nfunction solution(nums, target) {\n}\n',
  typescript: '// Write your solution here\nfunction solution(nums: number[], target: number): number[] {\n  return [];\n}\n',
  java: '// Write your solution here\nclass Solution {\n    public int[] solution(int[] nums, int target) {\n        return new int[0];\n    }\n}\n',
  go: '// Write your solution here\nfunc solution(nums []int, target int) []int {\n  return nil\n}\n',
};

export default function PPEPage() {
  const [problems, setProblems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [session, setSession] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [hinting, setHinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push, ToastContainer } = useToast();

  useEffect(() => {
    let cancelled = false;
    api.listPPEProblems()
      .then((d) => {
        if (cancelled) return;
        const items = Array.isArray(d) ? d : (d?.data || []);
        setProblems(items);
        if (items.length > 0) handleSelectProblem(items[0]);
      })
      .catch((err) => setError(err?.message || 'Failed to load problems'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSelectProblem = async (p: any) => {
    setSelected(p);
    setCode(p.starter_code || STARTERS[language] || '');
    setResult(null);
    setSession(null);
    if (!p.id) return;
    setStarting(true);
    try {
      const s = await api.createPPESession({ problem_id: p.id, language });
      setSession(s);
      if (s.starter_code) setCode(s.starter_code);
    } catch (err: any) {
      push('error', `Could not start session: ${err?.message || 'unknown'}`);
    } finally {
      setStarting(false);
    }
  };

  const handleRun = async () => {
    if (!session?.id) {
      push('error', 'No active session');
      return;
    }
    setRunning(true);
    try {
      const r = await api.submitPPCode(session.id, { code, language });
      setResult(r);
      push('success', 'Code executed');
    } catch (err: any) {
      push('error', err?.message || 'Execution failed');
    } finally {
      setRunning(false);
    }
  };

  const handleHint = async () => {
    if (!session?.id) return;
    setHinting(true);
    try {
      const h: any = await api.requestHint(session.id);
      const text = h?.hint || h?.content || h?.text || 'Consider the time complexity of your approach.';
      push('info', text);
    } catch (err: any) {
      push('error', err?.message || 'Could not fetch hint');
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
      <div className="space-y-4">
        <Skeleton variant="text" width="30%" height={32} />
        <Skeleton variant="rounded" height={500} />
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ height: 'calc(100vh - 140px)' }}>
      <ToastContainer />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Code2 className="h-5 w-5 text-blue-600" />
          <h1 className="text-2xl font-bold">Pair Programming Evaluation</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selected?.id || ''}
            onChange={(e) => {
              const p = problems.find((x) => x.id === e.target.value);
              if (p) handleSelectProblem(p);
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={starting}
          >
            <option value="">Select problem…</option>
            {problems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} {p.difficulty ? `(${p.difficulty})` : ''}
              </option>
            ))}
          </select>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <EmptyState
          icon={<Code2 className="h-10 w-10" />}
          title="Couldn’t load problems"
          description={error}
          action={<Button variant="primary" onClick={() => window.location.reload()}>Retry</Button>}
        />
      )}

      {!error && problems.length === 0 && (
        <EmptyState
          icon={<Code2 className="h-10 w-10" />}
          title="No coding problems available"
          description="Once an admin adds problems, you'll be able to start a pair-programming session here."
        />
      )}

      {!error && problems.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ height: 'calc(100% - 60px)' }}>
          <div className="bg-white rounded-xl border border-gray-200 p-5 overflow-y-auto">
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-semibold">{selected.title}</h3>
                  {selected.difficulty && <Badge variant="warning" size="sm">{selected.difficulty}</Badge>}
                  {starting && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Loader2 className="h-3 w-3 animate-spin" /> Starting session…
                    </span>
                  )}
                  {session && !starting && (
                    <Badge variant="success" size="sm">Session live</Badge>
                  )}
                </div>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{selected.description}</p>
                {selected.examples && Array.isArray(selected.examples) && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Examples</h4>
                    <div className="space-y-2">
                      {selected.examples.map((ex: any, i: number) => (
                        <div key={i} className="p-2.5 bg-gray-50 rounded-lg font-mono text-xs">
                          <div><span className="text-gray-500">Input:</span> {JSON.stringify(ex.input)}</div>
                          <div><span className="text-gray-500">Output:</span> {JSON.stringify(ex.output)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selected.constraints && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Constraints</h4>
                    <p className="text-xs text-gray-600 whitespace-pre-wrap">{selected.constraints}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Select a problem to begin</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 bg-gray-50">
              <span className="text-sm font-mono font-medium text-gray-700">
                solution.{language === 'python' ? 'py' : language === 'javascript' ? 'js' : language === 'typescript' ? 'ts' : language === 'java' ? 'java' : language === 'go' ? 'go' : 'txt'}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleHint}
                  disabled={!session?.id || hinting}
                  leftIcon={hinting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
                >
                  {hinting ? 'Fetching…' : 'Hint'}
                </Button>
                <Button
                  variant="success"
                  size="sm"
                  onClick={handleRun}
                  disabled={!session?.id || running}
                  leftIcon={running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                >
                  {running ? 'Running…' : 'Run tests'}
                </Button>
              </div>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 resize-none bg-gray-900 p-4 font-mono text-sm text-green-400 focus:outline-none"
              placeholder="# Write your solution here"
              spellCheck={false}
            />
            {result && (
              <div className="border-t border-gray-200 bg-gray-50 max-h-48 overflow-y-auto">
                <div className="px-4 py-2 flex items-center justify-between sticky top-0 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-700">Result</span>
                  {Array.isArray(result.test_results) && (
                    <span className="text-xs text-gray-500">
                      {result.test_results.filter((t: any) => t.passed).length} / {result.test_results.length} tests passed
                    </span>
                  )}
                  {typeof result.score === 'number' && (
                    <Badge variant={result.score >= 0.7 ? 'success' : 'warning'} size="sm">
                      Score: {(result.score * 10).toFixed(1)} / 10
                    </Badge>
                  )}
                </div>
                <div className="px-4 py-2 space-y-1">
                  {Array.isArray(result.test_results) && result.test_results.map((t: any, i: number) => (
                    <div key={i} className={`flex items-center gap-2 text-xs ${t.passed ? 'text-green-700' : 'text-red-700'}`}>
                      {t.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      <span className="font-mono">Test {t.test ?? i + 1}: {t.input ?? ''}</span>
                      {!t.passed && t.expected !== undefined && (
                        <span className="text-gray-500">— expected {JSON.stringify(t.expected)}, got {JSON.stringify(t.actual)}</span>
                      )}
                    </div>
                  ))}
                  {result.feedback && (
                    <div className="mt-2 p-2.5 bg-white rounded-lg border border-gray-200 text-xs text-gray-700">
                      <div className="flex items-center gap-1 font-semibold mb-1 text-purple-700">
                        <Sparkles className="h-3 w-3" /> AI feedback
                      </div>
                      {result.feedback}
                    </div>
                  )}
                  {result.output && (
                    <pre className="mt-2 p-2.5 bg-gray-900 text-green-400 font-mono text-xs rounded">{result.output}</pre>
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
