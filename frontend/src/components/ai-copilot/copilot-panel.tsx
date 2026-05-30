'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
}

export function CopilotPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am your AI recruiting copilot. I can help you summarize candidates, explain AI scores, compare applicants, and recommend hiring decisions. What would you like help with?', timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const responses: Record<string, string> = {
        default: 'I understand your question. Let me analyze the data and provide insights based on the current recruitment pipeline.',
        candidates: 'Here are the top candidates ranked by AI evaluation scores:\n\n1. Sarah Chen — Staff Engineer (Score: 9.2/10)\n   Strong match in Python, distributed systems.\n\n2. John Smith — Senior Engineer (Score: 8.7/10)\n   Excellent PPE performance. Strong CS fundamentals.',
        rank: 'The AI ranking combines: Skill Match (35%), Experience (25%), PPE Score (20%), Interview Feedback (15%), Cultural Fit (5%).',
        risk: 'Potential hiring risks:\n\n⚠️ Candidate A: Employment gap (6 months)\n⚠️ Candidate B: Below threshold for senior role\n✅ Candidate C: Low risk, consistent progression',
      };
      const lowerInput = input.toLowerCase();
      let response = responses.default;
      if (lowerInput.includes('candidate')) response = responses.candidates;
      else if (lowerInput.includes('rank')) response = responses.rank;
      else if (lowerInput.includes('risk')) response = responses.risk;
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date().toISOString() }]);
      setIsTyping(false);
    }, 1500);
  };

  const quickActions = [
    'Summarize top candidates',
    'Explain AI evaluation scores',
    'Compare top 3 candidates',
    'Identify hiring risks',
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl p-4 text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl p-4 text-sm">
              <div className="flex gap-1">
                <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t p-4">
        <div className="flex gap-2 mb-3">
          {quickActions.map((action, i) => (
            <button key={i} onClick={() => setInput(action)} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full transition">
              {action}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Ask about candidates, evaluations, hiring..." className="flex-1 rounded-lg border px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          <button onClick={handleSend} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Send</button>
        </div>
      </div>
    </div>
  );
}
