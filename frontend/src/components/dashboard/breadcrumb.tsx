'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  candidates: 'Candidates',
  jobs: 'Jobs',
  interviews: 'Interviews',
  ppe: 'Pair Programming',
  analytics: 'Analytics',
  'ai-copilot': 'AI Copilot',
  workflows: 'Workflows',
  settings: 'Settings',
  pipeline: 'Pipeline',
  matching: 'AI Matching',
  schedule: 'Schedule',
};

export function Breadcrumb() {
  const pathname = usePathname() || '/dashboard';
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap">
        <li>
          <Link
            href="/dashboard"
            className="flex items-center gap-1 hover:text-gray-700 transition"
            aria-label="Home"
          >
            <Home className="h-3.5 w-3.5" />
          </Link>
        </li>
        {segments.slice(1).map((seg, idx, arr) => {
          const href = '/dashboard/' + segments.slice(1, idx + 2).join('/');
          const isLast = idx === arr.length - 1;
          const label = LABELS[seg] || (seg.charAt(0).toUpperCase() + seg.slice(1));
          return (
            <li key={seg + idx} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 text-gray-300" aria-hidden="true" />
              {isLast ? (
                <span className="font-semibold text-gray-900" aria-current="page">{label}</span>
              ) : (
                <Link href={href} className="hover:text-gray-700 transition link-underline">{label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
