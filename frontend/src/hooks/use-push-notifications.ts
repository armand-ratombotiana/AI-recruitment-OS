'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { api, APIError } from '@/services/api/client';
import type { NotificationTypes } from '@/services/api/types';

type Platform = 'ios' | 'android' | 'web';

interface UsePushNotificationsReturn {
  devices: NotificationTypes.PushDevice[];
  loading: boolean;
  registering: boolean;
  permission: NotificationPermission | 'unsupported';
  error: string | null;
  loadDevices: () => Promise<void>;
  registerDevice: (name?: string) => Promise<void>;
  unregisterDevice: (deviceId: string) => Promise<void>;
  requestPermission: () => Promise<NotificationPermission | 'unsupported'>;
}

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod|iOS/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'web';
}

function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Unknown device';
  const ua = navigator.userAgent || '';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown';
  return `${browser} on ${os}`;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [devices, setDevices] = useState<NotificationTypes.PushDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [error, setError] = useState<string | null>(null);
  const swRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    } else {
      setPermission('unsupported');
    }
  }, []);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.notifications.listPushDevices();
      setDevices(res.devices ?? []);
    } catch (err: unknown) {
      setError(err instanceof APIError ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const requestPermission = useCallback(async (): Promise<NotificationPermission | 'unsupported'> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return 'unsupported';
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch {
      setPermission('denied');
      return 'denied';
    }
  }, []);

  const registerServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (swRef.current) return swRef.current;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
      swRef.current = reg;
      return reg;
    } catch {
      return null;
    }
  }, []);

  const registerDevice = useCallback(async (name?: string) => {
    setRegistering(true);
    setError(null);
    try {
      const perm = await requestPermission();
      if (perm !== 'granted') {
        setError('Push notification permission was not granted');
        return;
      }

      const platform = detectPlatform();
      const deviceName = name || getDeviceName();
      let token = '';

      if (platform === 'web') {
        const reg = await registerServiceWorker();
        if (!reg) {
          setError('Service workers are not supported in this browser');
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
        });
        token = JSON.stringify(sub.toJSON());
      } else {
        token = `native-${platform}-${Date.now()}`;
      }

      const res = await api.notifications.registerPushDevice({
        platform,
        token,
        device_name: deviceName,
      });
      setDevices((prev) => [...prev, res.device]);
    } catch (err: unknown) {
      setError(err instanceof APIError ? err.message : 'Failed to register device');
    } finally {
      setRegistering(false);
    }
  }, [requestPermission, registerServiceWorker]);

  const unregisterDevice = useCallback(async (deviceId: string) => {
    setError(null);
    try {
      await api.notifications.unregisterPushDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } catch (err: unknown) {
      setError(err instanceof APIError ? err.message : 'Failed to unregister device');
    }
  }, []);

  return {
    devices,
    loading,
    registering,
    permission,
    error,
    loadDevices,
    registerDevice,
    unregisterDevice,
    requestPermission,
  };
}
