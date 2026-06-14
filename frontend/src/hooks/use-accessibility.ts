'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createFocusTrap,
  handleKeyboardNavigation,
  announce,
  type KeyboardNavOptions,
} from '@/utils/accessibility';
import { useMediaQuery } from './use-media-query';

export function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const trapRef = useRef<ReturnType<typeof createFocusTrap> | null>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    const trap = createFocusTrap(ref.current);
    trapRef.current = trap;
    trap.activate();
    return () => {
      trap.deactivate();
      trapRef.current = null;
    };
  }, [active]);

  return ref;
}

export function useKeyboardNavigation(
  itemCount: number,
  options: KeyboardNavOptions = {}
) {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const next = handleKeyboardNavigation(
        e.nativeEvent,
        activeIndex,
        itemCount,
        {
          ...options,
          onSelect: (idx) => {
            options.onSelect?.(idx);
          },
        }
      );
      setActiveIndex(next);
    },
    [activeIndex, itemCount, options]
  );

  return { activeIndex, setActiveIndex, handleKeyDown, containerRef };
}

export function useScreenReader() {
  const speak = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    announce(message, priority);
  }, []);

  const speakPolite = useCallback((message: string) => {
    announce(message, 'polite');
  }, []);

  const speakAssertive = useCallback((message: string) => {
    announce(message, 'assertive');
  }, []);

  return { speak, speakPolite, speakAssertive };
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

export function useHighContrast(): boolean {
  return useMediaQuery('(prefers-contrast: more)');
}
