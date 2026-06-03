'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { useClickOutside, useToast } from '@/hooks';
import { api } from '@/services/api/client';

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'info' | 'success' | 'warning' | 'danger';
}

const dotColor: Record<Notification['type'], string> = {
  info: 'bg-blue-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
};

function inferType(item: any): Notification['type'] {
  const title = (item.title || item.type || '').toLowerCase();
  if (title.includes('error') || title.includes('fail') || title.includes('reject')) return 'danger';
  if (title.includes('warn') || title.includes('alert') || title.includes('stuck')) return 'warning';
  if (title.includes('success') || title.includes('complete') || title.includes('match') || title.includes('hired')) return 'success';
  return 'info';
}

function relTime(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { push, ToastContainer } = useToast();

  useClickOutside(ref, () => setOpen(false));

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listNotifications();
      const list = (res?.data || []).map((n: any): Notification => ({
        id: n.id,
        title: n.title || 'Notification',
        message: n.message || n.body || '',
        time: relTime(n.created_at || n.timestamp),
        read: !!n.read,
        type: inferType(n),
      }));
      setItems(list);
    } catch {
      // silent — keep empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const unread = items.filter((n) => !n.read).length;

  const markAllRead = async () => {
    setItems((p) => p.map((n) => ({ ...n, read: true })));
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/notifications/read-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(api.getToken() ? { Authorization: `Bearer ${api.getToken()}` } : {}),
        },
      });
    } catch (err) {
      // ignore
    }
  };

  const markRead = async (id: string) => {
    setItems((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/notifications/${id}/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(api.getToken() ? { Authorization: `Bearer ${api.getToken()}` } : {}),
        },
      });
    } catch (err) {
      // ignore
    }
  };

  const remove = (id: string) => {
    setItems((p) => p.filter((n) => n.id !== id));
  };

  return (
    <div className="relative" ref={ref}>
      <ToastContainer />
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
            {loading && items.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">Loading…</div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">No notifications</div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={`group flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition cursor-pointer ${!n.read ? 'bg-blue-50/40' : ''}`}
                  onClick={() => markRead(n.id)}
                >
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dotColor[n.type]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{n.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                    <p className="text-[11px] text-gray-400 mt-1">{n.time}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); remove(n.id); }}
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
