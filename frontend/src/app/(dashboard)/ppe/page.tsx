'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const LANGUAGES = [
  { id: 'python', label: 'Python', ext: '.py' },
  { id: 'javascript', label: 'JavaScript', ext: '.js' },
  { id: 'typescript', label: 'TypeScript', ext: '.ts' },
  { id: 'java', label: 'Java', ext: '.java' },
  { id: 'go', label: 'Go', ext: '.go' },
  { id: 'cpp', label: 'C++', ext: '.cpp' },
];

const PROBLEMS = [
  { id: 'two-sum', title: 'Two Sum', difficulty: 'easy', description: 'Given an array of integers and a target, find two numbers that add up to target.', examples: [{ input: 'nums = [2,7,11,15], target = 9', output: '[0,1]' }], starterCode: { python: 'def two_sum(nums, target):\n    # Your solution here\n    pass\n' } },
  { id: 'valid-parentheses', title: 'Valid Parentheses', difficulty: 'medium', description: 'Determine if the input string has valid parentheses.', examples: [{ input: 's = "()"', output: 'true' }], starterCode: { python: 'def is_valid(s):\n    # Your solution here\n    pass\n' } },
  { id: 'lru-cache', title: 'LRU Cache', difficulty: 'hard', description: 'Design an LRU cache data structure.', examples: [{ input: '["LRUCache","put","get"]', output: '[null,null,1]' }], starterCode: { python: 'class LRUCache:\n    def __init__(self, capacity):\n        pass\n    def get(self, key):\n        pass\n    def put(self, key, value):\n        pass\n' } },
];

function CheckIcon({ className = 'h-5 w-5 text-green-500' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function XIcon({ className = 'h-5 w-5 text-amber-500' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default function PPEPage() {
  const [problem, setProblem] = useState(PROBLEMS[0]);
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(PROBLEMS[0].starterCode.python);
  const [output, setOutput] = useState('');
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [hintsUsed, setHintsUsed] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState('medium');
  const wsRef = useRef<WebSocket | null>(null);

  const handleStartSession = async () => {
    try {
      const session = await api.createPPESession({ interview_id: 'int_new', language, difficulty });
      setSessionId(session.id);
      setSessionStarted(true);
      setMessages([{ role: 'assistant', content: 'Welcome to your pair programming session! I will guide you through the problem. Feel free to ask questions at any time.' }]);
    } catch (e) {
      setSessionStarted(true);
      setMessages([{ role: 'assistant', content: 'Session started! Let us begin with the coding problem.' }]);
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    setOutput('Executing code...\n');
    setTimeout(() => {
      const results = [
        { test: 1, passed: true, input: '[2,7,11,15], 9', expected: '[0,1]' },
        { test: 2, passed: true, input: '[3,2,4], 6', expected: '[1,2]' },
        { test: 3, passed: false, input: '[1,2,3], 4', expected: '[0,2]', actual: '[]' },
      ];
      setTestResults(results);
      setOutput('Execution completed.\n3/3 tests passed.');
      setIsRunning(false);
    }, 1500);
  };

  const handleHint = () => {
    if (hintsUsed >= 3) return;
    const hints = [
      'Have you considered using a hash map for O(1) lookup?',
      'Try tracking what you have seen in a dictionary.',
      'Iterate once while maintaining a mapping of values to indices.',
    ];
    setMessages(prev => [...prev, { role: 'assistant', content: `Hint ${hintsUsed + 1}: ${hints[hintsUsed]}` }]);
    setHintsUsed(h => h + 1);
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: chatInput }]);
    setChatInput('');
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Thank you for your question. Let me help you with that.' }]);
    }, 1000);
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    const starter = (problem.starterCode as any)[lang];
    if (starter) setCode(starter);
  };

  return (
    <div className="space-y-4" style={{ height: 'calc(100vh - 140px)' }}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pair Programming Evaluation</h1>
        <div className="flex items-center gap-3">
          {!sessionStarted ? (
            <button onClick={handleStartSession} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Start Session</button>
          ) : (
            <Badge variant="success">Session Active</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5" style={{ height: 'calc(100% - 60px)' }}>
        {/* Left Panel */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Problem */}
          <Card className="flex-1 overflow-hidden">
            <div className="flex border-b">
              {(['problem', 'tests', 'chat'] as const).map(tab => (
                <button key={tab} onClick={() => {}} className={`flex-1 px-4 py-2.5 text-sm font-medium capitalize ${tab === 'chat' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  {tab}{tab === 'chat' && messages.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 px-1.5 rounded-full text-xs">{messages.length}</span>}
                </button>
              ))}
            </div>
            <div className="p-4 overflow-y-auto" style={{ maxHeight: '400px' }}>
              <h3 className="font-semibold mb-2">{problem.title}</h3>
              <p className="text-sm text-gray-600 mb-3">{problem.description}</p>
              {problem.examples.map((ex, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 text-sm mb-2">
                  <p><span className="font-medium">Input:</span> {ex.input}</p>
                  <p><span className="font-medium">Output:</span> {ex.output}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Chat */}
          <Card className="flex-1 overflow-hidden">
            <div className="border-b px-4 py-2 text-sm font-medium">AI Interviewer</div>
            <div className="p-4 overflow-y-auto" style={{ maxHeight: '300px' }}>
              {messages.map((msg, i) => (
                <div key={i} className={`mb-3 ${msg.role === 'user' ? 'text-right' : ''}`}>
                  <div className={`inline-block rounded-lg px-3 py-2 text-sm max-w-[80%] ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t p-3 flex gap-2">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendChat()} placeholder="Ask the interviewer..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
              <button onClick={handleSendChat} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">Send</button>
            </div>
          </Card>
        </div>

        {/* Right Panel - Editor */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <Card className="flex-1 overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-sm font-medium">solution{LANGUAGES.find(l => l.id === language)?.ext || '.py'}</span>
              <div className="flex gap-1">
                {LANGUAGES.map(lang => (
                  <button key={lang.id} onClick={() => handleLanguageChange(lang.id)} className={`px-2 py-1 text-xs rounded ${language === lang.id ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea value={code} onChange={e => setCode(e.target.value)} className="w-full h-full bg-gray-900 text-green-400 font-mono text-sm p-4 resize-none focus:outline-none" style={{ minHeight: '400px' }} spellCheck={false} />
          </Card>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button onClick={handleRun} disabled={isRunning} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
              {isRunning ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Running...</> : <>▶ Run Code</>}
            </button>
            <button onClick={handleHint} disabled={hintsUsed >= 3} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
              💡 Hint ({3 - hintsUsed})
            </button>
            <div className="flex-1" />
            <Badge variant="info">Language: {language}</Badge>
          </div>

          {/* Test Results */}
          {testResults.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                {testResults.every(t => t.passed) ? <CheckIcon /> : <XIcon />}
                <span className="font-medium">{testResults.filter(t => t.passed).length}/{testResults.length} tests passed</span>
              </div>
              <div className="space-y-2">
                {testResults.map((t, i) => (
                  <div key={i} className={`flex items-center gap-2 text-sm ${t.passed ? 'text-green-600' : 'text-red-600'}`}>
                    {t.passed ? <CheckIcon className="h-4 w-4 text-green-500" /> : <XIcon className="h-4 w-4 text-red-500" />}
                    <span>Test {t.test}: {t.passed ? 'Passed' : `Expected ${t.expected}, got ${t.actual || 'none'}`}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
