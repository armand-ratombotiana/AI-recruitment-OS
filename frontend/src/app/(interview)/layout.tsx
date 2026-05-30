'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const interviewNav = [
  { name: 'AI Interview', href: '/ai-interview', icon: '🤖' },
  { name: 'PPE Coding', href: '/ppe', icon: '💻' },
];

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-50 h-16 bg-white border-b border-gray-200 flex items-center px-6">
        <div className="flex items-center gap-2 mr-8">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-sm font-bold text-white">AI</span>
          </div>
          <span className="text-lg font-bold text-gray-900">AI-ROS</span>
        </div>
        <nav className="flex items-center gap-1">
          {interviewNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <span>{item.icon}</span>
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to Dashboard
          </Link>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
