'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

type LivePriority = 'polite' | 'assertive' | 'off';

interface LiveRegionProps {
  message?: string;
  priority?: LivePriority;
  atomic?: boolean;
  role?: 'status' | 'alert' | 'log' | 'marquee' | 'timer';
  className?: string;
  children?: React.ReactNode;
}

export function LiveRegion({
  message,
  priority = 'polite',
  atomic = true,
  role,
  className,
  children,
}: LiveRegionProps) {
  const resolvedRole = role ?? (priority === 'assertive' ? 'alert' : 'status');

  return (
    <div
      aria-live={priority}
      aria-atomic={atomic}
      role={resolvedRole}
      className={cn('sr-only', className)}
    >
      {children ?? message}
    </div>
  );
}

interface UseLiveAnnouncerReturn {
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
  clear: () => void;
  LiveRegionComponent: React.FC<{ className?: string }>;
}

export function useLiveAnnouncer(): UseLiveAnnouncerReturn {
  const [politeMsg, setPoliteMsg] = useState('');
  const [assertiveMsg, setAssertiveMsg] = useState('');

  const announce = useCallback(
    (message: string, priority: 'polite' | 'assertive' = 'polite') => {
      if (priority === 'assertive') {
        setAssertiveMsg('');
        requestAnimationFrame(() => setAssertiveMsg(message));
      } else {
        setPoliteMsg('');
        requestAnimationFrame(() => setPoliteMsg(message));
      }
    },
    []
  );

  const clear = useCallback(() => {
    setPoliteMsg('');
    setAssertiveMsg('');
  }, []);

  const LiveRegionComponent: React.FC<{ className?: string }> = useCallback(
    ({ className }) => (
      <>
        <div
          aria-live="polite"
          aria-atomic="true"
          role="status"
          className={cn('sr-only', className)}
        >
          {politeMsg}
        </div>
        <div
          aria-live="assertive"
          aria-atomic="true"
          role="alert"
          className={cn('sr-only', className)}
        >
          {assertiveMsg}
        </div>
      </>
    ),
    [politeMsg, assertiveMsg]
  );

  return { announce, clear, LiveRegionComponent };
}

interface AnnouncerProps {
  className?: string;
}

export function Announcer({ className }: AnnouncerProps) {
  const { LiveRegionComponent } = useLiveAnnouncer();
  return <LiveRegionComponent className={className} />;
}
