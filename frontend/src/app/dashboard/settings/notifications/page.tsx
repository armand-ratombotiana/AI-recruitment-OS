'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Mail,
  Monitor,
  Plus,
  Save,
  Smartphone,
  Volume2,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import type { NotificationTypes } from '@/services/api/types';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardContent,
  EmptyState,
  Modal,
  Skeleton,
  Switch,
  useNotification,
  useToast,
} from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { DeviceCard } from '@/components/notifications/device-card';
import { cn } from '@/lib/utils';

type Channel = 'email' | 'in_app' | 'push';

interface EventDef {
  key: string;
  labelKey: string;
  descriptionKey: string;
}

interface CategoryDef {
  key: string;
  labelKey: string;
  descriptionKey: string;
  icon: typeof Bell;
  events: EventDef[];
}

const CATEGORIES: CategoryDef[] = [
  {
    key: 'applications',
    labelKey: 'categories.applications',
    descriptionKey: 'categories.applicationsDesc',
    icon: Monitor,
    events: [
      {
        key: 'application_received',
        labelKey: 'events.applicationReceived',
        descriptionKey: 'events.applicationReceived',
      },
      {
        key: 'application_status_changed',
        labelKey: 'events.applicationStatusChanged',
        descriptionKey: 'events.applicationStatusChanged',
      },
      {
        key: 'candidate_shortlisted',
        labelKey: 'events.candidateShortlisted',
        descriptionKey: 'events.candidateShortlisted',
      },
    ],
  },
  {
    key: 'interviews',
    labelKey: 'categories.interviews',
    descriptionKey: 'categories.interviewsDesc',
    icon: Bell,
    events: [
      {
        key: 'interview_scheduled',
        labelKey: 'events.interviewScheduled',
        descriptionKey: 'events.interviewScheduled',
      },
      {
        key: 'interview_reminder',
        labelKey: 'events.interviewReminder',
        descriptionKey: 'events.interviewReminder',
      },
      {
        key: 'interview_rescheduled',
        labelKey: 'events.interviewRescheduled',
        descriptionKey: 'events.interviewRescheduled',
      },
      {
        key: 'interview_feedback_requested',
        labelKey: 'events.interviewFeedbackRequested',
        descriptionKey: 'events.interviewFeedbackRequested',
      },
    ],
  },
  {
    key: 'messages',
    labelKey: 'categories.messages',
    descriptionKey: 'categories.messagesDesc',
    icon: Volume2,
    events: [
      {
        key: 'new_message',
        labelKey: 'events.newMessage',
        descriptionKey: 'events.newMessage',
      },
      {
        key: 'mention',
        labelKey: 'events.mention',
        descriptionKey: 'events.mention',
      },
      {
        key: 'team_reply',
        labelKey: 'events.teamReply',
        descriptionKey: 'events.teamReply',
      },
    ],
  },
  {
    key: 'system',
    labelKey: 'categories.system',
    descriptionKey: 'categories.systemDesc',
    icon: AlertCircle,
    events: [
      {
        key: 'system_alert',
        labelKey: 'events.systemAlert',
        descriptionKey: 'events.systemAlert',
      },
      {
        key: 'security_alert',
        labelKey: 'events.securityAlert',
        descriptionKey: 'events.securityAlert',
      },
      {
        key: 'billing_update',
        labelKey: 'events.billingUpdate',
        descriptionKey: 'events.billingUpdate',
      },
    ],
  },
  {
    key: 'marketing',
    labelKey: 'categories.marketing',
    descriptionKey: 'categories.marketingDesc',
    icon: Smartphone,
    events: [
      {
        key: 'product_updates',
        labelKey: 'events.productUpdates',
        descriptionKey: 'events.productUpdates',
      },
      {
        key: 'newsletter',
        labelKey: 'events.newsletter',
        descriptionKey: 'events.newsletter',
      },
      {
        key: 'tips_and_tricks',
        labelKey: 'events.tipsAndTricks',
        descriptionKey: 'events.tipsAndTricks',
      },
    ],
  },
];

type CategoryState = Record<Channel, boolean>;
type PrefsState = {
  email_enabled: boolean;
  in_app_enabled: boolean;
  push_enabled: boolean;
  categories: Record<string, CategoryState>;
};

const CHANNEL_META: Record<
  Channel,
  { labelKey: string; icon: typeof Mail; descriptionKey: string }
