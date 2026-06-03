'use client';

import { useState } from 'react';
import { Play, Loader2, CheckCircle2, XCircle, Sparkles, Lightbulb } from 'lucide-react';
import { api } from '@/services/api/client';
import { useToast } from '@/hooks';

interface PPEEditorProps {
  sessionId?: string;
  problemId?: string;
  initialCode?: string;
  language?: string;
  onCodeChange?: (code: string) => void;
  onExecute?: (code: string, result: any) => void;
}

const FILE_EXT: Record<string, string> = {
  python: 'py',
  javascript: 'js',
  typescript: 'ts',
  java: 'java',
  go: 'go',
  cpp: 'cpp',
  csharp: 'cs',
};

export function PPEEditor({ sessionId, problemId, initialCode = '', language = 'python', onCodeChange, onExecute }: PPEEditorProps) {
  const [code, setCode] = useState(initialCode);
  const [output, setOutput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isHinting, setIsHinting] = useState(false);
  const { push, ToastContainer } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCode(e.target.value);
    onCodeChange?.(e.target.value);
  };

  const handleRun = async () => {
    if (!sessionId) {
      push('error', 'No active PPE session');
      return;
    }
    setIsRunning(true);
    setOutput('');
    setFeedback('');
    setTestResults([]);
    setScore(null);
    try {
      const r: any = await api.submitPPCode(sessionId, { code, language });
      const tests = Array.isArray(r?.test_results) ? r.test_results : [];
      const passed = tests.filter((t: any) => t.passed).length;
      setTestResults(tests);
      setOutput(r?.output || (tests.length ? `${passed}/${tests.length} tests passed` : 'Execution complete'));
      setFeedback(r?.feedback || '');
      if (typeof r?.score === 'number') setScore(r.score);
      onExecute?.(code, r);
      push('success', tests.length ? `${passed}/${tests.length} tests passed` : 'Execution complete');
    } catch (err: any) {
      setOutput(`Error: ${err?.message || 'execution failed'}`);
      push('error', err?.message || 'Execution failed');
    } finally {
      setIsRunning(false);
    }
  };

  const handleHint = async () => {
    if (!sessionId) {
      push('error', 'No active PPE session');
      return;
    }
    setIsHinting(true);
    try {
      const h: any = await api.requestHint(sessionId);
      const text = h?.hint || h?.content || h?.text || 'Consider the time complexity of your approach.';
      push('info', text);
    } catch (err: any) {
      push('error', err?.message || 'Could not get hint');
    } finally {
      setIsHinting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <ToastContainer />
      <div className="flex items-center justify-between border-b px-4 py-2 bg-gray-50">
        <span className="text-sm font-mono font-medium text-gray-700">solution.{FILE_EXT[language] || language || 'txt'}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleHint}
            disabled={!sessionId || isHinting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 border border-amber-200 rounded-lg disabled:opacity-50"
            title="Request an AI hint"
          >
            {isHinting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
            Hint
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={!sessionId || isRunning}
            className="flex items-center gap-2 px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Running…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Run tests
              </>
            )}
          </button>
        </div>
      </div>
      <textarea
        value={code}
        onChange={handleChange}
        className="flex-1 bg-gray-900 text-green-400 font-mono text-sm p-4 resize-none focus:outline-none"
        spellCheck={false}
        placeholder={sessionId ? '# Write your solution here' : '# Create or select a session first'}
      />
      {(output || testResults.length > 0 || feedback || score !== null) && (
        <div className="border-t bg-gray-50 max-h-56 overflow-y-auto">
          <div className="px-4 py-2 bg-gray-100 text-sm font-medium flex items-center gap-2 sticky top-0">
            <span>Output</span>
            {testResults.length > 0 && (
              <span className="text-xs text-gray-500">
                {testResults.filter((t) => t.passed).length}/{testResults.length} tests passed
              </span>
            )}
            {score !== null && (
              <span className="ml-auto text-xs font-bold text-gray-700">
                Score: {(score * 10).toFixed(1)} / 10
              </span>
            )}
          </div>
          {testResults.length > 0 && (
            <div className="px-4 py-2 space-y-1">
              {testResults.map((t, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs ${t.passed ? 'text-green-700' : 'text-red-700'}`}>
                  {t.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  <span className="font-mono">Test {t.test ?? i + 1}: {t.input ?? ''}</span>
                  {!t.passed && t.expected !== undefined && (
                    <span className="text-gray-500">— expected {JSON.stringify(t.expected)}, got {JSON.stringify(t.actual)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {feedback && (
            <div className="px-4 py-2 mx-4 my-2 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-900">
              <div className="flex items-center gap-1 font-semibold mb-1">
                <Sparkles className="h-3 w-3" /> AI feedback
              </div>
              {feedback}
            </div>
          )}
          {output && <pre className="p-4 bg-gray-900 text-green-400 font-mono text-xs">{output}</pre>}
        </div>
      )}
    </div>
  );
}
