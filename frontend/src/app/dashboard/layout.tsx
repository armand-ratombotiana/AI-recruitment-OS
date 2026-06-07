'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CalendarDays,
  Calendar as CalendarIcon,
  Code2,
  BarChart3,
  Bot,
  Workflow as WorkflowIcon,
  KanbanSquare,
  Settings as SettingsIcon,
  X,
  Sparkles,
  Zap,
  ClipboardList,
} from 'lucide-react';
import {
  UserMenu,
  NotificationsBell,
  QuickActionsFab,
  GlobalSearch,
  NotificationProvider,
  ErrorBoundary,
  ThemeToggle,
  LanguageToggle,
  ConnectionStatus,
  MobileNav,
} from '@/components';
import { ToastProvider } from '@/components/ui/toast';
import { useLocaleStore, translate } from '@/stores/locale-store';

const NAV_ITEMS = [
  { href: '/dashboard', key: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/dashboard/candidates', key: 'nav.candidates', icon: Users, badge: '24' },
  { href: '/dashboard/jobs', key: 'nav.jobs', icon: Briefcase, badge: '5' },
  { href: '/dashboard/assessments', key: 'nav.assessments', icon: ClipboardList },
  { href: '/dashboard/interviews', key: 'nav.interviews', icon: CalendarIcon },
  { href: '/dashboard/ppe', key: 'nav.ppe', icon: Code2 },
  { href: '/dashboard/analytics', key: 'nav.analytics', icon: BarChart3 },
  { href: '/dashboard/ai-copilot', key: 'nav.aiCopilot', icon: Bot, badge: 'new' },
  { href: '/dashboard/workflows', key: 'nav.workflows', icon: WorkflowIcon },
  { href: '/dashboard/pipeline', key: 'nav.pipeline', icon: KanbanSquare },
  { href: '/dashboard/matching', key: 'nav.matching', icon: Sparkles },
  { href: '/dashboard/schedule', key: 'nav.schedule', icon: CalendarDays },
  { href: '/dashboard/settings', key: 'nav.settings', icon: SettingsIcon },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocaleStore((s) => s.locale);

  return (
    <ToastProvider>
      <NotificationProvider position="top-right" maxNotifications={5}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
        >
          Skip to main content
        </a>
        <a
          href="#primary-nav"
          className="sr-only focus:not-sr-only focus:fixed focus:left-32 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
        >
          Skip to navigation
        </a>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-slate-50 dark:from-surface-950 dark:via-surface-900 dark:to-surface-950">
          <aside
            className="fixed inset-y-0 left-0 z-40 hidden lg:flex w-64 bg-white dark:bg-surface-900 border-r border-gray-200 dark:border-surface-700 flex-col shadow-sm"
            aria-label="Sidebar navigation"
          >
            <div className="flex items-center justify-between gap-2 px-5 h-16 border-b border-gray-200 dark:border-surface-700 shrink-0">
              <Link
                href="/dashboard"
                className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:rounded-md p-1 -m-1"
              >
                <div className="h-9 w-9 rounded-lg bg-gradient-brand flex items-center justify-center shadow-brand">
                  <Bot className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <span className="text-lg font-bold bg-gradient-brand bg-clip-text text-transparent">
                  AI-ROS
                </span>
              </Link>
            </div>

            <nav
              id="primary-nav"
              className="flex-1 p-3 space-y-0.5 overflow-y-auto"
              aria-label="Main"
            >
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {translate(locale, 'nav.workspace', 'Workspace')}
              </p>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      active
                        ? 'bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 shadow-sm dark:from-brand-500/10 dark:to-accent-500/10 dark:text-brand-300'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-surface-800 dark:hover:text-gray-100'
                    }`}
                  >
                    <Icon
                      className={`shrink-0 ${active ? 'text-blue-600 dark:text-brand-400' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`}
                      style={{ width: '18px', height: '18px' }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate">
                      {translate(locale, item.key, item.key)}
                    </span>
                    {item.badge && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          item.badge === 'new'
                            ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-surface-800 dark:text-gray-400'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {active && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-brand-400"
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="p-3 border-t border-gray-100 dark:border-surface-700 shrink-0">
              <div className="rounded-xl bg-gradient-brand p-4 text-white shadow-brand">
                <div className="flex items-center gap-2 mb-1.5">
                  <Zap className="h-4 w-4" aria-hidden="true" />
                  <p className="text-xs font-semibold">
                    {translate(locale, 'nav.proTip', 'Pro tip')}
                  </p>
                </div>
                <p className="text-[11px] text-white/90 leading-relaxed">
                  {translate(locale, 'nav.proTip', 'Press')}{' '}
                  <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">⌘K</kbd>{' '}
                  {translate(locale, 'nav.proTipCommand', 'to open search and jump anywhere.')}
                </p>
              </div>
            </div>
          </aside>

          <div className="lg:ml-64">
            <header className="sticky top-0 z-30 bg-white/80 dark:bg-surface-900/80 backdrop-blur-md border-b border-gray-200 dark:border-surface-700 h-16 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-6">
              <MobileNav />
              <div className="flex-1 min-w-0">
                <GlobalSearch />
              </div>
              <div className="flex items-center gap-1 sm:gap-2 ml-auto">
                <ConnectionStatus />
                <ThemeToggle />
                <LanguageToggle />
                <NotificationsBell />
                <UserMenu />
              </div>
            </header>
            <main
              id="main-content"
              tabIndex={-1}
              className="p-3 sm:p-4 lg:p-6 pb-24 outline-none"
            >
              <ErrorBoundary level="page" showHomeButton>
                {children}
              </ErrorBoundary>
            </main>
            <QuickActionsFab />
          </div>
        </div>
      </NotificationProvider>
    </ToastProvider>
  );
}
