'use client';

import { useCallback, useState } from 'react';
import { Bell, Key, Mail, Palette, Shield, User } from 'lucide-react';
import { Tabs } from '@/components';
import { translate, useLocaleStore, type Locale } from '@/stores/locale-store';
import { ProfileSection } from '@/components/settings/profile-section';
import { SecuritySection } from '@/components/settings/security-section';
import { NotificationsSection } from '@/components/settings/notifications-section';
import { AppearanceSection } from '@/components/settings/appearance-section';
import { BillingSection } from '@/components/settings/billing-section';

type TabId =
  | 'profile'
  | 'account'
  | 'notifications'
  | 'appearance'
  | 'security'
  | 'api';

interface TabDef {
  id: TabId;
  key: string;
  Icon: typeof User;
}

const TABS: TabDef[] = [
  { id: 'profile', key: 'profile', Icon: User },
  { id: 'account', key: 'account', Icon: Mail },
  { id: 'notifications', key: 'notifications', Icon: Bell },
  { id: 'appearance', key: 'appearance', Icon: Palette },
  { id: 'security', key: 'security', Icon: Shield },
  { id: 'api', key: 'api', Icon: Key },
];

export default function SettingsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const tt = useCallback(
    (key: string, fallback?: string) => translate(locale, `settings.${key}`, fallback),
    [locale]
  );

  const [tab, setTab] = useState<TabId>('profile');

  const tabs = TABS.map((t) => ({
    id: t.id,
    label: tt(`tabs.${t.key}`, t.key),
    icon: <t.Icon className="h-4 w-4" aria-hidden />,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
          {tt('title', 'Settings')}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {tt('subtitle', 'Manage your account and preferences.')}
        </p>
      </header>

      <Tabs
        tabs={tabs}
        activeTab={tab}
        onChange={(id) => setTab(id as TabId)}
        orientation="vertical"
        variant="pills"
      >
        {(active) => (
          <div className="min-w-0">
            {active === 'profile' && <ProfileSection tt={tt} />}
            {active === 'account' && <SecuritySection tt={tt} />}
            {active === 'notifications' && <NotificationsSection tt={tt} />}
            {active === 'appearance' && <AppearanceSection tt={tt} locale={locale} />}
            {active === 'security' && <SecuritySection tt={tt} />}
            {active === 'api' && <BillingSection tt={tt} />}
          </div>
        )}
      </Tabs>
    </div>
  );
}
