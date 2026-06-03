'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Calendar,
  Code2,
  BarChart3,
  Bot,
  Workflow as WorkflowIcon,
  Settings as SettingsIcon,
  Menu,
  X,
  Search,
  Sparkles,
} from 'lucide-react';
import { UserMenu, NotificationsBell, QuickActionsFab, GlobalSearch, NotificationProvider } from '@/components';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/candidates', label: 'Candidates', icon: Users, badge: '24' },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase, badge: '5' },
  { href: '/dashboard/interviews', label: 'Interviews', icon: Calendar },
  { href: '/dashboard/ppe', label: 'PPE', icon: Code2 },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/ai-copilot', label: 'AI Copilot', icon: Bot, badge: 'new' },
  { href: '/dashboard/workflows', label: 'Workflows', icon: WorkflowIcon },
  { href: '/dashboard/pipeline', label: 'Pipeline', icon: WorkflowIcon },
  { href: '/dashboard/matching', label: 'AI Matching', icon: Sparkles },
  { href: '/dashboard/schedule', label: 'Schedule', icon: Calendar },
  { href: '/dashboard/settings', label: 'Settings', icon: SettingsIcon },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <NotificationProvider position="top-right" maxNotifications={5}>
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-slate-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden animate-in fade-in"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Sidebar navigation"
      >
        <div className="flex items-center justify-between gap-2 px-5 h-16 border-b border-gray-200 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              AI-ROS
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto scrollbar-thin">
          <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Workspace</p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className={`h-4.5 w-4.5 shrink-0 ${active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} style={{ width: '18px', height: '18px' }} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    item.badge === 'new' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {item.badge}
                  </span>
                )}
                {active && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-100 shrink-0">
          <div className="rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 p-4 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4" />
              <p className="text-xs font-semibold">Pro tip</p>
            </div>
            <p className="text-[11px] text-white/80 leading-relaxed">
              Press <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">⌘K</kbd> to open search and jump anywhere.
            </p>
          </div>
        </div>
      </aside>

      <div className="lg:ml-64">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 h-16 flex items-center gap-3 px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <GlobalSearch />
          <div className="flex items-center gap-2 ml-auto">
            <NotificationsBell />
            <UserMenu />
          </div>
        </header>
        <main className="p-4 lg:p-6 pb-24">
          {children}
        </main>
        <QuickActionsFab />
      </div>
    </div>
    </NotificationProvider>
  );
}
