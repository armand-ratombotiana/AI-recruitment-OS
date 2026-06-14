'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  addBreadcrumb,
  setUserContext,
  reportErrorFromException,
  getBreadcrumbs,
  clearBreadcrumbs,
  type UserContext,
  type Breadcrumb,
} from '@/utils/error-reporter';

export interface UseErrorTrackingOptions {
  enabled?: boolean;
  user?: UserContext | null;
  tags?: Record<string, string>;
}

export interface UseErrorTrackingReturn {
  captureError: (error: Error, tags?: Record<string, string>) => Promise<void>;
  captureMessage: (message: string, level?: Breadcrumb['level']) => void;
  trackNavigation: (from: string, to: string) => void;
  trackAction: (action: string, data?: Record<string, unknown>) => void;
  trackApiCall: (endpoint: string, method: string, status: number, duration: number) => void;
  getCollectedBreadcrumbs: () => Breadcrumb[];
  clearCollectedBreadcrumbs: () => void;
}

export function useErrorTracking(
  options: UseErrorTrackingOptions = {}
): UseErrorTrackingReturn {
  const { enabled = true, user = null, tags = {} } = options;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;

  useEffect(() => {
    if (user) {
      setUserContext(user);
    }
  }, [user]);

  const captureError = useCallback(
    async (error: Error, extraTags?: Record<string, string>) => {
      if (!enabled) return;
      await reportErrorFromException(error, {
        tags: { ...tagsRef.current, ...extraTags },
      });
    },
    [enabled]
  );

  const captureMessage = useCallback(
    (message: string, level: Breadcrumb['level'] = 'info') => {
      if (!enabled) return;
      addBreadcrumb('manual', message, level);
    },
    [enabled]
  );

  const trackNavigation = useCallback(
    (from: string, to: string) => {
      if (!enabled) return;
      addBreadcrumb('navigation', `${from} → ${to}`, 'info');
    },
    [enabled]
  );

  const trackAction = useCallback(
    (action: string, data?: Record<string, unknown>) => {
      if (!enabled) return;
      addBreadcrumb('user-action', action, 'info', data);
    },
    [enabled]
  );

  const trackApiCall = useCallback(
    (endpoint: string, method: string, status: number, duration: number) => {
      if (!enabled) return;
      const level = status >= 500 ? 'error' : status >= 400 ? 'warning' : 'info';
      addBreadcrumb(
        'http',
        `${method} ${endpoint} → ${status} (${duration.toFixed(0)}ms)`,
        level,
        { endpoint, method, status, duration }
      );
    },
    [enabled]
  );

  const getCollectedBreadcrumbs = useCallback(() => getBreadcrumbs(), []);
  const clearCollectedBreadcrumbs = useCallback(() => clearBreadcrumbs(), []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handlePerfEntry = () => {
      if (typeof PerformanceObserver === 'undefined') return;
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'navigation') {
              const navEntry = entry as PerformanceNavigationTiming;
              addBreadcrumb(
                'performance',
                `Page load: ${navEntry.loadEventEnd - navEntry.startTime}ms`,
                'info',
                {
                  domContentLoaded: navEntry.domContentLoadedEventEnd - navEntry.startTime,
                  loadComplete: navEntry.loadEventEnd - navEntry.startTime,
                  domInteractive: navEntry.domInteractive - navEntry.startTime,
                }
              );
            }
          }
        });
        observer.observe({ entryTypes: ['navigation'] });
        return () => observer.disconnect();
      } catch {
        //
      }
    };

    return handlePerfEntry();
  }, [enabled]);

  return {
    captureError,
    captureMessage,
    trackNavigation,
    trackAction,
    trackApiCall,
    getCollectedBreadcrumbs,
    clearCollectedBreadcrumbs,
  };
}
