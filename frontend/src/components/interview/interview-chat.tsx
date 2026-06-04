'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/services/api/client';
import { useToast } from '@/hooks';
import { Bot, User as UserIcon, Sparkles } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'interviewer' | 'candidate';
  content: string;
  agentName?: string;
  confidence?: number;
  reasoning?: any[];
  timestamp: string;
}

interface InterviewChatProps {
  interviewId?: string;
  candidateId?: string;
  jobId?: string;
  interviewType?: 'technical' | 'hr' | 'phone';
  candidateName?: string;
  jobTitle?: string;
  onComplete?: () => void;
}

const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  technical: [
    'Walk me through a system you designed end to end.',
    'How would you debug a memory leak in production?',
    'Explain CAP theorem with a real example.',
  ],
  hr: [
    'Tell me about a time you had a conflict at work.',
    'Why are you interested in this role?',
    'Where do you see yourself in 3 years?',
  ],
  phone: [
    'Give me a quick overview of your background.',
    'What attracted you to this position?',
    'What is your availability for the next steps?',
  ],
};

export function InterviewChat({
  interviewId,
  candidateId,
  jobId,
  interviewType = 'technical',
  candidateName = 'there',
  jobTitle = 'this role',
  onComplete,
}: InterviewChatProps) {
  const openingQ = SUGGESTED_QUESTIONS[interviewType]?.[0] ||
    `Welcome to your ${interviewType} interview for ${jobTitle}, ${candidateName}. Please tell me about your background.`;
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'interviewer',
      content: openingQ,
      agentName: interviewType === 'hr' ? 'HR Interviewer' : 'Technical Interviewer',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { push, ToastContainer } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput('');

    setMessages((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        role: 'candidate',
        content: message,
        timestamp: new Date().toISOString(),
      },
    ]);
    setLoading(true);

    const agentType = interviewType === 'hr' ? 'hr_interview' : interviewType === 'phone' ? 'recruiting_copilot' : 'technical_interview';

    try {
      const r = await api.orchestrate({
        agent_type: agentType,
        input: { question: message, conversation: messages.map((m) => ({ role: m.role, content: m.content })) },
        candidate_id: candidateId,
        job_id: jobId,
      });
      const result = r?.result || {};
      const followUp =
        (Array.isArray(result.questions) && result.questions[0]) ||
        result.follow_up ||
        'Thank you. Could you elaborate on that?';
      const content = typeof followUp === 'string' ? followUp : (followUp.text || JSON.stringify(followUp));

      setMessages((prev) => [
        ...prev,
        {
          id: `i-${Date.now()}`,
          role: 'interviewer',
          content,
          agentName: r?.agent_name || (interviewType === 'hr' ? 'HR Interviewer' : 'Technical Interviewer'),
          confidence: typeof r?.confidence_score === 'number' ? r.confidence_score : undefined,
          reasoning: Array.isArray(r?.reasoning_chain) ? r.reasoning_chain : undefined,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      push('error', err?.message || 'Interview agent unavailable');
      setMessages((prev) => [
        ...prev,
        {
          id: `i-err-${Date.now()}`,
          role: 'interviewer',
          content: 'I had trouble connecting to the interview service. Please try again or contact support.',
          agentName: 'AI Interviewer',
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
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'candidate' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'interviewer' && (
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}
            <div className={`max-w-[80%]`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
                {msg.role === 'interviewer' ? msg.agentName || 'AI Interviewer' : 'You'}
                {msg.role === 'interviewer' && typeof msg.confidence === 'number' && (
                  <span className="ml-2 text-gray-300 normal-case font-normal">
                    confidence {Math.round(msg.confidence * 100)}%
                  </span>
                )}
              </p>
              <div
                className={`rounded-xl p-3 text-sm ${
                  msg.role === 'candidate' ? 'bg-gray-100 text-gray-900' : 'bg-blue-50 text-blue-900'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'interviewer' && msg.reasoning && msg.reasoning.length > 0 && (
                <details className="mt-1 text-[10px] text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-700">Show reasoning</summary>
                  <ol className="mt-1 space-y-0.5 list-decimal list-inside">
                    {msg.reasoning.map((r, i) => <li key={i}>{r}</li>)}
                  </ol>
                </details>
              )}
            </div>
            {msg.role === 'candidate' && (
              <div className="h-8 w-8 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
                <UserIcon className="h-4 w-4 text-gray-600" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-white animate-pulse" />
            </div>
            <div className="bg-blue-50 text-blue-900 rounded-xl p-3">
              <p className="text-[10px] italic text-blue-700 mb-1">Thinking…</p>
              <div className="flex gap-1">
                <span className="h-2 w-2 bg-blue-400 rounded-full animate-bounce" />
                <span className="h-2 w-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 2 && (
        <div className="border-t px-4 pt-3">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Suggested questions</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {(SUGGESTED_QUESTIONS[interviewType] || []).slice(1).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSend(q)}
                disabled={loading}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="border-t p-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="Type your response…"
          className="flex-1 rounded-lg border px-4 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '…' : 'Send'}
        </button>
        {onComplete && messages.length > 4 && (
          <button
            type="button"
            onClick={onComplete}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
          >
            End interview
          </button>
        )}
      </form>
    </div>
  );
}
