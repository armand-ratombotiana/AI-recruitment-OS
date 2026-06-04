'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileQuestion, Search, ArrowLeft, Home, Users, Briefcase, KanbanSquare, BarChart3, Bot, Sparkles, CalendarDays } from 'lucide-react';

const QUICK_LINKS = [
  { href: '/dashboard/candidates', label: 'Candidates', icon: Users },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/dashboard/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { href: '/dashboard/interviews', label: 'Interviews', icon: CalendarDays },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/ai-copilot', label: 'AI Copilot', icon: Bot },
  { href: '/dashboard/matching', label: 'Matching', icon: Sparkles },
];

export default function DashboardNotFound() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/dashboard/search?q=${encodeURIComponent(trimmed)}` : '/dashboard/search');
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-2xl">
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-sm">
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-gradient-to-br from-purple-500/15 to-blue-500/15 blur-3xl" aria-hidden="true" />

          <div className="relative px-6 py-10 sm:px-10 sm:py-14 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-500/10 dark:to-purple-500/10 ring-1 ring-gray-200 dark:ring-gray-800">
              <FileQuestion className="h-8 w-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </div>

            <p
              className="text-7xl sm:text-8xl font-extrabold tracking-tight bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent select-none"
              aria-hidden="true"
            >
              404
            </p>
            <span className="sr-only">404 — Page not found</span>

            <h1 className="mt-4 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Page not found
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              Sorry, we couldn&apos;t find the dashboard page you&apos;re looking for. It may have been moved, renamed, or never existed.
            </p>

            <form
              onSubmit={handleSearch}
              role="search"
              className="mt-8 mx-auto max-w-md"
              aria-label="Search the dashboard"
            >
              <label htmlFor="dashboard-404-search" className="sr-only">
                Search
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400 dark:text-gray-500"
                  aria-hidden="true"
                  style={{ width: '18px', height: '18px' }}
                />
                <input
                  id="dashboard-404-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search candidates, jobs, interviews…"
                  autoComplete="off"
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 pl-11 pr-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </form>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 transition"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Go back
              </button>
              <Link
                href="/dashboard"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 transition"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                Dashboard home
              </Link>
            </div>
          </div>

          <div className="relative border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-6 py-6 sm:px-10">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center">
              Or jump to a common page
            </p>
            <ul className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {QUICK_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          Need help? Try the <kbd className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 font-mono text-[10px]">⌘K</kbd> shortcut to search anywhere.
        </p>
      </div>
    </div>
  );
}
