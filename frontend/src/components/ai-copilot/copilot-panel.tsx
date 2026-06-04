'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/services/api/client';
import { useToast } from '@/hooks';
import { Sparkles, Bot, User as UserIcon } from 'lucide-react';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  agentName?: string;
  confidence?: number;
  reasoning?: any[];
  timestamp: string;
}

interface CopilotPanelProps {
  context?: Record<string, any>;
  candidateId?: string;
  jobId?: string;
  systemPrompt?: string;
}

export function CopilotPanel({ context, candidateId, jobId, systemPrompt }: CopilotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'assistant',
      content:
        "Hello! I'm your AI recruiting copilot. I can help you summarize candidates, explain AI evaluation scores, compare applicants, recommend hiring decisions, and generate interview questions. What would you like help with?",
      agentName: 'Recruiting Copilot',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { push, ToastContainer } = useToast();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput('');

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages((p) => [...p, userMsg]);
    setLoading(true);

    try {
      const r = await api.orchestrate({
        agent_type: 'recruiting_copilot',
        input: { query: message, system_prompt: systemPrompt, context: context || {} },
        candidate_id: candidateId,
        job_id: jobId,
      });
      const result = r?.result || {};
      const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
      const drafts = Array.isArray(result.email_drafts) ? result.email_drafts : [];

      const lines: string[] = [];
      if (result.pipeline_summary) {
        const s = result.pipeline_summary;
        lines.push('**Pipeline summary**');
        for (const [k, v] of Object.entries(s)) lines.push(`- ${k}: ${v}`);
        lines.push('');
      }
      if (suggestions.length) {
        lines.push('**Suggested actions**');
        for (const s of suggestions) {
          const action = typeof s === 'string' ? s : s.action || JSON.stringify(s);
          const reason = typeof s === 'object' && s.reason ? ` — ${s.reason}` : '';
          const priority = typeof s === 'object' && s.priority ? ` [${s.priority}]` : '';
          lines.push(`- ${action}${priority}${reason}`);
        }
        lines.push('');
      }
      if (drafts.length) {
        lines.push('**Email drafts**');
        for (const d of drafts) lines.push(`- To: ${d.to} — "${d.subject}"`);
      }

      const content = lines.length > 0
        ? lines.join('\n')
        : (typeof result === 'string' ? result : 'I have processed your request.');

      setMessages((p) => [
        ...p,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content,
          agentName: r?.agent_name || 'Recruiting Copilot',
          confidence: typeof r?.confidence_score === 'number' ? r.confidence_score : undefined,
          reasoning: Array.isArray(r?.reasoning_chain) ? r.reasoning_chain : undefined,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      push('error', err?.message || 'Copilot request failed');
      setMessages((p) => [
        ...p,
        {
          id: `a-err-${Date.now()}`,
          role: 'assistant',
          content: 'I had trouble reaching the AI service. Please verify the backend is running and try again.',
          agentName: 'Recruiting Copilot',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <ToastContainer />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <div className={`max-w-[80%]`}>
              {msg.role === 'assistant' && msg.agentName && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
                  {msg.agentName}
                  {typeof msg.confidence === 'number' && (
                    <span className="ml-2 text-gray-300 normal-case font-normal">
                      confidence {Math.round(msg.confidence * 100)}%
                    </span>
                  )}
                </p>
              )}
              <div
                className={`rounded-xl p-3 text-sm whitespace-pre-wrap ${
                  msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'assistant' && msg.reasoning && msg.reasoning.length > 0 && (
                <details className="mt-1 text-[10px] text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-700">Show reasoning</summary>
                  <ol className="mt-1 space-y-0.5 list-decimal list-inside">
                    {msg.reasoning.map((r, i) => <li key={i}>{r}</li>)}
                  </ol>
                </details>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="h-7 w-7 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
                <UserIcon className="h-3.5 w-3.5 text-gray-600" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-white animate-pulse" />
            </div>
            <div className="bg-gray-100 rounded-xl p-3">
              <p className="text-[10px] italic text-gray-500 mb-1">AI is thinking…</p>
              <div className="flex gap-1">
                <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" />
                <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t p-4">
        <div className="flex gap-2 mb-2 flex-wrap">
          {['Summarize candidates', 'Explain scores', 'Compare applicants', 'Identify risks'].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => handleSend(q)}
              disabled={loading}
              className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Ask about candidates, evaluations..."
            className="flex-1 rounded-lg border px-4 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}
