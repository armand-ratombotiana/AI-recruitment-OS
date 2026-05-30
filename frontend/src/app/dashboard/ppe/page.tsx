'use client';
import { useState } from 'react';

const PROBLEMS = [
  { id: 'two-sum', title: 'Two Sum', difficulty: 'easy', description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.', examples: [{ input: 'nums = [2,7,11,15], target = 9', output: '[0,1]' }, { input: 'nums = [3,2,4], target = 6', output: '[1,2]' }], constraints: ['2 <= nums.length <= 10^4', '-10^9 <= nums[i] <= 10^9'], starterCode: { python: 'def two_sum(nums, target):\n    # Your solution here\n    pass\n', javascript: 'function twoSum(nums, target) {\n    // Your solution here\n}\n' } },
  { id: 'lru-cache', title: 'LRU Cache', difficulty: 'hard', description: 'Design a data structure that follows the constraints of a Least Recently Used (LRU) cache.', examples: [{ input: '["LRUCache","put","get"]', output: '[null,null,1]' }], constraints: ['1 <= capacity <= 3000'], starterCode: { python: 'class LRUCache:\n    def __init__(self, capacity: int):\n        pass\n' } },
];

export default function PPEPage() {
  const [problem, setProblem] = useState(PROBLEMS[0]);
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(PROBLEMS[0].starterCode.python);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [agentMessages, setAgentMessages] = useState<any[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'problem' | 'tests' | 'chat'>('problem');
  const [chatInput, setChatInput] = useState('');

  const handleRun = () => {
    setIsRunning(true);
    setTimeout(() => {
      setExecutionResult({
        tests_passed: '3/5', all_tests_passed: false,
        test_results: [
          { test: 1, passed: true, input: '[2,7,11,15], 9', expected: '[0,1]', actual: '[0,1]' },
          { test: 2, passed: true, input: '[3,2,4], 6', expected: '[1,2]', actual: '[1,2]' },
          { test: 3, passed: true, input: '[3,3], 6', expected: '[0,1]', actual: '[0,1]' },
          { test: 4, passed: false, input: '[1,2,3], 4', expected: '[0,2]', actual: '[]' },
          { test: 5, passed: true, input: '[0,4,3,0], 0', expected: '[0,3]', actual: '[0,3]' },
        ],
      });
      setAgentMessages(prev => [...prev, { role: 'agent', content: '3/5 tests pass. Consider edge cases with sequential numbers.' }]);
      setIsRunning(false);
    }, 1500);
  };

  const handleHint = () => {
    if (hintsUsed >= 3) return;
    const hints = ['Have you considered what data structure gives O(1) lookup time?', 'Try using a hash map to track what you have seen.', 'Iterate once while maintaining a mapping of seen values to their indices.'];
    setAgentMessages(prev => [...prev, { role: 'agent', content: `Hint ${hintsUsed + 1}: ${hints[hintsUsed]}` }]);
    setHintsUsed(h => h + 1);
    setActiveTab('chat');
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    setAgentMessages(prev => [...prev, { role: 'candidate', content: chatInput }]);
    setChatInput('');
  };

  return (
    <div className="space-y-4" style={{ height: 'calc(100vh - 140px)' }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pair Programming Evaluation</h1>
          <p className="text-sm text-gray-500">AI-powered technical interview</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">{language}</span>
          <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">{problem.difficulty}</span>
          <span className="text-sm text-gray-500">💡 {3 - hintsUsed} hints</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5" style={{ height: 'calc(100% - 60px)' }}>
        <div className="lg:col-span-2 flex flex-col">
          <div className="flex-1 bg-white rounded-xl border flex flex-col">
            <div className="flex border-b">
              {(['problem', 'tests', 'chat'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  {tab}{tab === 'chat' && agentMessages.length > 0 && <span className="ml-1 px-1.5 text-xs bg-blue-100 text-blue-700 rounded-full">{agentMessages.length}</span>}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'problem' && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">{problem.title}</h3>
                  <p className="text-sm text-gray-600 mb-4">{problem.description}</p>
                  {problem.examples.map((ex, i) => (
                    <div key={i} className="rounded-lg bg-gray-50 p-3 text-sm mb-2">
                      <p><span className="font-medium">Input:</span> {ex.input}</p>
                      <p><span className="font-medium">Output:</span> {ex.output}</p>
                    </div>
                  ))}
                  <div className="mt-3">
                    <p className="text-sm font-medium mb-1">Constraints:</p>
                    {problem.constraints.map((c, i) => <p key={i} className="text-xs text-gray-600">• {c}</p>)}
                  </div>
                </div>
              )}
              {activeTab === 'tests' && executionResult && (
                <div className="space-y-2">
                  <p className="text-sm font-medium mb-3">{executionResult.tests_passed} passed</p>
                  {executionResult.test_results?.map((t: any) => (
                    <div key={t.test} className={`rounded-lg border p-2 text-sm ${t.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                      <span className="font-medium">Test {t.test}</span> {t.passed ? '✓' : '✗'}
                      <p className="text-xs text-gray-500 mt-1">Input: {t.input} | Expected: {t.expected} | Got: {t.actual}</p>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === 'tests' && !executionResult && <p className="text-sm text-gray-500 text-center py-8">Run code to see results</p>}
              {activeTab === 'chat' && (
                <div className="flex flex-col h-full">
                  <div className="flex-1 space-y-3 overflow-y-auto">
                    {agentMessages.length === 0 && <p className="text-sm text-gray-500 text-center py-8">AI messages appear here</p>}
                    {agentMessages.map((msg, i) => (
                      <div key={i} className={`rounded-lg p-3 text-sm ${msg.role === 'agent' ? 'bg-blue-50' : 'bg-gray-100 ml-4'}`}>
                        <p className="font-medium text-xs mb-1">{msg.role === 'agent' ? 'AI Interviewer' : 'You'}</p>
                        <p>{msg.content}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                      placeholder="Ask the AI interviewer..."
                      className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                    <button onClick={handleSendChat} className="rounded-lg bg-blue-600 px-3 py-2 text-white text-sm hover:bg-blue-700">Send</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="flex-1 bg-white rounded-xl border flex flex-col">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-sm font-medium">solution.{language === 'python' ? 'py' : 'js'}</span>
              <div className="flex gap-1">
                {['python', 'javascript'].map(lang => (
                  <button key={lang} onClick={() => { setLanguage(lang); const starter = (problem.starterCode as any)[lang]; if (starter) setCode(starter); }}
                    className={`px-2 py-1 text-xs rounded ${language === lang ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {lang}
                  </button>
                ))}
              </div>
            </div>
            <textarea value={code} onChange={(e) => setCode(e.target.value)}
              className="flex-1 resize-none bg-gray-900 p-4 font-mono text-sm text-green-400 focus:outline-none" spellCheck={false} />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleRun} disabled={isRunning}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              {isRunning ? 'Running...' : '▶ Run Code'}
            </button>
            <button onClick={handleHint} disabled={hintsUsed >= 3}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
              💡 Hint ({3 - hintsUsed})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
