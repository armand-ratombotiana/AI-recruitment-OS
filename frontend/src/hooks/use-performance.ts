'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export interface UseIntersectionObserverOptions {
  threshold?: number | number[];
  rootMargin?: string;
  root?: Element | null;
  freezeOnceVisible?: boolean;
}

export interface UseIntersectionObserverReturn {
  ref: React.RefObject<Element | null>;
  entry: IntersectionObserverEntry | null;
  isIntersecting: boolean;
}

export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
): UseIntersectionObserverReturn {
  const { threshold = 0, rootMargin = '0px', root = null, freezeOnceVisible = false } = options;
  const ref = useRef<Element | null>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const frozen = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    if (frozen.current && freezeOnceVisible) return;

    const observer = new IntersectionObserver(
      ([e]) => {
        setEntry(e);
        if (e.isIntersecting && freezeOnceVisible) {
          frozen.current = true;
          observer.unobserve(node);
        }
      },
      { threshold, rootMargin, root }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin, root, freezeOnceVisible]);

  return {
    ref,
    entry,
    isIntersecting: entry?.isIntersecting ?? false,
  };
}

export interface UseVirtualListOptions {
  itemCount: number;
  itemHeight: number | ((index: number) => number);
  overscan?: number;
  containerHeight: number;
}

export interface UseVirtualListReturn {
  virtualItems: { index: number; offsetTop: number; size: number }[];
  totalHeight: number;
  containerProps: {
    ref: React.RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    style: React.CSSProperties;
  };
  wrapperProps: {
    style: React.CSSProperties;
  };
}

export function useVirtualList(
  options: UseVirtualListOptions
): UseVirtualListReturn {
  const { itemCount, itemHeight, overscan = 5, containerHeight } = options;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const getItemHeight = useCallback(
    (index: number): number => {
      if (typeof itemHeight === 'function') return itemHeight(index);
      return itemHeight;
    },
    [itemHeight]
  );

  const totalHeight = useMemo(() => {
    if (typeof itemHeight === 'number') return itemCount * itemHeight;
    let total = 0;
    for (let i = 0; i < itemCount; i++) total += getItemHeight(i);
    return total;
  }, [itemCount, itemHeight, getItemHeight]);

  const getItemOffset = useCallback(
    (index: number): number => {
      if (typeof itemHeight === 'number') return index * itemHeight;
      let offset = 0;
      for (let i = 0; i < index; i++) offset += getItemHeight(i);
      return offset;
    },
    [itemHeight, getItemHeight]
  );

  const virtualItems = useMemo(() => {
    const items: { index: number; offsetTop: number; size: number }[] = [];
    if (itemCount === 0) return items;

    let start = 0;
    if (typeof itemHeight === 'number') {
      start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    } else {
      let accumulated = 0;
      for (let i = 0; i < itemCount; i++) {
        accumulated += getItemHeight(i);
        if (accumulated >= scrollTop) {
          start = Math.max(0, i - overscan);
          break;
        }
      }
    }

    const end = Math.min(itemCount - 1, (() => {
      if (typeof itemHeight === 'number') {
        return Math.floor((scrollTop + containerHeight) / itemHeight) + overscan;
      }
      let accumulated = 0;
      for (let i = 0; i < itemCount; i++) {
        accumulated += getItemHeight(i);
        if (accumulated >= scrollTop + containerHeight) {
          return i + overscan;
        }
      }
      return itemCount - 1;
    })());

    for (let i = start; i <= end; i++) {
      items.push({
        index: i,
        offsetTop: getItemOffset(i),
        size: getItemHeight(i),
      });
    }
    return items;
  }, [scrollTop, containerHeight, itemCount, itemHeight, overscan, getItemHeight, getItemOffset]);

  const onScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  return {
    virtualItems,
    totalHeight,
    containerProps: {
      ref: containerRef,
      onScroll,
      style: { overflow: 'auto' as const, height: containerHeight, position: 'relative' as const },
    },
    wrapperProps: {
      style: { height: totalHeight, position: 'relative' as const },
    },
  };
}

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay = 300
): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedFn = useCallback(
    (...args: any[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay]
  ) as unknown as T;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return debouncedFn;
}

export function useThrottle<T>(value: T, interval = 300): T {
  const [throttled, setThrottled] = useState(value);
  const lastRan = useRef(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= interval) {
        setThrottled(value);
        lastRan.current = Date.now();
      }
    }, interval - (Date.now() - lastRan.current));

    return () => clearTimeout(handler);
  }, [value, interval]);

  return throttled;
}

export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay = 300
): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const lastCall = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const throttledFn = useCallback(
    (...args: any[]) => {
      const now = Date.now();
      const remaining = delay - (now - lastCall.current);

      if (remaining <= 0) {
        lastCall.current = now;
        callbackRef.current(...args);
      } else {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          lastCall.current = Date.now();
          callbackRef.current(...args);
        }, remaining);
      }
    },
    [delay]
  ) as unknown as T;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return throttledFn;
}