> = {
  email: {
    labelKey: 'channels.email',
    icon: Mail,
    descriptionKey: 'channels.emailDesc',
  },
  in_app: {
    labelKey: 'channels.inApp',
    icon: Monitor,
    descriptionKey: 'channels.inAppDesc',
  },
  push: {
    labelKey: 'channels.push',
    icon: Smartphone,
    descriptionKey: 'channels.pushDesc',
  },
};

function buildDefaultPrefs(): PrefsState {
  const categories: Record<string, CategoryState> = {};
  for (const cat of CATEGORIES) {
    for (const ev of cat.events) {
      categories[ev.key] = {
        email: true,
        in_app: true,
        push: false,
      };
    }
  }
  return {
    email_enabled: true,
    in_app_enabled: true,
    push_enabled: true,
    categories,
  };
}

function fromApi(data: NotificationTypes.NotificationPreferences | null | undefined): PrefsState {
  const base = buildDefaultPrefs();
  if (!data) return base;
  return {
    email_enabled: data.email_enabled ?? true,
    in_app_enabled: data.in_app_enabled ?? true,
    push_enabled: data.push_enabled ?? true,
    categories: mergeCategories(data.categories, base.categories),
  };
}

function mergeCategories(
  incoming: Record<string, { email?: boolean; push?: boolean; in_app?: boolean }> | undefined,
  base: Record<string, CategoryState>
): Record<string, CategoryState> {
  const out: Record<string, CategoryState> = { ...base };
  if (incoming) {
    for (const [key, value] of Object.entries(incoming)) {
      const existing = out[key] || { email: true, in_app: true, push: false };
      out[key] = {
        email: value.email ?? existing.email,
        in_app: value.in_app ?? existing.in_app,
        push: value.push ?? existing.push,
      };
    }
  }
  return out;
}

function toApiPayload(state: PrefsState): NotificationTypes.PreferencesUpdate {
  return {
    email_enabled: state.email_enabled,
    in_app_enabled: state.in_app_enabled,
    push_enabled: state.push_enabled,
    categories: state.categories,
  };
}

