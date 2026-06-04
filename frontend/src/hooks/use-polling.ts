'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface PollingState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  lastUpdated: number | null;
  isPolling: boolean;
  refresh: () => Promise<void>;
  start: () => void;
  stop: () => void;
}

export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs = 30_000,
  options: { enabled?: boolean; onError?: (e: Error) => void; immediate?: boolean } = {}
): PollingState<T> {
  const { enabled = true, onError, immediate = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isPolling, setIsPolling] = useState(enabled);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const tick = useCallback(async () => {
    try {
      const result = await fnRef.current();
      setData(result);
      setError(null);
      setLastUpdated(Date.now());
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error(String(e?.message || e));
      setError(err);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    if (immediate) {
      setLoading(true);
      tick();
    }
    if (intervalMs > 0) {
      timer = setInterval(tick, intervalMs);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [enabled, intervalMs, immediate, tick]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await tick();
  }, [tick]);

  const start = useCallback(() => setIsPolling(true), []);
  const stop = useCallback(() => setIsPolling(false), []);

  return { data, error, loading, lastUpdated, isPolling, refresh, start, stop };
}
