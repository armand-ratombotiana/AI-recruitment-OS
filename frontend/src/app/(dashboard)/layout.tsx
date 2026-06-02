'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Calendar,
  Code2,
  BarChart3,
  Bot,
  Workflow,
  Settings,
  Menu,
  X,
  Bell,
  Search,
  ChevronDown,
  Shield,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Candidates', href: '/candidates', icon: Users },
  { name: 'Jobs', href: '/jobs', icon: Briefcase },
  { name: 'Interviews', href: '/interviews', icon: Calendar },
  { name: 'PPE Coding', href: '/ppe', icon: Code2 },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'AI Copilot', href: '/ai-copilot', icon: Bot },
  { name: 'Workflows', href: '/workflows', icon: Workflow },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold text-gray-900">AI-ROS</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          <div className="space-y-0.5">
            {navigation.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User Profile */}
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
              JD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">John Doe</p>
              <p className="text-xs text-gray-500 truncate">Admin</p>
            </div>
            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search candidates, jobs, interviews..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            </button>

            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:shadow-md transition-shadow">
              JD
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
