'use client';

import { useState } from 'react';

interface PPEEditorProps {
  initialCode?: string;
  language?: string;
  onCodeChange?: (code: string) => void;
  onExecute?: (code: string) => void;
}

export function PPEEditor({ initialCode = '', language = 'python', onCodeChange, onExecute }: PPEEditorProps) {
  const [code, setCode] = useState(initialCode);
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCode(e.target.value);
    onCodeChange?.(e.target.value);
  };

  const handleRun = async () => {
    setIsRunning(true);
    onExecute?.(code);
    setTimeout(() => {
      setOutput('Execution completed successfully.');
      setTestResults([
        { test: 1, passed: true, input: '[2,7,11,15], 9', expected: '[0,1]' },
        { test: 2, passed: true, input: '[3,2,4], 6', expected: '[1,2]' },
        { test: 3, passed: false, input: '[1,2,3], 4', expected: '[0,2]', actual: '[]' },
      ]);
      setIsRunning(false);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-medium">solution.{language === 'python' ? 'py' : language === 'javascript' ? 'js' : language === 'java' ? 'java' : language === 'go' ? 'go' : language === 'cpp' ? 'cpp' : 'ts'}</span>
        <button onClick={handleRun} disabled={isRunning} className="flex items-center gap-2 px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
          {isRunning ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Running...</> : <>▶ Run</>}
        </button>
      </div>
      <textarea value={code} onChange={handleChange} className="flex-1 bg-gray-900 text-green-400 font-mono text-sm p-4 resize-none focus:outline-none" spellCheck={false} />
      {(output || testResults.length > 0) && (
        <div className="border-t">
          <div className="px-4 py-2 bg-gray-100 text-sm font-medium flex items-center gap-2">
            <span>Output</span>
            {testResults.length > 0 && <span className="text-xs text-gray-500">{testResults.filter(t => t.passed).length}/{testResults.length} tests passed</span>}
          </div>
          {testResults.length > 0 && (
            <div className="px-4 py-2 space-y-1 max-h-32 overflow-y-auto">
              {testResults.map((t, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs ${t.passed ? 'text-green-600' : 'text-red-600'}`}>
                  {t.passed ? '✓' : '✗'} Test {t.test}: {t.input} → {t.passed ? t.expected : `Expected ${t.expected}, got ${t.actual}`}
                </div>
              ))}
            </div>
          )}
          {output && <pre className="p-4 bg-gray-900 text-green-400 font-mono text-sm">{output}</pre>}
        </div>
      )}
    </div>
  );
}
