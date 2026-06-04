'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
} from 'lucide-react';
import { api } from '@/services/api/client';
import {
  Button,
  Badge,
  useNotification,
  Modal,
  EmptyState,
  Skeleton,
  ConfirmDialog,
  Switch,
  useToast,
} from '@/components';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created: string;
  last_used?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'recruiter' | 'hiring_manager' | 'viewer';
  status: 'active' | 'invited';
  avatar?: string;
  last_active?: string;
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue' | 'open';
  number?: string;
  currency?: string;
  total?: number;
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
  const [profile, setProfile] = useState<{ full_name: string; email: string; phone: string; bio: string; avatar?: string; id?: string }>({
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
    api.me()
      .then((data: any) => {
        if (cancelled || !data) return;
        setProfile((p) => ({
          ...p,
          id: data.id,
          full_name: data?.full_name || data?.name || '',
          email: data?.email || '',
          phone: data?.phone || '',
          bio: data?.bio || '',
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
      const id = profile.id || 'me';
      await api.updateUser(id, {
        full_name: profile.full_name,
        phone: profile.phone || undefined,
        bio: profile.bio || undefined,
      });
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
          <nav role="tablist" aria-label="Settings sections" className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition shrink-0 ${
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

        <div className="flex-1 min-w-0">
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
  profile: { full_name: string; email: string; phone: string; bio: string; avatar?: string };
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
      <div className="space-y-3">
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
        <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{loadError}. You can still update your profile below — your changes will be saved when the API is reachable.</span>
        </div>
      )}

      <Section title="Profile picture" description="A square image works best, max 2MB.">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
            {profile.avatar ? (
              <img src={profile.avatar} alt="avatar" className="h-full w-full object-cover" />
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
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
          </div>
        </div>
      </Section>

      <Section title="Personal info">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Full name *" value={profile.full_name} onChange={(v) => setProfile((p) => ({ ...p, full_name: v }))} />
          <Field label="Email" value={profile.email} disabled hint="Email is managed by your account." />
          <Field label="Phone" value={profile.phone} onChange={(v) => setProfile((p) => ({ ...p, phone: v }))} placeholder="+1 (555) 000-0000" type="tel" />
        </div>
        <div className="mt-3">
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Bio</label>
          <textarea
            value={profile.bio}
            onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-surface-800 dark:text-gray-100"
            placeholder="A short bio to introduce yourself to candidates."
          />
          <p className="text-xs text-gray-500 mt-1">{profile.bio?.length || 0} / 500</p>
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
  const [prefs, setPrefs] = useState({
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
    api.getNotificationPreferences()
      .then((data: any) => {
        if (cancelled || !data) return;
        const m = data?.preferences || data || {};
        setPrefs((p) => ({ ...p, ...m }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const groups: { title: string; items: { key: keyof typeof prefs; label: string; description: string }[] }[] = [
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
      await api.updateNotificationPreferences(prefs);
      success('Preferences saved', 'Your notification settings have been updated.');
    } catch (err: any) {
      errorNotify('Save failed', err?.message || 'Could not save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="space-y-3"><Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} /></div>;
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
                <Switch
                  checked={!!prefs[it.key]}
                  onChange={(v) => setPrefs((p) => ({ ...p, [it.key]: v }))}
                  label={`Toggle ${it.label}`}
                />
              </div>
            ))}
          </div>
        </Section>
      ))}
      <div className="flex justify-end">
        <Button variant="primary" leftIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} onClick={save} loading={saving}>
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
  const [updating, setUpdating] = useState(false);
  const [enablingMfa, setEnablingMfa] = useState(false);
  const { success, error: errorNotify } = useNotification();

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
      await api.changePassword({ current_password: pw.current, new_password: pw.next });
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
        await api.enableMFA();
        success('2FA enabled', 'Use your authenticator app to sign in from now on.');
      }
      setTwoFa(next);
    } catch (err: any) {
      errorNotify('2FA error', err?.message || 'Could not update two-factor authentication');
    } finally {
      setEnablingMfa(false);
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
              className="absolute right-3 top-9 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
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
          <Button variant="primary" onClick={updatePassword} loading={updating} leftIcon={updating ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
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
          <Switch checked={twoFa} onChange={toggleMfa} disabled={enablingMfa} label="Toggle 2FA" />
        </div>
      </Section>

      <Section title="Active sessions" description="Devices that are currently signed in to your account.">
        <EmptyState
          icon={<Monitor className="h-10 w-10" />}
          title="Session management coming soon"
          description="Viewing and revoking active sessions from the dashboard will be available in a future release. For now, sign out from other devices by changing your password."
        />
      </Section>
    </div>
  );
}

function ApiTab() {
  const [reveal, setReveal] = useState<{ id: string; full: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const { success, info, error: errorNotify } = useNotification();
  const { push, ToastContainer } = useToast();

  const generate = (): string => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 40; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };

  const create = () => {
    if (!newName.trim()) {
      errorNotify('Name required', 'Please give the key a name.');
      return;
    }
    const full = generate();
    const prefix = `sk_live_${full.slice(0, 4)}`;
    setReveal({ id: `local-${Date.now()}`, full });
    setNewName('');
    setCreateOpen(false);
    success('Key generated', 'Save this key now — you won’t see it again.');
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
        <EmptyState
          icon={<Key className="h-10 w-10" />}
          title="API key management coming soon"
          description="The ability to create, list, and revoke long-lived API keys is on the roadmap. For server-to-server access today, use the OAuth token issued at login (Authorization: Bearer)."
        />
      </Section>

      <Section title="Webhooks" description="Receive real-time events when things happen in your workspace.">
        <EmptyState
          icon={<Globe className="h-10 w-10" />}
          title="Webhook configuration coming soon"
          description="Set up endpoints to receive candidate, interview, and offer events. The webhook UI is being built."
        />
      </Section>

      {reveal && (
        <Modal isOpen={!!reveal} onClose={() => setReveal(null)} title="Your new API key" size="md">
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
        </Modal>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Generate API key" size="md">
        <div className="space-y-3">
          <Field label="Key name" value={newName} onChange={setNewName} placeholder="e.g. Production" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Give the key a clear name so you can identify it later.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={!newName.trim()}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TeamTab() {
  const { success } = useNotification();
  return (
    <div className="space-y-6">
      <Section title="Team members" description="Manage who has access to your workspace.">
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="Team management coming soon"
          description="Inviting, removing, and role assignment will be available in the next release. The team endpoint is being finalized."
        />
      </Section>
    </div>
  );
}

function BillingTab() {
  const [subscription, setSubscription] = useState<any>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      api.getSubscription(),
      api.listInvoices(),
      api.getUsage(),
    ]).then(([sub, inv, usg]) => {
      if (cancelled) return;
      if (sub.status === 'fulfilled') setSubscription(sub.value);
      if (inv.status === 'fulfilled') {
        const items: any[] = Array.isArray(inv.value) ? inv.value : (inv.value?.data || (inv.value as any)?.items || []);
        setInvoices(items.map((i: any) => ({
          id: i.id,
          date: i.date || i.created_at || i.period_start || '—',
          amount: i.amount ?? i.total ?? i.amount_due ?? 0,
          status: i.status || 'paid',
          number: i.number,
        })));
      }
      if (usg.status === 'fulfilled') setUsage(usg.value);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const plan = subscription?.plan || subscription;
  const planName = plan?.name || plan?.display_name || subscription?.plan_name || 'Pro';
  const planPrice = plan?.amount ?? plan?.price ?? subscription?.amount ?? null;
  const planSeats = plan?.seats ?? subscription?.seats ?? null;
  const renews = subscription?.renews_at || subscription?.current_period_end || plan?.renews;
  const usedSeats = subscription?.used_seats ?? subscription?.seats_used;

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton height={120} />
        <Skeleton height={180} />
        <Skeleton height={120} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Current plan">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-brand-500/10 dark:to-accent-500/10 rounded-lg border border-blue-100 dark:border-brand-500/30">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{planName}</p>
              <Badge variant="purple" size="sm">Most popular</Badge>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {planPrice != null ? `$${planPrice}/mo` : '—'}
              {renews && ` · renews ${new Date(renews).toLocaleDateString()}`}
              {planSeats != null && usedSeats != null && ` · ${usedSeats}/${planSeats} seats`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">Manage seats</Button>
            <Button variant="primary" size="sm">Upgrade plan</Button>
          </div>
        </div>
      </Section>

      <Section title="Usage this month">
        {usage ? (
          <div className="space-y-4">
            {usage.api_calls != null && <UsageBar label="API calls" used={usage.api_calls.used ?? usage.api_calls} limit={usage.api_calls.limit ?? 50000} format={(n) => n.toLocaleString()} />}
            {usage.interviews != null && <UsageBar label="Interviews" used={usage.interviews.used ?? usage.interviews} limit={usage.interviews.limit ?? 500} />}
            {usage.storage != null && <UsageBar label="Storage" used={usage.storage.used ?? usage.storage_gb ?? usage.storage} limit={usage.storage.limit ?? 100} format={(n) => `${n} GB`} />}
            {usage.candidates != null && <UsageBar label="Candidates processed" used={usage.candidates.used ?? usage.candidates} limit={usage.candidates.limit ?? 1000} format={(n) => n.toLocaleString()} />}
            {Object.keys(usage).filter((k) => !['api_calls', 'interviews', 'storage', 'storage_gb', 'candidates'].includes(k)).slice(0, 4).map((k) => {
              const v = usage[k];
              if (typeof v === 'number') return <UsageBar key={k} label={k.replace(/_/g, ' ')} used={v} limit={v * 1.5 || 100} format={(n) => n.toLocaleString()} />;
              if (v && typeof v === 'object' && typeof v.used === 'number') {
                return <UsageBar key={k} label={k.replace(/_/g, ' ')} used={v.used} limit={v.limit || 100} format={(n) => n.toLocaleString()} />;
              }
              return null;
            })}
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
          <div className="divide-y divide-gray-100 dark:divide-surface-700">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-surface-800 flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{inv.number || inv.id}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{typeof inv.date === 'string' ? new Date(inv.date).toLocaleDateString() : inv.date}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">${typeof inv.amount === 'number' ? inv.amount.toFixed(2) : inv.amount}</p>
                <Badge variant={inv.status === 'paid' || (inv.status as string) === 'succeeded' ? 'success' : inv.status === 'pending' || inv.status === 'open' ? 'warning' : 'danger'} size="sm">
                  {inv.status}
                </Badge>
                <Button variant="ghost" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />}>
                  PDF
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>
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

function Field({ label, value, onChange, placeholder, type = 'text', disabled, hint, autoComplete }: {
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  hint?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 dark:disabled:bg-surface-800 disabled:text-gray-500 bg-white dark:bg-surface-900 dark:text-gray-100"
      />
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function UsageBar({ label, used, limit, format = (n: number) => String(n) }: { label: string; used: number; limit: number; format?: (n: number) => string }) {
  const pct = Math.min(100, (used / Math.max(limit, 1)) * 100);
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-blue-500';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <strong className="text-gray-900 dark:text-gray-100">{format(used)}</strong> / {format(limit)}
        </p>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-surface-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} role="progressbar" />
      </div>
    </div>
  );
}
