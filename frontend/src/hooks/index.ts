'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { createElement } from 'react';

export { useWebSocket } from './use-websocket';
export type {
  UseWebSocketOptions,
  UseWebSocketReturn,
  WSMessage,
  WSState,
  WSStateInfo,
  WSEventName,
  WSMessageListener,
} from './use-websocket';

export {
  useIntersectionObserver,
  useVirtualList,
  useDebounce,
  useDebouncedCallback,
  useThrottle,
  useThrottledCallback,
} from './use-performance';
export type {
  UseIntersectionObserverOptions,
  UseIntersectionObserverReturn,
  UseVirtualListOptions,
  UseVirtualListReturn,
} from './use-performance';

export { useMediaQuery, useIsMobile, useIsTablet, useIsDesktop, breakpoints } from './use-media-query';

export {
  useFocusTrap,
  useKeyboardNavigation,
  useScreenReader,
  useReducedMotion,
  useHighContrast,
} from './use-accessibility';

export function useCountUp(end: number, duration = 1500) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const startTime = Date.now();
          const tick = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(tick);
            else setCount(end);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);

  return { count, ref };
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setValue(JSON.parse(stored));
    } catch {}
    setHydrated(true);
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as any)(prev) : next;
        try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
        return v;
      });
    },
    [key]
  );

  return [value, set, hydrated] as const;
}

export function useClickOutside(ref: React.RefObject<HTMLElement>, onOutside: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onOutside]);
}

export function useToast() {
  const [toasts, setToasts] = useState<{ id: string; type: 'success' | 'error' | 'info' | 'warning'; message: string }[]>([]);

  const push = useCallback((type: 'success' | 'error' | 'info' | 'warning', message: string, duration = 3500) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), duration);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  const ToastContainer = () => {
    const container = createElement(
      'div',
      {
        className: 'fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none',
        role: 'region',
        'aria-label': 'Notifications',
      },
      ...toasts.map((t) =>
        createElement(
          'div',
          {
            key: t.id,
            role: 'status',
            className: `pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-sm font-medium slide-in-right min-w-[260px] flex items-center gap-2 ${
              t.type === 'success'
                ? 'bg-green-600 text-white'
                : t.type === 'error'
                  ? 'bg-red-600 text-white'
                  : t.type === 'warning'
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-900 text-white'
            }`,
          },
          t.message,
          createElement(
            'button',
            {
              type: 'button',
              onClick: () => dismiss(t.id),
              'aria-label': 'Dismiss notification',
              className: 'ml-2 text-white/80 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded',
            },
            '×'
          )
        )
      )
    );
    return container;
  };

  return { push, dismiss, ToastContainer };
}
