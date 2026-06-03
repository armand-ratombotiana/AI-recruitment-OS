'use client';

import { useState, useRef } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { useClickOutside } from '@/hooks';

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'info' | 'success' | 'warning' | 'danger';
}

const INITIAL: Notification[] = [
  { id: '1', title: 'New candidate match', message: 'Sarah Chen has a 96% match for Senior Engineer', time: '2m ago', read: false, type: 'success' },
  { id: '2', title: 'Interview completed', message: 'AI evaluation complete for Michael Park', time: '15m ago', read: false, type: 'info' },
  { id: '3', title: 'Pipeline alert', message: '3 candidates stuck in Screening for 7+ days', time: '1h ago', read: false, type: 'warning' },
  { id: '4', title: 'Weekly report ready', message: 'Your hiring analytics for last week are available', time: '3h ago', read: true, type: 'info' },
  { id: '5', title: 'Workflow triggered', message: 'Auto-screen workflow processed 12 new candidates', time: '1d ago', read: true, type: 'success' },
];

const dotColor: Record<Notification['type'], string> = {
  info: 'bg-blue-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
};

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>(INITIAL);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false));

  const unread = items.filter((n) => !n.read).length;

  const markAllRead = () => setItems((p) => p.map((n) => ({ ...n, read: true })));
  const remove = (id: string) => setItems((p) => p.filter((n) => n.id !== id));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-label={`Notifications (${unread} unread)`}
        aria-expanded={open}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Bell className="h-5 w-5 text-gray-500" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-50 w-96 max-w-[calc(100vw-1rem)] rounded-xl border border-gray-200 bg-white shadow-2xl fade-in-scale overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-br from-gray-50 to-white">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              <p className="text-xs text-gray-500">{unread} unread</p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
              >
                <Check className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            {items.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">No notifications</div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={`group flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition ${!n.read ? 'bg-blue-50/40' : ''}`}
                >
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dotColor[n.type]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{n.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                    <p className="text-[11px] text-gray-400 mt-1">{n.time}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(n.id)}
                    aria-label="Dismiss notification"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 transition"
                  >
                    <X className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-center">
            <a href="#" onClick={(e) => { e.preventDefault(); setOpen(false); }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              View all activity
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
