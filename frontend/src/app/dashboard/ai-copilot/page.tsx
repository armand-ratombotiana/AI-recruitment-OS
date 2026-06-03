'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/services/api/client';
import { Sparkles, Bot, User as UserIcon } from 'lucide-react';
import { useToast } from '@/hooks';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentName?: string;
  confidence?: number;
  reasoning?: string[];
  timestamp: string;
}

const SUGGESTED = [
  'Summarize my top candidates',
  'Who should I move to interview next?',
  'Explain the score for Sarah Chen',
  'Where is the pipeline bottlenecked?',
];

export default function AICopilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'assistant',
      content:
        "Hello! I'm your AI recruiting copilot. I can help you summarize candidates, explain scores, recommend next actions, and analyze your pipeline. What would you like help with?",
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

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput('');

    const userMsg: ChatMessage = {
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
        input: { query: message, context: 'dashboard_copilot' },
      });
      const result = r?.result || {};
      const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
      const drafts = Array.isArray(result.email_drafts) ? result.email_drafts : [];

      const lines: string[] = [];
      if (result.pipeline_summary) {
        const s = result.pipeline_summary;
        lines.push('**Pipeline summary**');
        for (const [k, v] of Object.entries(s)) {
          lines.push(`- ${k}: ${v}`);
        }
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
        for (const d of drafts) {
          lines.push(`- To: ${d.to} — "${d.subject}"`);
        }
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
      push('error', err?.message || 'Copilot request failed. Please try again.');
      setMessages((p) => [
        ...p,
        {
          id: `a-err-${Date.now()}`,
          role: 'assistant',
          content:
            "I'm having trouble reaching the AI service right now. Please check that the backend is running, then try again.",
          agentName: 'Recruiting Copilot',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)]">
      <ToastContainer />
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-3 flex items-center gap-2 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">AI Recruiting Copilot</h2>
            <p className="text-xs text-gray-500">Powered by GPT-4o · routed through the orchestrator</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-white" />
                </div>
              )}
              <div className={`max-w-[80%] ${m.role === 'user' ? 'order-2' : ''}`}>
                {m.role === 'assistant' && m.agentName && (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                    {m.agentName}
                    {typeof m.confidence === 'number' && (
                      <span className="ml-2 text-gray-300 normal-case font-normal">
                        confidence {Math.round(m.confidence * 100)}%
                      </span>
                    )}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-900 border border-gray-200'
                  }`}
                >
                  {m.content}
                </div>
                {m.role === 'assistant' && m.reasoning && m.reasoning.length > 0 && (
                  <details className="mt-2 text-xs text-gray-500">
                    <summary className="cursor-pointer hover:text-gray-700 font-medium">Show reasoning</summary>
                    <ol className="mt-2 space-y-1 list-decimal list-inside">
                      {m.reasoning.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
              {m.role === 'user' && (
                <div className="h-8 w-8 rounded-lg bg-gray-200 flex items-center justify-center shrink-0 order-3">
                  <UserIcon className="h-4 w-4 text-gray-600" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-white animate-pulse" />
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
                <p className="text-xs text-gray-500 italic mb-2">AI is thinking…</p>
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

        <div className="border-t border-gray-200 p-4 bg-gray-50/50">
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  disabled={loading}
                  className="text-xs bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 px-3 py-1.5 rounded-full disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about candidates, evaluations, pipeline…"
              disabled={loading}
              className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending…' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
