'use client';

import { useEffect, useState, createContext, useContext, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toast: (t: Omit<ToastData, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ICONS: Record<ToastVariant, ReactNode> = {
  info: <Info className="h-5 w-5 text-[var(--color-info-500)]" aria-hidden="true" />,
  success: <CheckCircle2 className="h-5 w-5 text-[var(--color-success-500)]" aria-hidden="true" />,
  warning: <AlertTriangle className="h-5 w-5 text-[var(--color-warning-500)]" aria-hidden="true" />,
  error: <AlertCircle className="h-5 w-5 text-[var(--color-danger-500)]" aria-hidden="true" />,
};

const STYLES: Record<ToastVariant, string> = {
  info: 'bg-[var(--color-info-50)] border-[var(--color-info-500)]/30 dark:bg-[var(--color-info-50)]/10 dark:border-[var(--color-info-500)]/30',
  success: 'bg-[var(--color-success-50)] border-[var(--color-success-500)]/30 dark:bg-[var(--color-success-50)]/10 dark:border-[var(--color-success-500)]/30',
  warning: 'bg-[var(--color-warning-50)] border-[var(--color-warning-500)]/30 dark:bg-[var(--color-warning-50)]/10 dark:border-[var(--color-warning-500)]/30',
  error: 'bg-[var(--color-danger-50)] border-[var(--color-danger-500)]/30 dark:bg-[var(--color-danger-50)]/10 dark:border-[var(--color-danger-500)]/30',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (t: Omit<ToastData, 'id'>) => {
      const id = Math.random().toString(36).slice(2);
      const fullToast = { ...t, id };
      setToasts((prev) => [...prev, fullToast]);
      const dur = t.duration ?? 4000;
      if (dur > 0) {
        setTimeout(() => dismiss(id), dur);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        className="fixed top-4 right-4 z-[var(--z-toast)] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 p-4 rounded-lg border shadow-elevation-3',
              'min-w-[300px] max-w-md animate-scale-in',
              STYLES[t.variant]
            )}
            role="status"
          >
            {ICONS[t.variant]}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-[var(--color-ink-primary)]">{t.title}</div>
              {t.description && (
                <div className="text-sm text-[var(--color-ink-secondary)] mt-1">{t.description}</div>
              )}
              {t.action && (
                <button
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="mt-2 text-xs font-medium text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] underline dark:text-[var(--color-brand-400)] dark:hover:text-[var(--color-brand-300)]"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink-primary)] shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
