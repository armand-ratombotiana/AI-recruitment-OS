'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import type { NotificationTypes } from '@/services/api/types';
import { Button, Switch, useNotification } from '@/components';
import { cn } from '@/lib/utils';

interface NotificationType {
  key: string;
  labelKey: string;
  descriptionKey: string;
}

interface NotificationPreferencesProps {
  types: NotificationType[];
  t: (key: string, fallback?: string) => string;
}

type PrefsMap = Record<string, { email: boolean; push: boolean; in_app: boolean }>;

export function NotificationPreferences({ types, t }: NotificationPreferencesProps) {
  const [prefs, setPrefs] = useState<PrefsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { success, error: errorNotify } = useNotification();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.notifications
      .getPreferences()
      .then((data) => {
        if (cancelled) return;
        const map: PrefsMap = {};
        for (const type of types) {
          map[type.key] = data.categories?.[type.key] ?? {
            email: true,
            push: false,
            in_app: true,
          };
        }
        setPrefs(map);
      })
      .catch(() => {
        if (cancelled) return;
        const map: PrefsMap = {};
        for (const type of types) {
          map[type.key] = { email: true, push: false, in_app: true };
        }
        setPrefs(map);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [types]);

  const togglePref = useCallback((typeKey: string, channel: 'email' | 'push' | 'in_app') => {
    setPrefs((prev) => ({
      ...prev,
      [typeKey]: {
        ...prev[typeKey],
        [channel]: !prev[typeKey]?.[channel],
      },
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload: NotificationTypes.PreferencesUpdate = { categories: prefs };
      await api.notifications.updatePreferences(payload);
      success(
        t('saved', 'Preferences saved'),
        t('savedDesc', 'Your notification settings have been updated.')
      );
    } catch (err: unknown) {
      errorNotify(
        t('saveFailed', 'Save failed'),
        err instanceof APIError ? err.message : 'Could not save preferences'
      );
    } finally {
      setSaving(false);
    }
  }, [prefs, success, errorNotify, t]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {types.map((type) => (
          <div
            key={type.key}
            className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-surface-800"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-surface-700">
        <div
          className={cn(
            'grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b bg-gray-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500',
            'border-gray-200 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-400'
          )}
        >
          <span>{t('type', 'Notification type')}</span>
          <span className="px-2 text-center">{t('channelEmail', 'Email')}</span>
          <span className="px-2 text-center">{t('channelPush', 'Push')}</span>
          <span className="px-2 text-center">{t('channelInApp', 'In-app')}</span>
        </div>
        {types.map((type, idx) => {
          const current = prefs[type.key] || { email: true, push: false, in_app: true };
          return (
            <div
              key={type.key}
              className={cn(
                'grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3',
                idx < types.length - 1 && 'border-b border-gray-100 dark:border-surface-700'
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t(type.labelKey, type.key)}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {t(type.descriptionKey, '')}
                </p>
              </div>
              {(['email', 'push', 'in_app'] as const).map((channel) => (
                <div key={channel} className="flex justify-center px-2">
                  <Switch
                    checked={!!current[channel]}
                    onChange={() => togglePref(type.key, channel)}
                    label={`${type.key}-${channel}`}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button
          variant="primary"
          leftIcon={
            saving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />
          }
          onClick={handleSave}
          loading={saving}
        >
          {saving ? t('saving', 'Saving…') : t('save', 'Save preferences')}
        </Button>
      </div>
    </div>
  );
}
