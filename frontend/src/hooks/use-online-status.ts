'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface QueuedMutation {
  id: string;
  url: string;
  options: RequestInit;
  timestamp: number;
  retries: number;
}

interface UseOnlineStatusReturn {
  isOnline: boolean;
  isSyncing: boolean;
  queuedMutations: number;
  queueMutation: (url: string, options: RequestInit) => Promise<Response | null>;
  forceSync: () => Promise<void>;
}

const MAX_RETRIES = 3;
const SYNC_INTERVAL = 30000;
const STORAGE_KEY = 'airos-offline-queue';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getStoredQueue(): QueuedMutation[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedMutation[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore storage errors
  }
}

export function useOnlineStatus(): UseOnlineStatusReturn {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queuedMutations, setQueuedMutations] = useState(0);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        triggerSync();
      }
    };

    setIsOnline(navigator.onLine);
    setQueuedMutations(getStoredQueue().length);

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    syncIntervalRef.current = setInterval(() => {
      if (navigator.onLine) {
        triggerSync();
      }
    }, SYNC_INTERVAL);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncingRef.current || !navigator.onLine) return;

    isSyncingRef.current = true;
    setIsSyncing(true);

    const queue = getStoredQueue();
    if (queue.length === 0) {
      isSyncingRef.current = false;
      setIsSyncing(false);
      setQueuedMutations(0);
      return;
    }

    const remainingQueue: QueuedMutation[] = [];

    for (const mutation of queue) {
      try {
        const response = await fetch(mutation.url, {
          ...mutation.options,
          headers: {
            'Content-Type': 'application/json',
            ...mutation.options.headers,
          },
        });

        if (!response.ok && response.status < 500) {
          throw new Error(`HTTP ${response.status}`);
        }

        if (!response.ok) {
          remainingQueue.push({ ...mutation, retries: mutation.retries + 1 });
        }
      } catch {
        if (mutation.retries < MAX_RETRIES) {
          remainingQueue.push({ ...mutation, retries: mutation.retries + 1 });
        }
      }
    }

    saveQueue(remainingQueue);
    setQueuedMutations(remainingQueue.length);
    isSyncingRef.current = false;
    setIsSyncing(false);
  }, []);

  const queueMutation = useCallback(async (url: string, options: RequestInit): Promise<Response | null> => {
    if (navigator.onLine) {
      try {
        return await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });
      } catch {
        // Fall through to queue
      }
    }

    const mutation: QueuedMutation = {
      id: generateId(),
      url,
      options,
      timestamp: Date.now(),
      retries: 0,
    };

    const queue = getStoredQueue();
    queue.push(mutation);
    saveQueue(queue);
    setQueuedMutations(queue.length);

    return null;
  }, []);

  const forceSync = useCallback(async () => {
    await triggerSync();
  }, [triggerSync]);

  return {
    isOnline,
    isSyncing,
    queuedMutations,
    queueMutation,
    forceSync,
  };
}

export function useOfflineQueue(): QueuedMutation[] {
  const [queue, setQueue] = useState<QueuedMutation[]>([]);

  useEffect(() => {
    setQueue(getStoredQueue());
    const handleStorage = () => setQueue(getStoredQueue());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return queue;
}