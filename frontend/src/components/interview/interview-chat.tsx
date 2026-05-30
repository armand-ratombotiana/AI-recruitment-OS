'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  role: 'interviewer' | 'candidate';
  content: string;
  timestamp: string;
}

export function InterviewChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'interviewer', content: 'Welcome to your technical interview! I will be asking you questions about system design and coding. Feel free to think out loud.', timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: 'candidate', content: input, timestamp: new Date().toISOString() }]);
    setInput('');
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'interviewer', content: 'Thank you for your response. Let me ask a follow-up question about your approach.', timestamp: new Date().toISOString() }]);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'candidate' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl p-4 text-sm ${msg.role === 'interviewer' ? 'bg-blue-50 text-blue-900' : 'bg-gray-100 text-gray-900'}`}>
              <p className="text-xs font-medium mb-1 opacity-60">{msg.role === 'interviewer' ? 'AI Interviewer' : 'You'}</p>
              <p>{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t p-4">
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Type your response..." className="flex-1 rounded-lg border px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          <button onClick={handleSend} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Send</button>
        </div>
      </div>
    </div>
  );
}
