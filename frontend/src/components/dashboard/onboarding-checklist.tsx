'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, X, Rocket, Users, Briefcase, Sparkles, Bot, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/services/api/client';

const STORAGE_KEY = 'airos_onboarding_dismissed';

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  check: () => Promise<boolean> | boolean;
}

const STEPS: OnboardingStep[] = [
  {
    id: 'profile',
    label: 'Complete your profile',
    description: 'Add your name, photo, and role',
    href: '/dashboard/settings',
    icon: SettingsIcon,
    check: async () => {
      try {
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/auth/me`, {
          headers: api.getToken() ? { Authorization: `Bearer ${api.getToken()}` } : {},
        });
        if (!r.ok) return false;
        const me = await r.json();
        return !!(me.full_name && me.full_name.length > 1);
      } catch {
        return false;
      }
    },
  },
  {
    id: 'first-job',
    label: 'Post your first job',
    description: 'Create a job listing to start receiving applications',
    href: '/dashboard/jobs',
    icon: Briefcase,
    check: async () => {
      try {
        const r = await api.listJobs();
        return r.total > 0;
      } catch {
        return false;
      }
    },
  },
  {
    id: 'first-candidate',
    label: 'Add a candidate',
    description: 'Import candidates or invite them via email',
    href: '/dashboard/candidates',
    icon: Users,
    check: async () => {
      try {
        const r = await api.listCandidates();
        return r.total > 0;
      } catch {
        return false;
      }
    },
  },
  {
    id: 'ai-copilot',
    label: 'Try the AI Copilot',
    description: 'Ask the AI to evaluate, match, or summarize',
    href: '/dashboard/ai-copilot',
    icon: Bot,
    check: () => {
      try {
        return !!localStorage.getItem('airos_copilot_used');
      } catch {
        return false;
      }
    },
  },
  {
    id: 'pipeline',
    label: 'Set up your pipeline',
    description: 'Customize stages for your hiring workflow',
    href: '/dashboard/pipeline',
    icon: Sparkles,
    check: () => {
      try {
        return !!localStorage.getItem('airos_pipeline_configured');
      } catch {
        return false;
      }
    },
  },
];

export function OnboardingChecklist() {
  const [open, setOpen] = useState(true);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      setOpen(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled(STEPS.map((s) => s.check()));
      if (cancelled) return;
      const done = new Set<string>();
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) done.add(STEPS[i].id);
      });
      setCompleted(done);
      setLoading(false);
      if (done.size === STEPS.length) {
        setOpen(false);
        localStorage.setItem(STORAGE_KEY, 'true');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* noop */ }
  };

  if (!open) return null;
  if (loading) return null;

  const totalSteps = STEPS.length;
  const doneCount = completed.size;
  const pct = Math.round((doneCount / totalSteps) * 100);

  return (
    <div
      role="region"
      aria-label="Getting started checklist"
      className="relative mb-6 overflow-hidden rounded-2xl border border-blue-200/60 bg-gradient-brand-soft p-5 shadow-elevation-1"
    >
      <div className="absolute inset-0 bg-gradient-mesh opacity-40 pointer-events-none" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-brand" aria-hidden="true">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Welcome to AI-ROS</h3>
              <p className="text-xs text-gray-600">
                {doneCount} of {totalSteps} complete &middot; {pct}%
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Dismiss onboarding"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/60" aria-hidden="true">
          <div
            className="h-full bg-gradient-brand transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <ul className="space-y-1.5">
          {STEPS.map((step) => {
            const done = completed.has(step.id);
            const Icon = step.icon;
            return (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 transition',
                    'hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    done && 'opacity-60'
                  )}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-success-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-300 group-hover:text-gray-400" />
                    )}
                  </span>
                  <Icon
                    className={cn('h-4 w-4 shrink-0', done ? 'text-gray-400' : 'text-blue-600')}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm font-medium',
                      done ? 'text-gray-500 line-through' : 'text-gray-900'
                    )}>
                      {step.label}
                    </p>
                    {!done && <p className="text-xs text-gray-500 truncate">{step.description}</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
