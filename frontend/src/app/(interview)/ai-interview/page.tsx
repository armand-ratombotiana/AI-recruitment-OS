'use client';
import { useState } from 'react';

interface Message {
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
}

export default function AICopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am your AI recruiting copilot. I can help you:\n\n• Summarize candidate profiles\n• Explain AI evaluation scores\n• Compare candidates side-by-side\n• Generate interview questions\n• Identify hiring risks\n• Recommend next steps\n\nWhat would you like help with?', timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const lowerInput = input.toLowerCase();
      let response = 'I understand your question. Let me analyze the data and provide insights.';
      if (lowerInput.includes('candidate')) {
        response = 'Here are the top candidates ranked by AI evaluation scores:\n\n1. Sarah Chen — Staff Engineer (Score: 9.2/10)\n   Strong match in Python, distributed systems.\n\n2. John Smith — Senior Engineer (Score: 8.7/10)\n   Excellent PPE performance.\n\n3. Emily Davis — Senior Engineer (Score: 8.3/10)\n   Good cultural fit.';
      } else if (lowerInput.includes('rank')) {
        response = 'The AI ranking is based on:\n\n• Skill Match (35%)\n• Experience (25%)\n• PPE Score (20%)\n• Interview Feedback (15%)\n• Cultural Fit (5%)';
      } else if (lowerInput.includes('risk')) {
        response = 'Potential hiring risks:\n\n⚠️ Candidate A: Employment gap (6 months)\n⚠️ Candidate B: PPE score below threshold\n✅ Candidate C: Low risk — strong references';
      }
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date().toISOString() }]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="flex h-[calc(100vh-140px)] gap-4">
      <div className="flex-1 flex flex-col">
        <div className="flex-1 bg-white rounded-xl border flex flex-col">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <span className="text-blue-600 font-bold">AI</span>
            <h2 className="font-semibold">AI Recruiting Copilot</h2>
            <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">AI Active</span>
          </div>

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
          </div>

          <div className="border-t p-4">
            <div className="flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Ask about candidates, evaluations, hiring decisions..."
                className="flex-1 rounded-lg border px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              <button onClick={handleSend}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white text-sm hover:bg-blue-700">Send</button>
            </div>
          </div>
        </div>
      </div>

      <div className="w-80 flex flex-col gap-4">
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
          <div className="space-y-2">
            {[
              'Show me the top candidates for the Senior Backend role',
              'Explain how the AI evaluation scores are calculated',
              'Compare the top 3 candidates side by side',
              'What are the potential hiring risks for current candidates?',
            ].map((query, i) => (
              <button key={i} onClick={() => setInput(query)}
                className="w-full text-left rounded-lg border p-3 text-sm hover:bg-gray-50 transition-colors">
                {query.substring(0, 40)}...
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-semibold mb-3">Context</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Active Job</span><span className="font-medium">Senior Backend</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Candidates</span><span className="font-medium">24</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Interviews</span><span className="font-medium">8</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
