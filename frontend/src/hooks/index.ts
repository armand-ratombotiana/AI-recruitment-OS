'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

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

export { usePushNotifications } from './use-push-notifications';

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

export { useErrorTracking } from './use-error-tracking';
export type { UseErrorTrackingOptions, UseErrorTrackingReturn } from './use-error-tracking';

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
