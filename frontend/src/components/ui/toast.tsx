'use client';
import { useEffect, useState, createContext, useContext, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
  push: (type: ToastVariant, message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ICONS: Record<ToastVariant, ReactNode> = {
  info: <Info className="h-5 w-5 text-blue-500" />,
  success: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  error: <AlertCircle className="h-5 w-5 text-red-500" />,
};

const STYLES: Record<ToastVariant, string> = {
  info: 'bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:border-blue-800',
  success: 'bg-green-50 border-green-200 dark:bg-green-950/50 dark:border-green-800',
  warning: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/50 dark:border-yellow-800',
  error: 'bg-red-50 border-red-200 dark:bg-red-950/50 dark:border-red-800',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    const fullToast = { ...t, id };
    setToasts((prev) => [...prev, fullToast]);
    const dur = t.duration ?? 4000;
    if (dur > 0) {
      setTimeout(() => dismiss(id), dur);
    }
  }, [dismiss]);

  const push = useCallback(
    (type: ToastVariant, message: string, duration?: number) => {
      toast({ variant: type, title: message, duration });
    },
    [toast]
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss, push }}>
      {children}
      <div
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-lg border shadow-lg min-w-[300px] max-w-md animate-in slide-in-from-top-5 ${STYLES[t.variant]}`}
            role="status"
          >
            {ICONS[t.variant]}
            <div className="flex-1">
              <div className="font-semibold text-sm text-foreground">{t.title}</div>
              {t.description && (
                <div className="text-sm text-muted-foreground mt-1">{t.description}</div>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-muted-foreground hover:text-foreground"
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
