'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Plus, UserPlus, Briefcase, Calendar, Bot, X } from 'lucide-react';
import { useClickOutside } from '@/hooks';
import { useToast } from '@/components/ui/toast';

const ACTIONS = [
  { href: '/dashboard/candidates?action=add', label: 'Add candidate', icon: UserPlus, color: 'from-blue-500 to-blue-600' },
  { href: '/dashboard/jobs?action=create', label: 'Create job', icon: Briefcase, color: 'from-green-500 to-emerald-600' },
  { href: '/dashboard/interviews?action=schedule', label: 'Schedule interview', icon: Calendar, color: 'from-purple-500 to-purple-600' },
  { href: '/dashboard/ai-copilot', label: 'Ask AI Copilot', icon: Bot, color: 'from-amber-500 to-orange-600' },
];

export function QuickActionsFab() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { push } = useToast();

  useClickOutside(ref, () => setOpen(false));

  const handleAction = (label: string, href: string) => {
    setOpen(false);
    if (href.includes('?action=')) {
      push('info', `${label} — opening in a moment`);
    }
  };

  return (
    <><div className="fixed bottom-6 right-6 z-40" ref={ref}>
        {open && (
          <div className="absolute bottom-16 right-0 flex flex-col gap-3 items-end fade-in-scale">
            {ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.label}
                  href={a.href}
                  onClick={() => handleAction(a.label, a.href)}
                  className="group flex items-center gap-3"
                >
                  <span className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium shadow-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                    {a.label}
                  </span>
                  <span
                    className={`h-11 w-11 rounded-full bg-gradient-to-br ${a.color} text-white flex items-center justify-center shadow-lg hover:scale-110 transition`}
                    aria-hidden="true"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          aria-label={open ? 'Close quick actions' : 'Open quick actions'}
          aria-expanded={open}
          className={`h-14 w-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center shadow-2xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${open ? 'rotate-45' : ''}`}
        >
          {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </button>
      </div>
    </>
  );
}
