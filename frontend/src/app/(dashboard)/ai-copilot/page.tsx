'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Message { role: 'assistant' | 'user'; content: string; timestamp: string; }

export default function AICopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am your AI recruiting copilot. I can help you:\n\n• Summarize candidate profiles\n• Explain AI evaluation scores\n• Compare applicants side-by-side\n• Generate interview questions\n• Identify hiring risks\n• Recommend next steps\n\nWhat would you like help with?', timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const lower = input.toLowerCase();
      let response = 'I understand your question. Let me analyze the data and provide insights based on the current recruitment pipeline.';
      
      if (lower.includes('candidate') || lower.includes('summarize')) {
        response = 'Here are the top candidates by AI evaluation:\n\n1. **Sarah Chen** — Staff Engineer (Score: 9.2/10)\n   • 12 years experience in distributed systems\n   • Strong Python and Kubernetes skills\n   • Excellent communication in interviews\n\n2. **John Smith** — Senior Engineer (Score: 8.7/10)\n   • 8 years backend experience\n   • Strong PPE performance (85% tests passed)\n   • Solid CS fundamentals\n\n3. **Emily Davis** — Senior Engineer (Score: 8.3/10)\n   • 7 years full-stack experience\n   • Great cultural fit indicators\n   • Strong system design skills';
      } else if (lower.includes('rank') || lower.includes('score')) {
        response = 'AI ranking is based on a weighted combination:\n\n• **Skill Match** (35%): Alignment with job requirements\n• **Experience** (25%): Years and relevance\n• **PPE Score** (20%): Coding evaluation results\n• **Interview** (15%): Human and AI feedback\n• **Cultural Fit** (5%): Team alignment\n\nAll scores are explainable with reasoning traces.';
      } else if (lower.includes('risk') || lower.includes('concern')) {
        response = 'Potential hiring risks identified:\n\n⚠️ **Candidate A**: 6-month employment gap — consider asking about career break\n⚠️ **Candidate B**: PPE score below senior threshold — may need junior positioning\n✅ **Candidate C**: Low risk — consistent progression, strong references\n\nI recommend addressing these concerns in the next interview round.';
      } else if (lower.includes('question') || lower.includes('interview')) {
        response = 'Here are recommended interview questions for this role:\n\n**Technical:**\n1. Explain how you would design a distributed caching system\n2. Walk me through your approach to debugging a production outage\n3. How would you handle a 10x increase in traffic?\n\n**Behavioral:**\n1. Tell me about a time you had to make a difficult technical decision\n2. Describe a situation where you had to collaborate with a non-technical stakeholder\n\n**System Design:**\n1. Design a real-time notification system\n2. How would you implement a rate limiter?';
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date().toISOString() }]);
      setIsTyping(false);
    }, 1500);
  };

  const quickActions = [
    { label: 'Summarize top candidates', icon: '👥' },
    { label: 'Explain AI evaluation scores', icon: '📊' },
    { label: 'Compare candidates side-by-side', icon: '⚖️' },
    { label: 'Identify hiring risks', icon: '⚠️' },
    { label: 'Generate interview questions', icon: '🎤' },
    { label: 'Recommend next steps', icon: '➡️' },
  ];

  return (
    <div className="flex h-[calc(100vh-140px)] gap-4">
      <div className="flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <span className="text-xl">🤖</span>
            <h2 className="font-semibold">AI Recruiting Copilot</h2>
            <Badge variant="success">Active</Badge>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl p-4 text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                  {msg.content}
                  {msg.role === 'assistant' && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-gray-200">
                      <button className="text-gray-400 hover:text-gray-600">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </button>
                      <button className="text-gray-400 hover:text-green-600">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-xl p-4">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" />
                    <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                    <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          
          <div className="border-t p-4">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Ask about candidates, evaluations, hiring decisions..." className="w-full rounded-lg border px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
        </Card>
      </div>

      <div className="w-80 flex flex-col gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
          <div className="space-y-2">
            {quickActions.map((action, i) => (
              <button key={i} onClick={() => setInput(action.label)} className="w-full text-left flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-gray-50">
                <span>{action.icon}</span> {action.label}
              </button>
            ))}
          </div>
        </Card>
        
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Context</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Active Job</span><span className="font-medium">Senior Backend</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Candidates</span><span className="font-medium">24</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Interviews</span><span className="font-medium">8</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
