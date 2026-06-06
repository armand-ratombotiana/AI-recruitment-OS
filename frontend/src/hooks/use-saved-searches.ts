'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FilterValues } from '@/components/ui/advanced-filter';

export type SavedSearchScope = 'candidates' | 'jobs' | 'global';

export interface SmartFilterCriteria {
  statuses?: string[];
  minScore?: number;
  createdWithinDays?: number;
  inactiveSinceDays?: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  scope: SavedSearchScope;
  filters: FilterValues;
  query: string;
  smartFilter: SmartFilterId | null;
  smartFilterCriteria: SmartFilterCriteria;
  createdAt: string;
  updatedAt: string;
}

export type SmartFilterId =
  | 'active_candidates'
  | 'top_10_percent'
  | 'recently_added'
  | 'stale_candidates';

export interface SmartFilterDefinition {
  id: SmartFilterId;
  label: string;
  description: string;
  scope: SavedSearchScope;
  buildCriteria: (now: Date) => SmartFilterCriteria;
}

export interface SmartFilterInput {
  filters: FilterValues;
  criteria: SmartFilterCriteria;
}

export const SMART_FILTERS: SmartFilterDefinition[] = [
  {
    id: 'active_candidates',
    label: 'Active candidates',
    description: 'Candidates in screening, interview, or offer',
    scope: 'candidates',
    buildCriteria: () => ({
      statuses: ['screening', 'interviewing', 'offer'],
    }),
  },
  {
    id: 'top_10_percent',
    label: 'Top 10%',
    description: 'Candidates with AI score ≥ 80',
    scope: 'candidates',
    buildCriteria: () => ({
      minScore: 80,
    }),
  },
  {
    id: 'recently_added',
    label: 'Recently added',
    description: 'Candidates added in the last 7 days',
    scope: 'candidates',
    buildCriteria: (now) => {
      void now;
      return { createdWithinDays: 7 };
    },
  },
  {
    id: 'stale_candidates',
    label: 'Stale candidates',
    description: 'No activity in the last 30 days',
    scope: 'candidates',
    buildCriteria: () => ({
      inactiveSinceDays: 30,
    }),
  },
];

export function getSmartFilter(id: SmartFilterId | null | undefined): SmartFilterDefinition | null {
  if (!id) return null;
  return SMART_FILTERS.find((f) => f.id === id) ?? null;
}

const STORAGE_NAMESPACE = 'airos_saved_searches';
const STORAGE_VERSION = 1;
const MAX_SEARCHES_PER_SCOPE = 25;

interface PersistedShape {
  version: number;
  searches: SavedSearch[];
}

function storageKey(scope: SavedSearchScope, tenantId?: string): string {
  const tenant = tenantId || 'default';
  return `${STORAGE_NAMESPACE}:${tenant}:${scope}`;
}

function readFromStorage(scope: SavedSearchScope, tenantId?: string): SavedSearch[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(scope, tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedShape;
    if (!parsed || parsed.version !== STORAGE_VERSION) return [];
    if (!Array.isArray(parsed.searches)) return [];
    return parsed.searches.map((s) => ({
      ...s,
      smartFilterCriteria: s.smartFilterCriteria || {},
    }));
  } catch {
    return [];
  }
}

