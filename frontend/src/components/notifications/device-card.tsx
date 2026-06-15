'use client';

import { useCallback } from 'react';
import { Loader2, Monitor, Smartphone, Trash2 } from 'lucide-react';
import type { NotificationTypes } from '@/services/api/types';
import { Badge, Button } from '@/components';
import { cn } from '@/lib/utils';

interface DeviceCardProps {
  device: NotificationTypes.PushDevice;
  onUnregister: (deviceId: string) => void;
  unregistering?: boolean;
  t: (key: string, fallback?: string) => string;
}

const PLATFORM_ICONS: Record<string, typeof Smartphone> = {
  ios: Smartphone,
  android: Smartphone,
  web: Monitor,
};

const PLATFORM_LABELS: Record<string, string> = {
  ios: 'iOS',
  android: 'Android',
  web: 'Web',
};

export function DeviceCard({ device, onUnregister, unregistering, t }: DeviceCardProps) {
  const PlatformIcon = PLATFORM_ICONS[device.platform] || Monitor;
  const platformLabel = PLATFORM_LABELS[device.platform] || device.platform;

  const lastActive = useCallback((iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }, []);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between',
        'border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900'
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            device.platform === 'ios'
              ? 'bg-gray-100 text-gray-700 dark:bg-surface-800 dark:text-gray-200'
              : device.platform === 'android'
                ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                : 'bg-blue-100 text-blue-700 dark:bg-brand-500/20 dark:text-brand-300'
          )}
          aria-hidden="true"
        >
          <PlatformIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {device.device_name}
            </p>
            <Badge variant="default" size="sm">
              {platformLabel}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {t('lastActive', 'Last active')}: {lastActive(device.last_active_at)}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={
          unregistering
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />
        }
        onClick={() => onUnregister(device.id)}
        disabled={unregistering}
        className="self-start sm:self-auto"
      >
        {t('unregister', 'Unregister')}
      </Button>
    </div>
  );
}
