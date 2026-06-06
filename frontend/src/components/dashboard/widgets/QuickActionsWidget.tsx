'use client';

import Link from 'next/link';
import { ArrowUpRight, UserPlus, Briefcase, Calendar, Bot } from 'lucide-react';
import { useLocaleStore, translate } from '@/stores/locale-store';

const QUICK = [
  { key: 'dashboard.quickActions.addCandidate', icon: UserPlus, href: '/dashboard/candidates', color: 'from-blue-500 to-blue-600' },
  { key: 'dashboard.quickActions.createJob', icon: Briefcase, href: '/dashboard/jobs', color: 'from-green-500 to-emerald-600' },
  { key: 'dashboard.quickActions.scheduleInterview', icon: Calendar, href: '/dashboard/interviews', color: 'from-purple-500 to-purple-600' },
  { key: 'dashboard.quickActions.askAI', icon: Bot, href: '/dashboard/ai-copilot', color: 'from-amber-500 to-orange-600' },
];

export function QuickActionsWidget() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-4 gap-3"
      role="group"
      aria-label={t('dashboard.quickActionsRegion', 'Quick actions')}
    >
      {QUICK.map((q) => {
        const Icon = q.icon;
        const label = t(q.key, q.key);
        return (
          <Link
            key={q.key}
            href={q.href}
            aria-label={label}
            className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900 p-4 hover:border-blue-300 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <div
              className={`h-10 w-10 rounded-lg bg-gradient-to-br ${q.color} flex items-center justify-center mb-3 group-hover:scale-110 transition`}
              aria-hidden="true"
            >
              <Icon className="h-5 w-5 text-white" />
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</p>
            <ArrowUpRight
              className="absolute top-3 right-3 h-4 w-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition"
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </div>
  );
}