function writeToStorage(scope: SavedSearchScope, searches: SavedSearch[], tenantId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PersistedShape = { version: STORAGE_VERSION, searches };
    window.localStorage.setItem(storageKey(scope, tenantId), JSON.stringify(payload));
  } catch {
    // localStorage may be full or disabled; surface nothing to caller.
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `ss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface UseSavedSearchesOptions {
  scope: SavedSearchScope;
  tenantId?: string;
}

export interface UseSavedSearchesResult {
  searches: SavedSearch[];
  hydrated: boolean;
  save: (input: SaveInput) => SavedSearch;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  apply: (id: string) => SavedSearch | null;
  clear: () => void;
}

export interface SaveInput {
  name: string;
  filters: FilterValues;
  query?: string;
  smartFilter?: SmartFilterId | null;
  smartFilterCriteria?: SmartFilterCriteria;
  overwriteId?: string;
}

export function useSavedSearches({
  scope,
  tenantId,
}: UseSavedSearchesOptions): UseSavedSearchesResult {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSearches(readFromStorage(scope, tenantId));
    setHydrated(true);
  }, [scope, tenantId]);

  useEffect(() => {
    if (!hydrated) return;
    writeToStorage(scope, searches, tenantId);
  }, [hydrated, scope, searches, tenantId]);

  const save = useCallback(
    (input: SaveInput): SavedSearch => {
      const now = new Date().toISOString();
      const trimmedName = (input.name || '').trim() || 'Untitled search';
      const normalized: SavedSearch = {
        id: input.overwriteId || generateId(),
        name: trimmedName,
        scope,
        filters: { ...input.filters },
        query: input.query ?? '',
        smartFilter: input.smartFilter ?? null,
        smartFilterCriteria: input.smartFilterCriteria ?? {},
        createdAt: now,
        updatedAt: now,
      };
      setSearches((prev) => {
        const existingIndex = prev.findIndex((s) => s.id === normalized.id);
        let next: SavedSearch[];
        if (existingIndex >= 0) {
          next = prev.slice();
          const existing = prev[existingIndex];
          next[existingIndex] = {
            ...normalized,
            createdAt: existing.createdAt,
          };
        } else {
          next = [normalized, ...prev];
        }
        if (next.length > MAX_SEARCHES_PER_SCOPE) {
          next = next.slice(0, MAX_SEARCHES_PER_SCOPE);
        }
        return next;
      });
      return normalized;
    },
    [scope]
  );

  const remove = useCallback((id: string) => {
    setSearches((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const rename = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    setSearches((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, name: trimmed || s.name, updatedAt: new Date().toISOString() }
          : s
      )
    );
  }, []);

  const apply = useCallback(
    (id: string): SavedSearch | null => {
      const found = searches.find((s) => s.id === id);
      return found ?? null;
    },
    [searches]
  );

  const clear = useCallback(() => {
    setSearches([]);
  }, []);

  return { searches, hydrated, save, remove, rename, apply, clear };
}

// ----------------------------------------------------------------------------
// Candidate helpers: apply smart filter criteria to a list of candidates.
// ----------------------------------------------------------------------------

export interface CandidateLike {
  status?: string;
  score?: number;
  created_at?: string;
  updated_at?: string;
  last_activity_at?: string;
}

export function matchesSmartCriteria(
  candidate: CandidateLike,
  criteria: SmartFilterCriteria
): boolean {
  if (!criteria) return true;

  if (criteria.statuses && criteria.statuses.length > 0) {
    if (!criteria.statuses.includes(candidate.status || '')) return false;
  }
  if (typeof criteria.minScore === 'number') {
    const score = typeof candidate.score === 'number' ? candidate.score : -1;
    if (score < criteria.minScore) return false;
  }
  if (typeof criteria.createdWithinDays === 'number') {
    const createdAt = candidate.created_at;
    if (!createdAt) return false;
    const ageMs = Date.now() - new Date(createdAt).getTime();
    const maxMs = criteria.createdWithinDays * 24 * 60 * 60 * 1000;
    if (Number.isNaN(ageMs) || ageMs > maxMs) return false;
  }
  if (typeof criteria.inactiveSinceDays === 'number') {
    const last =
      candidate.last_activity_at || candidate.updated_at || candidate.created_at;
    if (!last) return true; // nothing to compare -> still considered stale
    const elapsed = Date.now() - new Date(last).getTime();
    const minMs = criteria.inactiveSinceDays * 24 * 60 * 60 * 1000;
    if (!Number.isNaN(elapsed) && elapsed < minMs) return false;
  }
  return true;
}
