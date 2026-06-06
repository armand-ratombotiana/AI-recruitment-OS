'use client';

import { useCallback, useEffect, useState } from 'react';

const SAVED_JOBS_KEY = 'airos_public_saved_jobs';
const JOB_ALERTS_KEY = 'airos_public_job_alerts';
const APPLY_DRAFT_PREFIX = 'airos_public_apply_draft_';
const APPLICATION_HISTORY_KEY = 'airos_public_application_history';

export type SavedJob = {
  id: string;
  title: string;
  company?: string | null;
  department?: string | null;
  location: string;
  employment_type?: string | null;
  remote?: boolean;
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string | null;
  savedAt: string;
};

export type JobAlert = {
  id: string;
  email: string;
  keywords: string;
  location?: string;
  remote?: boolean;
  employment_type?: string;
  frequency: 'instant' | 'daily' | 'weekly';
  createdAt: string;
  jobId?: string | null;
};

export type ApplyDraft = {
  jobId: string;
  step: number;
  personal: {
    full_name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    portfolio?: string;
    headline?: string;
  };
  resumeMeta?: {
    name: string;
    size: number;
    type: string;
  } | null;
  coverLetter?: string;
  answers?: Record<string, string>;
  consent?: boolean;
  updatedAt: string;
};

export type ApplicationRecord = {
  id: string;
  jobId: string;
  jobTitle: string;
  company?: string | null;
  email: string;
  status: 'submitted' | 'received' | 'reviewing' | 'failed';
  submittedAt: string;
  candidateId?: string;
};

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop — storage may be full or disabled */
  }
}

function emit(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('airos:public-store', { detail: { key } }));
  } catch {
    /* noop */
  }
}

function useStored<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setValue(safeRead<T>(key, fallback));
    setHydrated(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        setValue(safeRead<T>(key, fallback));
      }
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (detail?.key === key) {
        setValue(safeRead<T>(key, fallback));
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('airos:public-store', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('airos:public-store', onCustom as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        safeWrite(key, v);
        emit(key);
        return v;
      });
    },
    [key],
  );

  return [value, set, hydrated];
}

export function useSavedJobs() {
  const [list, setList, hydrated] = useStored<SavedJob[]>(SAVED_JOBS_KEY, []);

  const isSaved = useCallback(
    (jobId: string) => list.some((j) => j.id === jobId),
    [list],
  );

  const save = useCallback(
    (job: Omit<SavedJob, 'savedAt'>) => {
      setList((prev) => {
        if (prev.some((j) => j.id === job.id)) return prev;
        return [{ ...job, savedAt: new Date().toISOString() }, ...prev];
      });
    },
    [setList],
  );

  const unsave = useCallback(
    (jobId: string) => {
      setList((prev) => prev.filter((j) => j.id !== jobId));
    },
    [setList],
  );

  const toggle = useCallback(
    (job: Omit<SavedJob, 'savedAt'>) => {
      setList((prev) => {
        if (prev.some((j) => j.id === job.id)) {
          return prev.filter((j) => j.id !== job.id);
        }
        return [{ ...job, savedAt: new Date().toISOString() }, ...prev];
      });
    },
    [setList],
  );

  const clear = useCallback(() => setList([]), [setList]);

  return { list, isSaved, save, unsave, toggle, clear, hydrated };
}

export function useJobAlerts() {
  const [list, setList, hydrated] = useStored<JobAlert[]>(JOB_ALERTS_KEY, []);

  const add = useCallback(
    (alert: Omit<JobAlert, 'id' | 'createdAt'>) => {
      const created: JobAlert = {
        ...alert,
        id: `al_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
      };
      setList((prev) => [created, ...prev]);
      return created;
    },
    [setList],
  );

  const remove = useCallback(
    (id: string) => {
      setList((prev) => prev.filter((a) => a.id !== id));
    },
    [setList],
  );

  return { list, add, remove, hydrated };
}

export function loadApplyDraft(jobId: string): ApplyDraft | null {
  if (!jobId) return null;
  return safeRead<ApplyDraft | null>(`${APPLY_DRAFT_PREFIX}${jobId}`, null);
}

export function saveApplyDraft(draft: ApplyDraft) {
  if (!draft.jobId) return;
  const withStamp: ApplyDraft = { ...draft, updatedAt: new Date().toISOString() };
  safeWrite(`${APPLY_DRAFT_PREFIX}${draft.jobId}`, withStamp);
  emit(`${APPLY_DRAFT_PREFIX}${draft.jobId}`);
}

export function clearApplyDraft(jobId: string) {
  if (typeof window === 'undefined' || !jobId) return;
  try {
    localStorage.removeItem(`${APPLY_DRAFT_PREFIX}${jobId}`);
    emit(`${APPLY_DRAFT_PREFIX}${jobId}`);
  } catch {
    /* noop */
  }
}

export function useApplyDraft(jobId: string) {
  const [draft, setDraftState] = useState<ApplyDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDraftState(loadApplyDraft(jobId));
    setHydrated(true);
  }, [jobId]);

  const update = useCallback(
    (patch: Partial<Omit<ApplyDraft, 'jobId' | 'updatedAt'>>) => {
      setDraftState((prev) => {
        const next: ApplyDraft = {
          jobId,
          step: 0,
          personal: {},
          ...prev,
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        saveApplyDraft(next);
        return next;
      });
    },
    [jobId],
  );

  const clear = useCallback(() => {
    clearApplyDraft(jobId);
    setDraftState(null);
  }, [jobId]);

  return { draft, update, clear, hydrated };
}

export function useApplicationHistory() {
  const [list, setList, hydrated] = useStored<ApplicationRecord[]>(APPLICATION_HISTORY_KEY, []);

  const addEntry = useCallback(
    (entry: Omit<ApplicationRecord, 'id' | 'submittedAt'>) => {
      const record: ApplicationRecord = {
        ...entry,
        id: `app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        submittedAt: new Date().toISOString(),
      };
      setList((prev) => [record, ...prev.filter((p) => p.jobId !== entry.jobId)]);
      return record;
    },
    [setList],
  );

  const findByJob = useCallback(
    (jobId: string) => list.find((p) => p.jobId === jobId) || null,
    [list],
  );

  return { list, addEntry, findByJob, hydrated };
}

export const STORAGE_KEYS = {
  SAVED_JOBS_KEY,
  JOB_ALERTS_KEY,
  APPLY_DRAFT_PREFIX,
  APPLICATION_HISTORY_KEY,
};
