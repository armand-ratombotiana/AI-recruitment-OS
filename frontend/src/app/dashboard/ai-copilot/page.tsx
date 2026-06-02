'use client';
import { useState, useRef, useEffect } from 'react';
import { api } from '@/services/api/client';

export default function AICopilotPage() {
  const [messages, setMessages] = useState<{role:'user'|'assistant';content:string}[]>([{role:'assistant',content:'Hello! How can I help with your recruitment today?'}]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input; setInput(''); setMessages(p => [...p, {role:'user',content:msg}]); setLoading(true);
    try { const r = await api.orchestrate({agent_type:'recruiting_copilot',input:msg}); setMessages(p => [...p, {role:'assistant',content:r.output||r.response||'I received your request.'}]); }
    catch { setMessages(p => [...p, {role:'assistant',content:'I can help with candidate screening, interview questions, and hiring recommendations.'}]); }
    setLoading(false);
  };

  return (
    <div className="flex h-[calc(100vh-140px)]">
      <div className="flex-1 flex flex-col bg-white rounded-xl border">
        <div className="border-b px-4 py-3 font-semibold">AI Recruiting Copilot</div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m,i) => <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}><div className={`max-w-[80%] rounded-xl p-3 text-sm ${m.role==='user'?'bg-blue-600 text-white':'bg-gray-100'}`}>{m.content}</div></div>)}
          {loading && <div className="flex justify-start"><div className="bg-gray-100 rounded-xl p-3"><div className="flex gap-1"><span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"/><span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}}/><span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}}/></div></div></div>}
          <div ref={endRef} />
        </div>
        <div className="border-t p-3">
          <div className="flex gap-2"><input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&send()} placeholder="Ask about candidates, evaluations..." className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/><button onClick={send} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Send</button></div>
        </div>
      </div>
    </div>
  );
}
