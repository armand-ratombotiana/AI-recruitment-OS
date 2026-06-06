'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const COMPARE_MAX = 4;

interface CompareState {
  ids: string[];
  isHydrated: boolean;
  add: (id: string) => boolean;
  remove: (id: string) => void;
  toggle: (id: string) => boolean;
  clear: () => void;
  has: (id: string) => boolean;
  setHydrated: () => void;
}

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      ids: [],
      isHydrated: false,
      add: (id) => {
        const cur = get().ids;
        if (cur.includes(id)) return true;
        if (cur.length >= COMPARE_MAX) return false;
        set({ ids: [...cur, id] });
        return true;
      },
      remove: (id) => set({ ids: get().ids.filter((x) => x !== id) }),
      toggle: (id) => {
        const cur = get().ids;
        if (cur.includes(id)) {
          set({ ids: cur.filter((x) => x !== id) });
          return true;
        }
        if (cur.length >= COMPARE_MAX) return false;
        set({ ids: [...cur, id] });
        return true;
      },
      clear: () => set({ ids: [] }),
      has: (id) => get().ids.includes(id),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: 'airos_candidate_compare',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return localStorage;
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
      partialize: (s) => ({ ids: s.ids }),
    }
  )
);
