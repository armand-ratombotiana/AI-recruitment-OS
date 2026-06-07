'use client';

import { useEffect, useState } from 'react';
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
  Menu,
  X,
  Sparkles,
  Zap,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-media-query';
import { useLocaleStore, translate } from '@/stores/locale-store';

export interface MobileNavItem {
  href: string;
  key: string;
  icon: LucideIcon;
  badge?: string;
}

export const MOBILE_NAV_ITEMS: MobileNavItem[] = [
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

interface MobileNavProps {
  className?: string;
}

export function MobileNav({ className }: MobileNavProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = useLocaleStore((s) => s.locale);

  useEffect(() => {
    if (!isMobile) {
      setOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (open) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previous;
      };
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!isMobile) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={translate(locale, 'mobileNav.open', 'Open navigation')}
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className ?? ''}`}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label={translate(locale, 'mobileNav.dialog', 'Navigation')}
        >
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            id="mobile-nav-drawer"
            className="relative w-72 max-w-[85vw] h-full bg-white dark:bg-surface-900 border-r border-gray-200 dark:border-surface-700 flex flex-col shadow-2xl animate-slide-in-left"
            aria-label={translate(locale, 'mobileNav.dialog', 'Navigation')}
          >
            <div className="flex items-center justify-between gap-2 px-5 h-16 border-b border-gray-200 dark:border-surface-700 shrink-0">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:rounded-md p-1 -m-1"
              >
                <div className="h-9 w-9 rounded-lg bg-gradient-brand flex items-center justify-center shadow-brand">
                  <Bot className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <span className="text-lg font-bold bg-gradient-brand bg-clip-text text-transparent">
                  AI-ROS
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={translate(locale, 'mobileNav.close', 'Close navigation')}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav
              className="flex-1 p-3 space-y-0.5 overflow-y-auto"
              aria-label={translate(locale, 'nav.workspace', 'Main')}
            >
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {translate(locale, 'nav.workspace', 'Workspace')}
              </p>
              {MOBILE_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
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
        </div>
      )}
    </>
  );
}