export default function NotificationPreferencesPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fallback?: string) =>
      translate(locale, `notifications.settings.${key}`, fallback),
    [locale]
  );
  const commonT = useCallback(
    (key: string, fallback?: string) => translate(locale, `common.${key}`, fallback),
    [locale]
  );
  const { success, error: errorNotify } = useNotification();
  const { push, ToastContainer } = useToast();

  const [prefs, setPrefs] = useState<PrefsState>(() => buildDefaultPrefs());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.notifications
      .getPreferences()
      .then((data) => {
        if (cancelled) return;
        setPrefs(fromApi(data));
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPrefs(buildDefaultPrefs());
        setLoadError(
          err instanceof APIError
            ? err.message
            : t('loadError', 'Could not load your preferences. Defaults are shown.')
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleChannelToggle = useCallback((channel: 'email_enabled' | 'in_app_enabled' | 'push_enabled') => {
    setPrefs((p) => ({ ...p, [channel]: !p[channel] }));
  }, []);

  const handleEventChannelToggle = useCallback(
    (eventKey: string, channel: Channel) => {
      setPrefs((p) => {
        const current = p.categories[eventKey] || {
          email: true,
          in_app: true,
          push: false,
        };
        return {
          ...p,
          categories: {
            ...p.categories,
            [eventKey]: { ...current, [channel]: !current[channel] },
          },
        };
      });
    },
    []
  );

  const handleEnableAllInCategory = useCallback(
    (cat: CategoryDef, enabled: boolean) => {
      setPrefs((p) => {
        const next = { ...p.categories };
        for (const ev of cat.events) {
          const current = next[ev.key] || {
            email: true,
            in_app: true,
            push: false,
          };
          next[ev.key] = {
            email: enabled ? p.email_enabled && current.email || enabled : enabled,
            in_app: enabled ? p.in_app_enabled && current.in_app || enabled : enabled,
            push: enabled ? p.push_enabled && current.push || enabled : enabled,
          };
        }
        return { ...p, categories: next };
      });
    },
    []
  );

  const handleSetAllForChannel = useCallback(
    (channel: Channel, enabled: boolean) => {
      setPrefs((p) => {
        const next = { ...p.categories };
        for (const key of Object.keys(next)) {
          next[key] = { ...next[key], [channel]: enabled };
        }
        return { ...p, categories: next };
      });
    },
    []
  );

  const isChannelEnabled = useCallback(
    (channel: Channel): boolean => {
      if (channel === 'email') return prefs.email_enabled;
      if (channel === 'in_app') return prefs.in_app_enabled;
      return prefs.push_enabled;
    },
    [prefs]
  );

  const isEventChannelEnabled = useCallback(
    (eventKey: string, channel: Channel): boolean => {
      if (!isChannelEnabled(channel)) return false;
      return !!prefs.categories[eventKey]?.[channel];
    },
    [prefs, isChannelEnabled]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await api.notifications.updatePreferences(toApiPayload(prefs));
      setPrefs(fromApi(saved));
      success(t('saved', 'Preferences saved'), t('savedDesc', 'Your notification settings have been updated.'));
    } catch (err: unknown) {
      errorNotify(
        t('saveFailed', 'Save failed'),
        err instanceof APIError ? err.message : 'Could not save preferences'
      );
    } finally {
      setSaving(false);
    }
  }, [prefs, success, errorNotify, t]);

  const summary = useMemo(() => {
    let totalEvents = 0;
    let enabledTotal = 0;
    for (const cat of CATEGORIES) {
      totalEvents += cat.events.length;
      for (const ev of cat.events) {
        if (isEventChannelEnabled(ev.key, 'email')) enabledTotal += 1;
        if (isEventChannelEnabled(ev.key, 'in_app')) enabledTotal += 1;
        if (isEventChannelEnabled(ev.key, 'push')) enabledTotal += 1;
      }
    }
    return { totalEvents, enabledTotal };
  }, [isEventChannelEnabled]);

  if (loading) {
    return (
      <div className="space-y-6">
        <ToastContainer />
        <Breadcrumb />
        <div className="space-y-3" aria-busy="true">
          <Skeleton height={40} />
          <Skeleton height={120} />
          <Skeleton height={300} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer />
      <Breadcrumb />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('title', 'Notification preferences')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle', 'Choose how and where AI-ROS notifies you.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/notifications"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-brand-400 dark:hover:text-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            {commonT('viewAll', 'View all')}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {t('channels.title', 'Channels')}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t(
                  'channels.subtitle',
                  'Master switches for each delivery channel. Turning a channel off silences every event in that channel.'
                )}
              </p>
            </div>
            <Badge variant="info" size="md" dot>
              {summary.enabledTotal} / {summary.totalEvents * 3} {commonT('actions', 'actions')}
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['email', 'in_app', 'push'] as Channel[]).map((ch) => {
              const meta = CHANNEL_META[ch];
              const Icon = meta.icon;
              const enabled =
                ch === 'email'
                  ? prefs.email_enabled
                  : ch === 'in_app'
                    ? prefs.in_app_enabled
                    : prefs.push_enabled;
              return (
                <div
                  key={ch}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                    enabled
                      ? 'border-blue-300 bg-blue-50/50 dark:border-brand-500/40 dark:bg-brand-500/5'
                      : 'border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-800'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                      enabled
                        ? 'bg-blue-100 text-blue-700 dark:bg-brand-500/20 dark:text-brand-300'
                        : 'bg-gray-100 text-gray-500 dark:bg-surface-700 dark:text-gray-400'
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {t(meta.labelKey, ch)}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {t(meta.descriptionKey, '')}
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    onChange={() => {
                      if (ch === 'email') handleChannelToggle('email_enabled');
                      else if (ch === 'in_app') handleChannelToggle('in_app_enabled');
                      else handleChannelToggle('push_enabled');
                    }}
                    aria-label={`${t(meta.labelKey, ch)} ${enabled ? commonT('on', 'on') : commonT('off', 'off')}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-surface-700">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('matrix.enableAll', 'Enable all')}:
            </span>
            {(['email', 'in_app', 'push'] as Channel[]).map((ch) => (
              <Button
                key={`enable-${ch}`}
                size="sm"
                variant="ghost"
                onClick={() => handleSetAllForChannel(ch, true)}
                disabled={!isChannelEnabled(ch)}
                leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
              >
                {t(CHANNEL_META[ch].labelKey, ch)}
              </Button>
            ))}
            <span className="ml-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('matrix.disableAll', 'Disable all')}:
            </span>
            {(['email', 'in_app', 'push'] as Channel[]).map((ch) => (
              <Button
                key={`disable-${ch}`}
                size="sm"
                variant="ghost"
                onClick={() => handleSetAllForChannel(ch, false)}
                disabled={!isChannelEnabled(ch)}
              >
                {t(CHANNEL_META[ch].labelKey, ch)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const allOn = cat.events.every((ev) =>
            (['email', 'in_app', 'push'] as Channel[]).every((ch) => isEventChannelEnabled(ev.key, ch))
          );
          const allOff = cat.events.every((ev) =>
            (['email', 'in_app', 'push'] as Channel[]).every((ch) => !isEventChannelEnabled(ev.key, ch))
          );
          return (
            <Card key={cat.key}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-brand-500/20 dark:text-brand-300"
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {t(cat.labelKey, cat.key)}
                      </h3>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {t(cat.descriptionKey, cat.descriptionKey)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEnableAllInCategory(cat, !allOn)}
                      aria-pressed={allOn}
                    >
                      {allOn
                        ? t('matrix.disableAll', 'Disable all')
                        : t('matrix.enableAll', 'Enable all')}
                    </Button>
                    {allOff && (
                      <Badge variant="warning" size="sm">
                        {commonT('off', 'Off')}
                      </Badge>
                    )}
                    {allOn && (
                      <Badge variant="success" size="sm">
                        {commonT('on', 'On')}
                      </Badge>
                    )}
                  </div>
                </div>
                <div
                  className="mt-3 overflow-hidden rounded-lg border border-gray-200 dark:border-surface-700"
                  role="table"
                  aria-label={`${t(cat.labelKey, cat.key)} events`}
                >
                  <div
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-400"
                    role="row"
                  >
                    <span role="columnheader">{t('matrix.event', 'Event')}</span>
                    <span role="columnheader" className="px-2 text-center">
                      {t('matrix.email', 'Email')}
                    </span>
                    <span role="columnheader" className="px-2 text-center">
                      {t('matrix.inApp', 'In-app')}
                    </span>
                    <span role="columnheader" className="px-2 text-center">
                      {t('matrix.push', 'Push')}
                    </span>
                  </div>
                  {cat.events.map((ev) => (
                    <div
                      key={ev.key}
                      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0 dark:border-surface-700"
                      role="row"
                    >
                      <div className="min-w-0" role="cell">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {t(ev.labelKey, ev.key)}
                        </p>
                        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                          {t(ev.descriptionKey, '')}
                        </p>
                      </div>
                      {(['email', 'in_app', 'push'] as Channel[]).map((ch) => (
                        <div key={ch} className="px-2" role="cell">
                          <ChannelCheckbox
                            checked={isEventChannelEnabled(ev.key, ch)}
                            disabled={!isChannelEnabled(ch)}
                            onChange={() => handleEventChannelToggle(ev.key, ch)}
                            label={`${t(ev.labelKey, ev.key)} — ${t(
                              CHANNEL_META[ch].labelKey,
                              ch
                            )}`}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {CATEGORIES.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Bell className="h-12 w-12" />}
              title={commonT('noData', 'No data')}
              description={t('loadError', 'Could not load your preferences.')}
            />
          </CardContent>
        </Card>
      )}

      <PushDevicesSection t={t} commonT={commonT} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-surface-700 dark:bg-surface-900">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t(
            'channels.subtitle',
            'Master switches for each delivery channel. Turning a channel off silences every event in that channel.'
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="md"
            onClick={() => setPrefs(buildDefaultPrefs())}
            disabled={saving}
          >
            {commonT('reset', 'Reset')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
            leftIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          >
            {saving
              ? t('saving', 'Saving…')
              : t('save', 'Save preferences')}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ChannelCheckboxProps {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
}

function PushDevicesSection({
  t,
  commonT,
}: {
  t: (key: string, fallback?: string) => string;
  commonT: (key: string, fallback?: string) => string;
}) {
  const {
    devices,
    loading,
    registering,
    permission,
    error,
    registerDevice,
    unregisterDevice,
    requestPermission,
  } = usePushNotifications();
  const { success, error: errorNotify } = useNotification();
  const [unregisteringId, setUnregisteringId] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);

  const handleRegister = useCallback(async () => {
    setRegisterError(null);
    try {
      await registerDevice();
      setShowRegisterModal(false);
      setManualToken('');
      success(
        t('pushNotifications.deviceRegistered', 'Device registered'),
        t('pushNotifications.deviceRegisteredDesc', 'You will now receive push notifications on this device.')
      );
    } catch (err: unknown) {
      setRegisterError(err instanceof APIError ? err.message : 'Registration failed');
    }
  }, [registerDevice, success, t]);

  const handleManualRegister = useCallback(async () => {
    if (!manualToken.trim()) {
      setRegisterError(t('pushNotifications.tokenRequired', 'Please enter a device token'));
      return;
    }
    setRegisterError(null);
    try {
      await registerDevice(manualToken.trim());
      setShowRegisterModal(false);
      setManualToken('');
      success(
        t('pushNotifications.deviceRegistered', 'Device registered'),
        t('pushNotifications.deviceRegisteredDesc', 'You will now receive push notifications on this device.')
      );
    } catch (err: unknown) {
      setRegisterError(err instanceof APIError ? err.message : 'Registration failed');
    }
  }, [manualToken, registerDevice, success, t]);

  const handleUnregister = useCallback(async (deviceId: string) => {
    setUnregisteringId(deviceId);
    try {
      await unregisterDevice(deviceId);
      success(
        t('pushNotifications.deviceUnregistered', 'Device unregistered'),
        t('pushNotifications.deviceUnregisteredDesc', 'This device will no longer receive push notifications.')
      );
    } catch (err: unknown) {
      errorNotify(
        t('pushNotifications.unregisterFailed', 'Unregister failed'),
        err instanceof APIError ? err.message : 'Could not unregister device'
      );
    } finally {
      setUnregisteringId(null);
    }
  }, [unregisterDevice, success, errorNotify, t]);

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('pushNotifications.title', 'Push notification devices')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t(
                'pushNotifications.subtitle',
                'Manage devices that receive push notifications from AI-ROS.'
              )}
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            leftIcon={
              registering
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Plus className="h-4 w-4" />
            }
            onClick={() => setShowRegisterModal(true)}
            disabled={registering}
          >
            {t('pushNotifications.registerDevice', 'Register device')}
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {permission === 'denied' && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <span>
                {t(
                  'pushNotifications.permissionDenied',
                  'Push notifications are blocked in your browser. Enable them in your browser settings.'
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => requestPermission()}
                className="self-start"
              >
                {t('pushNotifications.requestPermission', 'Request permission')}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton height={60} />
            <Skeleton height={60} />
          </div>
        ) : devices.length === 0 ? (
          <EmptyState
            icon={<Smartphone className="h-10 w-10" />}
            title={t('pushNotifications.noDevices', 'No devices registered')}
            description={t(
              'pushNotifications.noDevicesDesc',
              'Register a device to receive push notifications when something important happens.'
            )}
          />
        ) : (
          <div className="space-y-3">
            {devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                onUnregister={handleUnregister}
                unregistering={unregisteringId === device.id}
                t={(key, fallback) => t(`pushNotifications.${key}`, fallback)}
              />
            ))}
          </div>
        )}
      </CardContent>

      <Modal
        isOpen={showRegisterModal}
        onClose={() => {
          if (registering) return;
          setShowRegisterModal(false);
          setManualToken('');
          setRegisterError(null);
        }}
        title={t('pushNotifications.registerTitle', 'Register a device')}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t(
              'pushNotifications.registerDesc',
              'Choose how to register your device for push notifications.'
            )}
          </p>

          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 p-4 dark:border-surface-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('pushNotifications.autoRegister', 'Automatic registration')}
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t(
                  'pushNotifications.autoRegisterDesc',
                  'Register this browser automatically using push notifications.'
                )}
              </p>
              <div className="mt-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRegister}
                  loading={registering}
                  leftIcon={
                    registering
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Smartphone className="h-4 w-4" />
                  }
                >
                  {t('pushNotifications.registerThisDevice', 'Register this device')}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4 dark:border-surface-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('pushNotifications.manualEntry', 'Manual entry')}
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t(
                  'pushNotifications.manualEntryDesc',
                  'Enter a device token from a mobile app or another source.'
                )}
              </p>
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder={t('pushNotifications.tokenPlaceholder', 'Enter device token…')}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleManualRegister}
                  disabled={registering || !manualToken.trim()}
                >
                  {t('pushNotifications.submitToken', 'Submit token')}
                </Button>
              </div>
            </div>
          </div>

          {registerError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{registerError}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowRegisterModal(false);
                setManualToken('');
                setRegisterError(null);
              }}
              disabled={registering}
            >
              {commonT('cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function ChannelCheckbox({ checked, disabled, onChange, label }: ChannelCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        checked
          ? 'border-blue-500 bg-blue-600 text-white dark:border-brand-500 dark:bg-brand-500'
          : 'border-gray-300 bg-white text-transparent hover:border-gray-400 dark:border-surface-600 dark:bg-surface-800',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
