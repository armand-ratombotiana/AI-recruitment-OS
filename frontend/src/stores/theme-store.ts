'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  setResolved: (resolved: ResolvedTheme) => void;
  _init: () => void;
}

const STORAGE_KEY = 'airos_theme';

function detectSystem(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

function mediaListener(e: MediaQueryListEvent) {
  const resolved: ResolvedTheme = e.matches ? 'dark' : 'light';
  applyTheme(resolved);
  useThemeStore.setState({ resolvedTheme: resolved });
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: (theme) => {
        const resolved: ResolvedTheme =
          theme === 'system' ? detectSystem() : theme;
        applyTheme(resolved);
        set({ theme, resolvedTheme: resolved });
      },
      setResolved: (resolved) => {
        applyTheme(resolved);
        set({ resolvedTheme: resolved });
      },
      _init: () => {
        if (typeof window === 'undefined') return;
        const state = get();
        const resolved: ResolvedTheme =
          state.theme === 'system' ? detectSystem() : state.theme;
        applyTheme(resolved);
        set({ resolvedTheme: resolved });
        try {
          const mql = window.matchMedia('(prefers-color-scheme: dark)');
          if (mql.addEventListener) {
            mql.addEventListener('change', mediaListener);
          } else if (mql.addListener) {
            mql.addListener(mediaListener);
          }
        } catch {
          /* noop */
        }
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
