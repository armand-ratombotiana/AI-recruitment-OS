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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCode(e.target.value);
    onCodeChange?.(e.target.value);
  };

  const handleRun = () => {
    setIsRunning(true);
    // Simulate execution
    setTimeout(() => {
      setOutput('Hello, World!\nExecution completed successfully.');
      setIsRunning(false);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">solution.{language === 'python' ? 'py' : language === 'javascript' ? 'js' : 'ts'}</span>
        </div>
        <button onClick={handleRun} disabled={isRunning} className="flex items-center gap-2 px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
          {isRunning ? (
            <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Running...</>
          ) : (
            <><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 10.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Run</>
          )}
        </button>
      </div>
      <textarea value={code} onChange={handleChange} className="flex-1 bg-gray-900 text-green-400 font-mono text-sm p-4 resize-none focus:outline-none" spellCheck={false} />
      {output && (
        <div className="border-t">
          <div className="px-4 py-2 bg-gray-100 text-sm font-medium text-gray-700">Output</div>
          <pre className="p-4 bg-gray-900 text-green-400 font-mono text-sm overflow-auto max-h-48">{output}</pre>
        </div>
      )}
    </div>
  );
}
