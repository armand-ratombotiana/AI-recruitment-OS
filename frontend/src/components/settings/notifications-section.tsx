import { useEffect, useState } from 'react';
import { Bell, Loader2, Mail, Monitor, Save } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import type { NotificationTypes } from '@/services/api/types';
import { Button, Skeleton, Switch, useNotification } from '@/components';
import { cn } from '@/lib/utils';

type TFunc = (key: string, fallback?: string) => string;

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm dark:border-surface-700 dark:bg-surface-900">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

interface NotificationGroup {
  key: string;
  titleKey: string;
  items: { key: string; labelKey: string; descriptionKey: string }[];
}

const NOTIFICATION_GROUPS: NotificationGroup[] = [
  {
    key: 'email',
    titleKey: 'email',
    items: [
      { key: 'new_candidate', labelKey: 'newCandidate', descriptionKey: 'newCandidateDesc' },
      { key: 'interview_scheduled', labelKey: 'interviewScheduled', descriptionKey: 'interviewScheduledDesc' },
      { key: 'offer_status', labelKey: 'offerStatus', descriptionKey: 'offerStatusDesc' },
      { key: 'weekly_digest', labelKey: 'weeklyDigest', descriptionKey: 'weeklyDigestDesc' },
    ],
  },
  {
    key: 'push',
    titleKey: 'push',
    items: [
      { key: 'mentions', labelKey: 'mentions', descriptionKey: 'mentionsDesc' },
      { key: 'urgent_only', labelKey: 'urgentOnly', descriptionKey: 'urgentOnlyDesc' },
    ],
  },
  {
    key: 'in_app',
    titleKey: 'inApp',
    items: [
      { key: 'all_activity', labelKey: 'allActivity', descriptionKey: 'allActivityDesc' },
    ],
  },
];

function ChannelCard({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors',
        checked
          ? 'border-blue-300 bg-blue-50/50 dark:border-brand-500/40 dark:bg-brand-500/5'
          : 'border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-800'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            checked
              ? 'bg-blue-100 text-blue-700 dark:bg-brand-500/20 dark:text-brand-300'
              : 'bg-gray-100 text-gray-500 dark:bg-surface-700 dark:text-gray-400'
          )}
          aria-hidden
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function NotificationsSection({ tt }: { tt: TFunc }) {
  type Prefs = NotificationTypes.NotificationPreferences;
  const [prefs, setPrefs] = useState<Prefs>({
    email_enabled: true,
    push_enabled: true,
    in_app_enabled: true,
    categories: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { success, error: errorNotify } = useNotification();

  useEffect(() => {
    let cancelled = false;
    api.notifications
      .getPreferences()
      .then((data: Prefs) => {
        if (cancelled || !data) return;
        setPrefs({
          email_enabled: data.email_enabled ?? true,
          push_enabled: data.push_enabled ?? true,
          in_app_enabled: data.in_app_enabled ?? true,
          categories: data.categories || {},
        });
      })
      .catch(() => {
        /* keep defaults */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.notifications.updatePreferences(prefs);
      success(
        tt('notifications.saved', 'Preferences saved'),
        tt('notifications.savedDesc', 'Your notification settings have been updated.')
      );
    } catch (err: unknown) {
      errorNotify(
        tt('notifications.saveFailed', 'Save failed'),
        err instanceof APIError ? err.message : 'Could not save preferences'
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleChannel = (channel: 'email_enabled' | 'push_enabled' | 'in_app_enabled') => {
    setPrefs((p) => ({ ...p, [channel]: !p[channel] }));
  };

  const isItemEnabled = (group: NotificationGroup, itemKey: string): boolean => {
    const channel = group.key === 'email' ? 'email' : group.key === 'push' ? 'push' : 'in_app';
    const item = prefs.categories?.[itemKey];
    if (!item) return group.key === 'in_app';
    return item[channel as 'email' | 'push' | 'in_app'] !== false;
  };

  const toggleItem = (group: NotificationGroup, itemKey: string) => {
    const channelKey = group.key === 'email' ? 'email' : group.key === 'push' ? 'push' : 'in_app';
    setPrefs((p) => {
      const current = p.categories?.[itemKey] || {
        email: true,
        push: true,
        in_app: true,
      };
      return {
        ...p,
        categories: {
          ...p.categories,
          [itemKey]: {
            email: current.email,
            push: current.push,
            in_app: current.in_app,
            [channelKey]: !isItemEnabled(group, itemKey),
          },
        },
      };
    });
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton height={40} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section
        title={tt('notifications.channels', 'Channels')}
        description={tt(
          'notifications.channelsDesc',
          'Decide which channels can notify you. Individual event preferences can be fine-tuned below.'
        )}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <ChannelCard
            icon={<Mail className="h-5 w-5" />}
            label={tt('notifications.email', 'Email')}
            description={tt(
              'notifications.emailDesc',
              'Daily summaries, digests, and important alerts.'
            )}
            checked={prefs.email_enabled}
            onChange={() => toggleChannel('email_enabled')}
          />
          <ChannelCard
            icon={<Bell className="h-5 w-5" />}
            label={tt('notifications.push', 'Push')}
            description={tt(
              'notifications.pushDesc',
              'Real-time alerts in your browser.'
            )}
            checked={prefs.push_enabled}
            onChange={() => toggleChannel('push_enabled')}
          />
          <ChannelCard
            icon={<Monitor className="h-5 w-5" />}
            label={tt('notifications.inApp', 'In-app')}
            description={tt(
              'notifications.inAppDesc',
              'The notification bell inside AI-ROS.'
            )}
            checked={prefs.in_app_enabled}
            onChange={() => toggleChannel('in_app_enabled')}
          />
        </div>
      </Section>

      {NOTIFICATION_GROUPS.map((group) => {
        const groupEnabled =
          group.key === 'email'
            ? prefs.email_enabled
            : group.key === 'push'
              ? prefs.push_enabled
              : prefs.in_app_enabled;
        return (
          <Section
            key={group.key}
            title={tt(`notifications.${group.titleKey}`, group.titleKey)}
            description={tt(
              `notifications.${group.key}Desc`,
              'Choose which events trigger a notification on this channel.'
            )}
          >
            <div className="divide-y divide-gray-100 dark:divide-surface-700">
              {group.items.map((item) => {
                const enabled = isItemEnabled(group, item.key) && groupEnabled;
                return (
                  <div
                    key={item.key}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {tt(`notifications.items.${item.labelKey}`, item.labelKey)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {tt(`notifications.items.${item.descriptionKey}`, item.descriptionKey)}
                      </p>
                    </div>
                    <Switch
                      checked={enabled}
                      onChange={() => toggleItem(group, item.key)}
                      disabled={!groupEnabled}
                      label={enabled ? tt('common.on', 'On') : tt('common.off', 'Off')}
                    />
                  </div>
                );
              })}
            </div>
          </Section>
        );
      })}

      <div className="flex justify-end">
        <Button
          variant="primary"
          leftIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          onClick={save}
          loading={saving}
        >
          {saving ? tt('common.saving', 'Saving…') : tt('notifications.save', 'Save preferences')}
        </Button>
      </div>
    </div>
  );
}
