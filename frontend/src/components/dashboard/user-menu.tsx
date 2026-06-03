'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Settings, LogOut, ChevronDown, CreditCard, HelpCircle, Bell } from 'lucide-react';
import { useAuthStore } from '@/stores';
import { useClickOutside } from '@/hooks';

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  useClickOutside(ref, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const handleLogout = async () => {
    try { await logout(); } catch {}
    router.push('/login');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open user menu"
        className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white shadow-sm">
          JD
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-gray-200 bg-white shadow-xl fade-in-scale overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-br from-blue-50 to-purple-50">
            <p className="text-sm font-semibold text-gray-900">John Doe</p>
            <p className="text-xs text-gray-500 mt-0.5">john@company.com</p>
            <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              Pro Plan
            </div>
          </div>

          <div className="py-1">
            <Link
              href="/dashboard/settings"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <User className="h-4 w-4 text-gray-400" />
              Your profile
            </Link>
            <Link
              href="/dashboard/settings?tab=notifications"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <Bell className="h-4 w-4 text-gray-400" />
              Notifications
            </Link>
            <Link
              href="/dashboard/settings?tab=api"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <CreditCard className="h-4 w-4 text-gray-400" />
              Billing
            </Link>
            <Link
              href="/dashboard/settings"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <Settings className="h-4 w-4 text-gray-400" />
              Settings
            </Link>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); setOpen(false); }}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <HelpCircle className="h-4 w-4 text-gray-400" />
              Help &amp; support
            </a>
          </div>

          <div className="border-t border-gray-100 py-1">
            <button
              type="button"
              onClick={handleLogout}
              role="menuitem"
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
