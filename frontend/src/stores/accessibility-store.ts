'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type FontSize = 'sm' | 'md' | 'lg' | 'xl';

interface AccessibilityState {
  fontSize: FontSize;
  highContrast: boolean;
  reducedMotion: boolean;
  setFontSize: (size: FontSize) => void;
  setHighContrast: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
}

const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
};

function applyFontSize(size: FontSize) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  Object.values(FONT_SIZE_CLASSES).forEach((c) => root.classList.remove(c));
  root.classList.add(FONT_SIZE_CLASSES[size]);
}

function applyHighContrast(enabled: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('high-contrast', enabled);
}

function applyReducedMotion(enabled: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('reduce-motion', enabled);
}

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      fontSize: 'md',
      highContrast: false,
      reducedMotion: false,
      setFontSize: (fontSize) => {
        applyFontSize(fontSize);
        set({ fontSize });
      },
      setHighContrast: (highContrast) => {
        applyHighContrast(highContrast);
        set({ highContrast });
      },
      setReducedMotion: (reducedMotion) => {
        applyReducedMotion(reducedMotion);
        set({ reducedMotion });
      },
    }),
    {
      name: 'airos_accessibility',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return localStorage;
      }),
    }
  )
);

export { FONT_SIZE_CLASSES };
