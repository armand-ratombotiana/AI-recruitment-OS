'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const TABS = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'security', label: 'Security', icon: '🔒' },
  { id: 'api', label: 'API', icon: '🔑' },
];

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-blue-600' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        enabled ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');

  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    phone: '',
    timezone: 'America/New_York',
    avatar: '',
  });

  const [notifications, setNotifications] = useState({
    email_interviews: true,
    email_new_candidates: true,
    email_daily_digest: false,
    push_interviews: true,
    push_new_candidates: false,
    in_app_all: true,
  });

  const [security, setSecurity] = useState({
    twoFactorEnabled: false,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [apiKey] = useState('ak_live_••••••••••••••••••••••••••••••••');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('airos_user') : null;
    if (stored) {
      try {
        const user = JSON.parse(stored);
        setProfile(p => ({
          ...p,
          full_name: user.full_name || '',
          email: user.email || '',
        }));
      } catch {}
    }
  }, []);

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText('ak_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    setSaving(false);
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    setSaving(false);
  };

  const handleSaveSecurity = async () => {
    if (security.newPassword !== security.confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    setSaving(false);
    setSecurity(p => ({ ...p, currentPassword: '', newPassword: '', confirmPassword: '' }));
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-500">Manage your workspace and preferences</p>
      </div>

      <div className="flex border-b border-gray-200">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <Card>
          <CardHeader>
            <CardTitle>Profile Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl font-bold text-blue-700">
                  {profile.full_name ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'U'}
                </span>
              </div>
              <div>
                <Button variant="secondary" size="sm">Change Avatar</Button>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG or GIF. Max 2MB.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name</label>
                <input
                  value={profile.full_name}
                  onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  value={profile.phone}
                  onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="+1 555 0123"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Timezone</label>
                <select
                  value={profile.timezone}
                  onChange={e => setProfile(p => ({ ...p, timezone: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Denver">Mountain Time (MT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="Europe/London">London (GMT)</option>
                  <option value="Europe/Paris">Paris (CET)</option>
                  <option value="Asia/Tokyo">Tokyo (JST)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'notifications' && (
        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Email Notifications</h3>
              <div className="space-y-3">
                {[
                  { key: 'email_interviews' as const, label: 'Interview reminders', desc: 'Get notified before scheduled interviews' },
                  { key: 'email_new_candidates' as const, label: 'New candidates', desc: 'Alert when a new candidate is added' },
                  { key: 'email_daily_digest' as const, label: 'Daily digest', desc: 'Receive a daily summary of activity' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-gray-500">{item.desc}</p>
                    </div>
                    <Toggle
                      enabled={notifications[item.key]}
                      onChange={v => setNotifications(p => ({ ...p, [item.key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Push Notifications</h3>
              <div className="space-y-3">
                {[
                  { key: 'push_interviews' as const, label: 'Interview updates', desc: 'Real-time push for interview changes' },
                  { key: 'push_new_candidates' as const, label: 'New candidates', desc: 'Push notification for new candidates' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-gray-500">{item.desc}</p>
                    </div>
                    <Toggle
                      enabled={notifications[item.key]}
                      onChange={v => setNotifications(p => ({ ...p, [item.key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">In-App Notifications</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">Show all activity</p>
                    <p className="text-xs text-gray-500">Display all notifications in the app</p>
                  </div>
                  <Toggle
                    enabled={notifications.in_app_all}
                    onChange={v => setNotifications(p => ({ ...p, in_app_all: v }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveNotifications} disabled={saving}>
                {saving ? 'Saving...' : 'Save Preferences'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'security' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {security.twoFactorEnabled ? 'Two-factor authentication is enabled' : 'Two-factor authentication is disabled'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Add an extra layer of security to your account
                  </p>
                </div>
                <Toggle
                  enabled={security.twoFactorEnabled}
                  onChange={v => setSecurity(p => ({ ...p, twoFactorEnabled: v }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Current Password</label>
                <input
                  type="password"
                  value={security.currentPassword}
                  onChange={e => setSecurity(p => ({ ...p, currentPassword: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <input
                  type="password"
                  value={security.newPassword}
                  onChange={e => setSecurity(p => ({ ...p, newPassword: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={security.confirmPassword}
                  onChange={e => setSecurity(p => ({ ...p, confirmPassword: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveSecurity} disabled={saving || !security.currentPassword || !security.newPassword}>
                  {saving ? 'Updating...' : 'Update Password'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'api' && (
        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              Use API keys to authenticate requests from your applications.
            </p>

            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Production Key</span>
                  <Badge variant="success">Active</Badge>
                </div>
                <span className="text-xs text-gray-400">Created Jan 1, 2026</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-50 rounded px-3 py-2 text-sm font-mono text-gray-700">
                  {apiKey}
                </code>
                <button
                  onClick={handleCopyApiKey}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <span className="text-amber-600 mt-0.5">⚠️</span>
                <div>
                  <p className="text-sm font-medium text-amber-800">Keep your API key secret</p>
                  <p className="text-xs text-amber-600 mt-1">
                    Do not share your API key in publicly accessible areas such as GitHub, client-side code, or logs.
                  </p>
                </div>
              </div>
            </div>

            <Button variant="secondary">Generate New Key</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
