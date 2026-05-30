'use client';

import { useState, useRef, useEffect } from 'react';

interface Message { role: 'assistant' | 'user'; content: string; timestamp: string; }

export function CopilotPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am your AI recruiting copilot. I can help you:\n\n• Summarize candidates\n• Explain AI evaluation scores\n• Compare applicants\n• Recommend hiring decisions\n• Generate interview questions\n\nWhat would you like help with?', timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: input, timestamp: new Date().toISOString() }]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      const responses: Record<string, string> = {
        candidate: 'Here are the top candidates:\n\n1. Sarah Chen — Staff Engineer (92%)\n   Python, distributed systems expert\n\n2. John Smith — Senior Engineer (87%)\n   Strong PPE performance, solid CS fundamentals',
        rank: 'Ranking combines: Skill Match (35%), Experience (25%), PPE Score (20%), Interview (15%), Culture (5%)',
        risk: 'Potential risks:\n⚠️ Candidate A: Employment gap\n⚠️ Candidate B: Below threshold\n✅ Candidate C: Low risk',
        default: 'I understand. Let me analyze the data and provide insights based on the current recruitment pipeline.',
      };
      const lower = input.toLowerCase();
      let response = responses.default;
      if (lower.includes('candidate')) response = responses.candidate;
      else if (lower.includes('rank')) response = responses.rank;
      else if (lower.includes('risk')) response = responses.risk;
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date().toISOString() }]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl p-4 text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>{msg.content}</div>
          </div>
        ))}
        {isTyping && <div className="flex justify-start"><div className="bg-gray-100 rounded-xl p-4"><div className="flex gap-1"><span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" /><span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}} /><span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}} /></div></div></div>}
        <div ref={endRef} />
      </div>
      <div className="border-t p-4">
        <div className="flex gap-2 mb-2 flex-wrap">
          {['Summarize candidates', 'Explain scores', 'Compare applicants', 'Identify risks'].map((q, i) => (
            <button key={i} onClick={() => setInput(q)} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full">{q}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Ask about candidates, evaluations..." className="flex-1 rounded-lg border px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          <button onClick={handleSend} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Send</button>
        </div>
      </div>
    </div>
  );
}
