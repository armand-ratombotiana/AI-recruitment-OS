'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationContextValue {
  notify: (n: Omit<Notification, 'id'>) => string;
  dismiss: (id: string) => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}

interface ProviderProps {
  children: ReactNode;
  position?:
    | 'top-right'
    | 'top-left'
    | 'top-center'
    | 'bottom-right'
    | 'bottom-left'
    | 'bottom-center';
  maxNotifications?: number;
}

const positions: Record<NonNullable<ProviderProps['position']>, string> = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
};

export function NotificationProvider({
  children,
  position = 'top-right',
  maxNotifications = 5,
}: ProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (n: Omit<Notification, 'id'>) => {
      const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = n.duration ?? 5000;
      setNotifications((prev) => {
        const next = [...prev, { ...n, id }];
        return next.slice(-maxNotifications);
      });
      if (duration > 0) {
        const t = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, t);
      }
      return id;
    },
    [dismiss, maxNotifications]
  );

  const value: NotificationContextValue = {
    notify,
    dismiss,
    success: (title, description) =>
      notify({ type: 'success', title, description }),
    error: (title, description) =>
      notify({ type: 'error', title, description, duration: 7000 }),
    warning: (title, description) =>
      notify({ type: 'warning', title, description }),
    info: (title, description) =>
      notify({ type: 'info', title, description }),
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div
        className={cn(
          'fixed z-[100] flex w-full max-w-sm flex-col gap-2',
          positions[position]
        )}
        aria-live="polite"
        aria-atomic="false"
        role="region"
        aria-label="Notifications"
      >
        {notifications.map((n) => (
          <NotificationItem key={n.id} notification={n} onDismiss={dismiss} />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

const iconMap: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap: Record<NotificationType, string> = {
  success: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  warning: 'border-yellow-200 bg-yellow-50 text-yellow-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
};

const iconColor: Record<NotificationType, string> = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-yellow-500',
  info: 'text-blue-500',
};

function NotificationItem({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
}) {
  const Icon = iconMap[notification.type];
  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-lg border p-4 shadow-lg',
        'animate-in slide-in-from-right-full',
        colorMap[notification.type]
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', iconColor[notification.type])} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{notification.title}</p>
        {notification.description && (
          <p className="mt-1 text-sm opacity-90">{notification.description}</p>
        )}
        {notification.action && (
          <button
            type="button"
            onClick={() => {
              notification.action!.onClick();
              onDismiss(notification.id);
            }}
            className="mt-2 text-sm font-medium underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            {notification.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-1 hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
