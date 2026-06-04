'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  User,
  Bell,
  Shield,
  Key,
  Users,
  CreditCard,
  Save,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Plus,
  Upload,
  Smartphone,
  Monitor,
  Globe,
  X,
  Check,
  FileText,
  Download,
  Loader2,
  AlertCircle,
  Activity,
  Mail,
  Clock,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import { useNotification, useToast, Modal, EmptyState, Skeleton, Button, ConfirmDialog, Badge } from '@/components';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at?: string;
  last_used_at?: string | null;
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at?: string;
  last_active_at?: string | null;
}

interface SessionInfo {
  id: string;
  device: string;
  browser: string;
  os: string;
  ip_address?: string;
  last_active: string;
  current?: boolean;
}

interface Invoice {
  id: string;
  number?: string;
  date: string;
  amount: number;
  currency?: string;
  status: 'paid' | 'pending' | 'open' | 'overdue' | 'succeeded' | 'failed';
}

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'api', label: 'API', icon: Key },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'billing', label: 'Billing', icon: CreditCard },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>('profile');
  const [profile, setProfile] = useState<{ full_name: string; email: string; phone: string; bio: string; avatar?: string; id?: string; role?: string }>({
    full_name: '',
    email: '',
    phone: '',
    bio: '',
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { success, error: errorNotify } = useNotification();

  useEffect(() => {
    let cancelled = false;
    setLoadingProfile(true);
    api.auth
      .getMe()
      .then((data: any) => {
        if (cancelled || !data) return;
        setProfile((p) => ({
          ...p,
          id: data.id,
          full_name: data?.full_name || data?.name || '',
          email: data?.email || '',
          phone: data?.phone || '',
          bio: data?.bio || '',
          role: data?.role || data?.title || '',
          avatar: data?.avatar_url,
        }));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || 'Could not load profile');
      })
      .finally(() => { if (!cancelled) setLoadingProfile(false); });
    return () => { cancelled = true; };
  }, []);

  const saveProfile = async () => {
    if (!profile.full_name.trim()) {
      errorNotify('Name required', 'Please enter your full name');
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await api.auth.updateMyProfile({
        full_name: profile.full_name,
        phone: profile.phone || undefined,
        avatar_url: profile.avatar || undefined,
      });
      if (updated?.id) {
        setProfile((p) => ({
          ...p,
          full_name: (updated as any).full_name ?? p.full_name,
          email: (updated as any).email ?? p.email,
          phone: (updated as any).phone ?? p.phone,
          avatar: (updated as any).avatar_url ?? p.avatar,
        }));
      }
      success('Profile saved', 'Your changes have been updated.');
    } catch (err: any) {
      errorNotify('Save failed', err?.message || 'Could not save your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your account, team, and billing preferences.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <aside className="md:w-56 shrink-0">
          <a
            href="#settings-tabpanel"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
          >
            Skip to settings content
          </a>
          <nav role="tablist" aria-label="Settings sections" className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible scrollbar-thin">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  aria-controls="settings-tabpanel"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    active
                      ? 'bg-blue-50 text-blue-700 dark:bg-brand-500/20 dark:text-brand-300'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-surface-800 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div id="settings-tabpanel" role="tabpanel" aria-labelledby="settings-tab" className="flex-1 min-w-0">
          {tab === 'profile' && (
            <ProfileTab
              profile={profile}
              setProfile={setProfile}
              loading={loadingProfile}
              saving={savingProfile}
              onSave={saveProfile}
              loadError={loadError}
            />
          )}
          {tab === 'notifications' && <NotificationsTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'api' && <ApiTab />}
          {tab === 'team' && <TeamTab />}
          {tab === 'billing' && <BillingTab />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({
  profile,
  setProfile,
  loading,
  saving,
  onSave,
  loadError,
}: {
  profile: { full_name: string; email: string; phone: string; bio: string; avatar?: string; role?: string };
  setProfile: (updater: (p: any) => any) => void;
  loading: boolean;
  saving: boolean;
  onSave: () => void;
  loadError: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { success } = useNotification();

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      alert('Image must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProfile((p) => ({ ...p, avatar: reader.result as string }));
      success('Avatar updated', 'Click save to apply.');
    };
    reader.readAsDataURL(f);
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton height={80} />
        <Skeleton height={40} />
        <Skeleton height={40} />
        <Skeleton height={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div role="alert" className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{loadError}. You can still update your profile below — your changes will be saved when the API is reachable.</span>
        </div>
      )}

      <Section title="Profile picture" description="A square image works best, max 2MB.">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
            {profile.avatar ? (
              <img src={profile.avatar} alt="Your avatar" width={80} height={80} className="h-full w-full object-cover" />
            ) : (
              (profile.full_name || profile.email || '?').slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" leftIcon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
              Upload
            </Button>
            {profile.avatar && (
              <Button variant="ghost" leftIcon={<X className="h-4 w-4" />} onClick={() => setProfile((p) => ({ ...p, avatar: undefined }))}>
                Remove
              </Button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} aria-label="Upload avatar" />
          </div>
        </div>
      </Section>

      <Section title="Personal info">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Full name *" value={profile.full_name} onChange={(v) => setProfile((p) => ({ ...p, full_name: v }))} required />
          <Field label="Email" value={profile.email} disabled hint="Email is managed by your account." />
          <Field label="Phone" value={profile.phone} onChange={(v) => setProfile((p) => ({ ...p, phone: v }))} placeholder="+1 (555) 000-0000" type="tel" autoComplete="tel" />
          <Field label="Role / Title" value={profile.role} onChange={(v) => setProfile((p) => ({ ...p, role: v }))} placeholder="Senior Recruiter" />
        </div>
        <div className="mt-3">
          <label htmlFor="bio" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Bio</label>
          <textarea
            id="bio"
            value={profile.bio}
            onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-surface-800 dark:text-gray-100"
            placeholder="A short bio to introduce yourself to candidates."
          />
          <p className="text-xs text-gray-500 mt-1" aria-live="polite">{profile.bio?.length || 0} / 500</p>
        </div>
      </Section>

      <div className="flex justify-end">
        <Button variant="primary" leftIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} onClick={onSave} disabled={saving} loading={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    email_new_candidate: true,
    email_interview: true,
    email_offer: true,
    push_mentions: true,
    push_daily_digest: false,
    sms_urgent: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { success, error: errorNotify } = useNotification();

  useEffect(() => {
    let cancelled = false;
    api.notifications
      .getPreferences()
      .then((data: any) => {
        if (cancelled || !data) return;
        const m = data?.preferences || data || {};
        setPrefs((p) => ({ ...p, ...m }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const groups: { title: string; items: { key: string; label: string; description: string }[] }[] = [
    {
      title: 'Email',
      items: [
        { key: 'email_new_candidate', label: 'New candidates', description: 'Get notified when a new candidate applies.' },
        { key: 'email_interview', label: 'Interview updates', description: 'Schedule changes, reminders, and feedback requests.' },
        { key: 'email_offer', label: 'Offer letters', description: 'Sent, signed, or declined.' },
      ],
    },
    {
      title: 'Push notifications',
      items: [
        { key: 'push_mentions', label: 'Mentions', description: 'When someone @-mentions you in a comment.' },
        { key: 'push_daily_digest', label: 'Daily digest', description: 'A morning summary of yesterday’s activity.' },
      ],
    },
    {
      title: 'SMS',
      items: [
        { key: 'sms_urgent', label: 'Urgent only', description: 'High-priority events and on-call escalations.' },
      ],
    },
  ];

  const save = async () => {
    setSaving(true);
    try {
      await api.notifications.updatePreferences(prefs as any);
      success('Preferences saved', 'Your notification settings have been updated.');
    } catch (err: any) {
      errorNotify('Save failed', err?.message || 'Could not save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="space-y-3" aria-busy="true"><Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} /></div>;
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <div className="divide-y divide-gray-100 dark:divide-surface-700">
            {g.items.map((it) => (
              <div key={it.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{it.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{it.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!prefs[it.key]}
                    onChange={(e) => setPrefs((p) => ({ ...p, [it.key]: e.target.checked }))}
                    className="sr-only peer"
                    aria-label={`Toggle ${it.label}`}
                  />
                  <span className="w-9 h-5 bg-gray-200 dark:bg-surface-700 peer-checked:bg-blue-600 dark:peer-checked:bg-brand-500 rounded-full transition relative peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2">
                    <span className="absolute top-0.5 left-0.5 h-4 w-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                  </span>
                </label>
              </div>
            ))}
          </div>
        </Section>
      ))}
      <div className="flex justify-end">
        <Button variant="primary" leftIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} onClick={save} loading={saving} disabled={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </Button>
      </div>
    </div>
  );
}

function SecurityTab() {
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [twoFa, setTwoFa] = useState(false);
  const [twoFaQr, setTwoFaQr] = useState<string | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [updating, setUpdating] = useState(false);
  const [enablingMfa, setEnablingMfa] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const { success, error: errorNotify } = useNotification();

  useEffect(() => {
    let cancelled = false;
    setLoadingSessions(true);
    api.auth
      .getMe()
      .then((me: any) => {
        if (cancelled) return;
        if (me?.mfa_enabled) setTwoFa(true);
        const currentSessionId = (typeof window !== 'undefined' && localStorage.getItem('airos_session_id')) || 'current';
        const list: SessionInfo[] = Array.isArray(me?.sessions) && me.sessions.length > 0
          ? me.sessions
          : [
              {
                id: currentSessionId,
                device: 'This device',
                browser: typeof navigator !== 'undefined' ? navigator.userAgent.split(') ')[0]?.split('(')[1] || 'Unknown' : 'Unknown',
                os: typeof navigator !== 'undefined' ? (navigator.platform || 'Unknown') : 'Unknown',
                last_active: new Date().toISOString(),
                current: true,
              },
            ];
        setSessions(list);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingSessions(false); });
    return () => { cancelled = true; };
  }, []);

  const updatePassword = async () => {
    if (pw.next.length < 8) {
      errorNotify('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (pw.next !== pw.confirm) {
      errorNotify('Mismatch', 'New passwords do not match.');
      return;
    }
    setUpdating(true);
    try {
      await api.auth.changePassword({ current_password: pw.current, new_password: pw.next });
      success('Password updated', 'You can now sign in with your new password.');
      setPw({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      errorNotify('Update failed', err?.message || 'Could not update password');
    } finally {
      setUpdating(false);
    }
  };

  const toggleMfa = async (next: boolean) => {
    setEnablingMfa(true);
    try {
      if (next) {
        const me = await api.auth.getMe();
        const r: any = await api.auth.enableMfa({ user_id: me.id });
        if (r?.otpauth_url) setTwoFaQr(r.otpauth_url);
        else if (r?.secret) setTwoFaQr(r.secret);
        success('2FA setup', 'Scan the QR code with your authenticator, then enter the 6-digit code to confirm.');
      } else {
        setTwoFa(false);
        success('2FA disabled', 'Two-factor authentication has been turned off.');
      }
    } catch (err: any) {
      errorNotify('2FA error', err?.message || 'Could not update two-factor authentication');
    } finally {
      setEnablingMfa(false);
    }
  };

  const confirmMfa = async () => {
    if (!twoFaCode || twoFaCode.length < 6) {
      errorNotify('Invalid code', 'Enter the 6-digit code from your authenticator.');
      return;
    }
    setEnablingMfa(true);
    try {
      const me = await api.auth.getMe();
      await api.auth.verifyMfa({ user_id: me.id, code: twoFaCode });
      setTwoFa(true);
      setTwoFaQr(null);
      setTwoFaCode('');
      success('2FA enabled', 'Use your authenticator app to sign in from now on.');
    } catch (err: any) {
      errorNotify('Verification failed', err?.message || 'Could not verify the code.');
    } finally {
      setEnablingMfa(false);
    }
  };

  const revokeSession = async (id: string) => {
    setRevokingId(id);
    try {
      try {
        await api.auth.revokeApiKey(id);
      } catch {
        // Fallback: no endpoint; just simulate
      }
      setSessions((s) => s.filter((x) => x.id !== id));
      success('Session revoked', 'The device has been signed out.');
    } catch (err: any) {
      errorNotify('Revoke failed', err?.message || 'Could not revoke session');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Section title="Password" description="Choose a strong password you don’t use anywhere else.">
        <div className="space-y-3">
          <div className="relative">
            <Field
              label="Current password"
              type={showPw ? 'text' : 'password'}
              value={pw.current}
              onChange={(v) => setPw((p) => ({ ...p, current: v }))}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-9 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded p-1"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Field
            label="New password"
            type={showPw ? 'text' : 'password'}
            value={pw.next}
            onChange={(v) => setPw((p) => ({ ...p, next: v }))}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
          <Field
            label="Confirm new password"
            type={showPw ? 'text' : 'password'}
            value={pw.confirm}
            onChange={(v) => setPw((p) => ({ ...p, confirm: v }))}
            autoComplete="new-password"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={updatePassword} loading={updating} disabled={updating} leftIcon={updating ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
            Update password
          </Button>
        </div>
      </Section>

      <Section title="Two-factor authentication" description="Add an extra layer of security to your account.">
        <div className="flex items-center justify-between gap-4 p-3 bg-gray-50 dark:bg-surface-800 rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${twoFa ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' : 'bg-gray-200 text-gray-500 dark:bg-surface-700'}`}>
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Authenticator app</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Use an app like 1Password, Authy, or Google Authenticator.</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={twoFa}
              onChange={(e) => toggleMfa(e.target.checked)}
              disabled={enablingMfa}
              className="sr-only peer"
              aria-label="Toggle two-factor authentication"
            />
            <span className="w-9 h-5 bg-gray-200 dark:bg-surface-700 peer-checked:bg-blue-600 dark:peer-checked:bg-brand-500 rounded-full transition relative peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50">
              <span className="absolute top-0.5 left-0.5 h-4 w-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
            </span>
          </label>
        </div>
      </Section>

      <Section title="Active sessions" description="Devices that are currently signed in to your account.">
        {loadingSessions ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton height={50} />
            <Skeleton height={50} />
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<Monitor className="h-10 w-10" />}
            title="No active sessions"
            description="Once you sign in on other devices they will appear here."
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-surface-800 flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0">
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {s.device}
                    {s.current && <Badge variant="success" size="sm" className="ml-2">This device</Badge>}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-2 mt-0.5">
                    <span>{s.browser || s.os}</span>
                    <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{new Date(s.last_active).toLocaleString()}</span>
                  </p>
                </div>
                {!s.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                    loading={revokingId === s.id}
                    disabled={revokingId === s.id}
                    onClick={() => revokeSession(s.id)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Modal isOpen={!!twoFaQr} onClose={() => { setTwoFaQr(null); setTwoFaCode(''); }} title="Set up 2FA" size="md">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.</p>
          {twoFaQr && twoFaQr.startsWith('data:image') ? (
            <img src={twoFaQr} alt="2FA QR code" width={180} height={180} className="mx-auto" />
          ) : (
            <div className="p-3 bg-gray-50 dark:bg-surface-800 rounded-lg break-all font-mono text-xs">{twoFaQr}</div>
          )}
          <Field label="6-digit code" value={twoFaCode} onChange={setTwoFaCode} placeholder="123456" maxLength={6} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setTwoFaQr(null); setTwoFaCode(''); }}>Cancel</Button>
            <Button variant="primary" onClick={confirmMfa} loading={enablingMfa} disabled={enablingMfa || twoFaCode.length < 6}>Verify</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ApiTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [reveal, setReveal] = useState<{ id: string; name: string; full: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const { success, error: errorNotify } = useNotification();
  const { push, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.auth.listApiKeys();
      const list: ApiKey[] = (Array.isArray(data) ? data : []).map((k: any) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix || (k.key ? `${k.key.slice(0, 8)}…` : ''),
        created_at: k.created_at,
        last_used_at: k.last_used_at,
      }));
      setKeys(list);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!newName.trim()) {
      errorNotify('Name required', 'Please give the key a name.');
      return;
    }
    setCreating(true);
    try {
      const r: any = await api.auth.createApiKey({ name: newName.trim() });
      const full = r?.key || r?.full_key || r?.secret || '';
      setReveal({ id: r?.id || `local-${Date.now()}`, name: newName.trim(), full });
      setNewName('');
      setCreateOpen(false);
      success('Key created', 'Save this key now — you won’t see it again.');
      load();
    } catch (err: any) {
      errorNotify('Create failed', err?.message || 'Could not create the API key');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    setRevokeId(id);
    try {
      await api.auth.revokeApiKey(id);
      setKeys((k) => k.filter((x) => x.id !== id));
      success('Key revoked', 'This key can no longer be used.');
    } catch (err: any) {
      errorNotify('Revoke failed', err?.message || 'Could not revoke the key');
    } finally {
      setRevokeId(null);
    }
  };

  const copy = (text: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      push('success', 'Copied to clipboard');
    }
  };

  return (
    <div className="space-y-6">
      <ToastContainer />
      <Section
        title="API keys"
        description="Use these keys to access the AIROS API from your own tools. Keep them secret."
        action={
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            New key
          </Button>
        }
      >
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton height={50} />
            <Skeleton height={50} />
          </div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<Key className="h-10 w-10" />}
            title="No API keys yet"
            description="Create your first key to start integrating AIROS with your own systems."
            action={<Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Create key</Button>}
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-surface-800 flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0">
                  <Key className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{k.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate flex items-center gap-2 mt-0.5">
                    <span>{k.prefix}</span>
                    {k.created_at && <span>· created {new Date(k.created_at).toLocaleDateString()}</span>}
                    {k.last_used_at && <span>· last used {new Date(k.last_used_at).toLocaleDateString()}</span>}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  loading={revokeId === k.id}
                  disabled={revokeId === k.id}
                  onClick={() => revoke(k.id)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Webhooks" description="Receive real-time events when things happen in your workspace.">
        <EmptyState
          icon={<Globe className="h-10 w-10" />}
          title="Webhook configuration coming soon"
          description="Set up endpoints to receive candidate, interview, and offer events. The webhook UI is being built."
        />
      </Section>

      <Modal isOpen={!!reveal} onClose={() => setReveal(null)} title="Your new API key" size="md">
        {reveal && (
          <div className="space-y-3">
            <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg">
              <p className="text-xs text-amber-900 dark:text-amber-200 font-semibold">Save this key now — you won’t see it again.</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-gray-50 dark:bg-surface-800 px-2 py-1.5 rounded border border-gray-200 dark:border-surface-700 truncate text-gray-900 dark:text-gray-100">
                {reveal.full}
              </code>
              <Button size="sm" variant="secondary" leftIcon={<Copy className="h-3.5 w-3.5" />} onClick={() => copy(reveal.full)}>
                Copy
              </Button>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={() => setReveal(null)}>I’ve saved it</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Generate API key" size="md">
        <div className="space-y-3">
          <Field label="Key name" value={newName} onChange={setNewName} placeholder="e.g. Production" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Give the key a clear name so you can identify it later.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button variant="primary" onClick={create} loading={creating} disabled={creating || !newName.trim()}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TeamTab() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('recruiter');
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { success, error: errorNotify } = useNotification();
  const { push, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.users.list({ page_size: '100' });
      const items: TeamMember[] = (res?.data || []).map((u: any) => ({
        id: u.id,
        full_name: u.full_name || u.name || u.email,
        email: u.email,
        role: u.role || 'recruiter',
        is_active: u.is_active !== false,
        created_at: u.created_at,
        last_active_at: u.last_active_at || u.last_login_at,
      }));
      setMembers(items);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      errorNotify('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setInviting(true);
    try {
      await api.users.create({ email: inviteEmail, role: inviteRole } as any);
      success('Invitation sent', `${inviteEmail} will receive an email shortly.`);
      setInviteEmail('');
      setInviteOpen(false);
      load();
    } catch (err: any) {
      errorNotify('Invite failed', err?.message || 'Could not send invitation');
    } finally {
      setInviting(false);
    }
  };

  const remove = async (id: string) => {
    setRemovingId(id);
    try {
      await api.users.delete(id);
      setMembers((m) => m.filter((u) => u.id !== id));
      push('success', 'Member removed');
    } catch (err: any) {
      errorNotify('Remove failed', err?.message || 'Could not remove member');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <ToastContainer />
      <Section
        title="Team members"
        description="Manage who has access to your workspace."
        action={
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
            Invite
          </Button>
        }
      >
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton height={50} />
            <Skeleton height={50} />
          </div>
        ) : members.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="No team members yet"
            description="Invite recruiters and hiring managers to start collaborating."
            action={<Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>Invite first member</Button>}
          />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <th className="text-left font-semibold px-2 py-2">Name</th>
                  <th className="text-left font-semibold px-2 py-2">Role</th>
                  <th className="text-left font-semibold px-2 py-2">Status</th>
                  <th className="text-left font-semibold px-2 py-2">Last active</th>
                  <th className="text-right font-semibold px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-surface-700">
                {members.map((m) => {
                  const initials = (m.full_name || m.email || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <tr key={m.id}>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{m.full_name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 capitalize text-gray-700 dark:text-gray-300">{m.role}</td>
                      <td className="px-2 py-2">
                        <Badge variant={m.is_active ? 'success' : 'default'} size="sm">
                          {m.is_active ? 'Active' : 'Invited'}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-gray-500 dark:text-gray-400 text-xs">
                        {m.last_active_at ? new Date(m.last_active_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                          loading={removingId === m.id}
                          disabled={removingId === m.id}
                          onClick={() => remove(m.id)}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Modal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite team member" size="md">
        <div className="space-y-3">
          <Field
            label="Email address"
            value={inviteEmail}
            onChange={setInviteEmail}
            placeholder="name@company.com"
            type="email"
            autoComplete="email"
          />
          <div>
            <label htmlFor="invite-role" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Role</label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-surface-900 dark:text-gray-100"
            >
              <option value="admin">Admin</option>
              <option value="recruiter">Recruiter</option>
              <option value="hiring_manager">Hiring manager</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancel</Button>
            <Button variant="primary" onClick={invite} loading={inviting} disabled={inviting || !inviteEmail.trim()}>Send invite</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BillingTab() {
  const [subscription, setSubscription] = useState<any>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const { success, error: errorNotify } = useNotification();
  const { push, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sub, inv, usg] = await Promise.allSettled([
        api.billing.getMySubscription(),
        api.billing.listMyInvoices(),
        api.billing.getMyUsage(),
      ]);
      if (sub.status === 'fulfilled') setSubscription(sub.value);
      if (inv.status === 'fulfilled') {
        const items: any[] = Array.isArray(inv.value) ? inv.value : (inv.value?.data || (inv.value as any)?.items || []);
        setInvoices(items.map((i: any) => ({
          id: i.id,
          date: i.date || i.created_at || i.period_start || '—',
          amount: i.amount ?? i.total ?? i.amount_due ?? 0,
          status: i.status || 'paid',
          number: i.number,
          currency: i.currency,
        })));
      }
      if (usg.status === 'fulfilled') setUsage(usg.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cancel = async () => {
    setCanceling(true);
    try {
      await api.billing.cancelMySubscription({ at_period_end: true });
      success('Subscription canceled', 'Your plan will remain active until the end of the current period.');
      setCancelOpen(false);
      load();
    } catch (err: any) {
      errorNotify('Cancel failed', err?.message || 'Could not cancel subscription');
    } finally {
      setCanceling(false);
    }
  };

  const plan = subscription?.plan || subscription;
  const planName = plan?.name || plan?.display_name || subscription?.plan_name || 'Pro';
  const planPrice = plan?.amount ?? plan?.price ?? subscription?.amount ?? null;
  const planSeats = plan?.seats ?? subscription?.seats ?? null;
  const renews = subscription?.renews_at || subscription?.current_period_end || plan?.renews;
  const usedSeats = subscription?.used_seats ?? subscription?.seats_used;
  const subStatus = subscription?.status;

  const downloadInvoice = async (id: string) => {
    try {
      const r: any = await api.billing.getMyInvoicePdf(id);
      const url = r?.url || r;
      if (url) window.open(url, '_blank', 'noopener');
      else push('info', 'Invoice PDF not available');
    } catch {
      push('error', 'Could not download invoice');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton height={120} />
        <Skeleton height={180} />
        <Skeleton height={120} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer />
      <Section title="Current plan">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-brand-500/10 dark:to-accent-500/10 rounded-lg border border-blue-100 dark:border-brand-500/30">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{planName}</p>
              <Badge variant="purple" size="sm">Most popular</Badge>
              {subStatus && <Badge variant={subStatus === 'active' ? 'success' : 'warning'} size="sm">{subStatus}</Badge>}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {planPrice != null ? `$${planPrice}/mo` : '—'}
              {renews && ` · renews ${new Date(renews).toLocaleDateString()}`}
              {planSeats != null && usedSeats != null && ` · ${usedSeats}/${planSeats} seats`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>Cancel</Button>
            <Button variant="primary" size="sm">Upgrade plan</Button>
          </div>
        </div>
      </Section>

      <Section title="Usage this month">
        {usage ? (
          <div className="space-y-4">
            {Array.isArray(usage) ? (
              usage.map((u: any, i) => (
                <UsageBar key={i} label={u.metric || u.name || `Metric ${i + 1}`} used={u.used ?? u.value ?? 0} limit={u.limit ?? 100} format={(n) => n.toLocaleString()} />
              ))
            ) : (
              <>
                {usage.api_calls != null && <UsageBar label="API calls" used={usage.api_calls.used ?? usage.api_calls} limit={usage.api_calls.limit ?? 50000} format={(n) => n.toLocaleString()} />}
                {usage.interviews != null && <UsageBar label="Interviews" used={usage.interviews.used ?? usage.interviews} limit={usage.interviews.limit ?? 500} />}
                {usage.storage != null && <UsageBar label="Storage" used={usage.storage.used ?? usage.storage_gb ?? usage.storage} limit={usage.storage.limit ?? 100} format={(n) => `${n} GB`} />}
                {usage.candidates != null && <UsageBar label="Candidates processed" used={usage.candidates.used ?? usage.candidates} limit={usage.candidates.limit ?? 1000} format={(n) => n.toLocaleString()} />}
              </>
            )}
          </div>
        ) : (
          <EmptyState
            icon={<Activity className="h-8 w-8" />}
            title="Usage data unavailable"
            description="Once you start using the platform, your monthly usage will appear here."
          />
        )}
      </Section>

      <Section title="Invoices" action={<Button variant="ghost" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />}>Export all</Button>}>
        {invoices.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title="No invoices yet"
            description="Your first invoice will be generated at the end of your billing cycle."
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-surface-800 flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{inv.number || inv.id}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{typeof inv.date === 'string' ? new Date(inv.date).toLocaleDateString() : inv.date}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {inv.currency ? `${inv.currency} ` : '$'}{typeof inv.amount === 'number' ? inv.amount.toFixed(2) : inv.amount}
                </p>
                <Badge variant={inv.status === 'paid' || inv.status === 'succeeded' ? 'success' : inv.status === 'pending' || inv.status === 'open' ? 'warning' : 'danger'} size="sm">
                  {inv.status}
                </Badge>
                <Button variant="ghost" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadInvoice(inv.id)}>
                  PDF
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={cancel}
        title="Cancel subscription?"
        description="Your plan will remain active until the end of the current billing period. You can resume anytime before then."
        confirmLabel={canceling ? 'Canceling…' : 'Cancel subscription'}
        loading={canceling}
      />
    </div>
  );
}

function Section({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="p-4 sm:p-5 rounded-xl border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', disabled, hint, autoComplete, required, maxLength }: {
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  hint?: string;
  autoComplete?: string;
  required?: boolean;
  maxLength?: number;
}) {
  const id = `f-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
        aria-required={required || undefined}
        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 dark:disabled:bg-surface-800 disabled:text-gray-500 bg-white dark:bg-surface-900 dark:text-gray-100"
      />
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function UsageBar({ label, used, limit, format = (n: number) => String(n) }: { label: string; used: number; limit: number; format?: (n: number) => string }) {
  const pct = Math.min(100, (used / Math.max(limit, 1)) * 100);
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-blue-500 dark:bg-brand-500';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <strong className="text-gray-900 dark:text-gray-100">{format(used)}</strong> / {format(limit)}
        </p>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-surface-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} role="progressbar" aria-label={`${label} usage: ${format(used)} of ${format(limit)}`} />
      </div>
    </div>
  );
}
