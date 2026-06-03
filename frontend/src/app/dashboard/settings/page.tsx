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
} from 'lucide-react';
import { api } from '@/services/api/client';
import {
  Button,
  Badge,
  useNotification,
  Modal,
  EmptyState,
  Skeleton,
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
  status: 'paid' | 'pending' | 'overdue';
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

const SAMPLE_TEAM: TeamMember[] = [
  { id: 't1', name: 'Sarah Chen', email: 'sarah@example.com', role: 'admin', status: 'active', last_active: '2 min ago' },
  { id: 't2', name: 'Marcus Lee', email: 'marcus@example.com', role: 'recruiter', status: 'active', last_active: '1 hour ago' },
  { id: 't3', name: 'Priya Patel', email: 'priya@example.com', role: 'hiring_manager', status: 'active', last_active: '3 hours ago' },
  { id: 't4', name: 'Jordan Kim', email: 'jordan@example.com', role: 'viewer', status: 'invited', last_active: 'never' },
];

const SAMPLE_INVOICES: Invoice[] = [
  { id: 'inv-2026-05', date: '2026-05-01', amount: 499, status: 'paid' },
  { id: 'inv-2026-04', date: '2026-04-01', amount: 499, status: 'paid' },
  { id: 'inv-2026-03', date: '2026-03-01', amount: 499, status: 'paid' },
];

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
  const { success, error: errorNotify } = useNotification();

  useEffect(() => {
    let cancelled = false;
    const token = api.getToken();
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then((r) => (r.ok ? r.json() : null))
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
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingProfile(false); });
    return () => { cancelled = true; };
  }, []);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const token = api.getToken();
      const id = profile.id;
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/users/${id || 'me'}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ full_name: profile.full_name, phone: profile.phone, bio: profile.bio }),
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
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account, team, and billing preferences.</p>
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
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
}: {
  profile: { full_name: string; email: string; phone: string; bio: string; avatar?: string };
  setProfile: (updater: (p: any) => any) => void;
  loading: boolean;
  saving: boolean;
  onSave: () => void;
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
          <Field label="Full name" value={profile.full_name} onChange={(v) => setProfile((p) => ({ ...p, full_name: v }))} />
          <Field label="Email" value={profile.email} disabled hint="Email is managed by your account." />
          <Field label="Phone" value={profile.phone} onChange={(v) => setProfile((p) => ({ ...p, phone: v }))} placeholder="+1 (555) 000-0000" />
          <Field label="Role / Title" placeholder="Senior Recruiter" />
        </div>
        <div className="mt-3">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Bio</label>
          <textarea
            value={profile.bio}
            onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="A short bio to introduce yourself to candidates."
          />
        </div>
      </Section>

      <div className="flex justify-end">
        <Button variant="primary" leftIcon={<Save className="h-4 w-4" />} onClick={onSave} disabled={saving}>
          {saving ? 'Saving\u2026' : 'Save changes'}
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
  const { success } = useNotification();

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
        { key: 'push_daily_digest', label: 'Daily digest', description: 'A morning summary of yesterday\u2019s activity.' },
      ],
    },
    {
      title: 'SMS',
      items: [
        { key: 'sms_urgent', label: 'Urgent only', description: 'High-priority events and on-call escalations.' },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <div className="divide-y divide-gray-100">
            {g.items.map((it) => (
              <div key={it.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{it.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{it.description}</p>
                </div>
                <Toggle
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
        <Button variant="primary" leftIcon={<Save className="h-4 w-4" />} onClick={() => success('Preferences saved', 'Your notification settings have been updated.')}>
          Save preferences
        </Button>
      </div>
    </div>
  );
}

function SecurityTab() {
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [twoFa, setTwoFa] = useState(false);
  const { success, error: errorNotify } = useNotification();

  const sessions = [
    { id: 's1', device: 'MacBook Pro', location: 'San Francisco, CA', current: true, icon: Monitor, last_active: 'Now' },
    { id: 's2', device: 'iPhone 15', location: 'San Francisco, CA', current: false, icon: Smartphone, last_active: '2 hours ago' },
    { id: 's3', device: 'Chrome on Windows', location: 'New York, NY', current: false, icon: Globe, last_active: '3 days ago' },
  ];

  const updatePassword = () => {
    if (pw.next.length < 8) {
      errorNotify('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (pw.next !== pw.confirm) {
      errorNotify('Mismatch', 'New passwords do not match.');
      return;
    }
    success('Password updated', 'You can now sign in with your new password.');
    setPw({ current: '', next: '', confirm: '' });
  };

  return (
    <div className="space-y-6">
      <Section title="Password" description="Choose a strong password you don\u2019t use anywhere else.">
        <div className="space-y-3">
          <div className="relative">
            <Field
              label="Current password"
              type={showPw ? 'text' : 'password'}
              value={pw.current}
              onChange={(v) => setPw((p) => ({ ...p, current: v }))}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
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
          />
          <Field
            label="Confirm new password"
            type={showPw ? 'text' : 'password'}
            value={pw.confirm}
            onChange={(v) => setPw((p) => ({ ...p, confirm: v }))}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={updatePassword}>Update password</Button>
        </div>
      </Section>

      <Section title="Two-factor authentication" description="Add an extra layer of security to your account.">
        <div className="flex items-center justify-between gap-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${twoFa ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Authenticator app</p>
              <p className="text-xs text-gray-500">Use an app like 1Password, Authy, or Google Authenticator.</p>
            </div>
          </div>
          <Toggle checked={twoFa} onChange={setTwoFa} label="Toggle 2FA" />
        </div>
      </Section>

      <Section title="Active sessions" description="Devices that are currently signed in to your account.">
        <div className="divide-y divide-gray-100">
          {sessions.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    {s.device}
                    {s.current && <Badge variant="success" size="sm">This device</Badge>}
                  </p>
                  <p className="text-xs text-gray-500">{s.location} · {s.last_active}</p>
                </div>
                {!s.current && (
                  <Button variant="ghost" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />}>
                    Revoke
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function ApiTab() {
  const [keys, setKeys] = useState<ApiKey[]>([
    { id: 'k1', name: 'Production', prefix: 'sk_live_a8x2', created: '2026-04-12', last_used: '2 min ago' },
    { id: 'k2', name: 'Staging', prefix: 'sk_test_b9k4', created: '2026-05-01', last_used: '3 days ago' },
  ]);
  const [reveal, setReveal] = useState<{ id: string; full: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const { success, info } = useNotification();

  const generate = (): string => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };

  const create = () => {
    if (!newName.trim()) return;
    const full = generate();
    const prefix = `sk_live_${full.slice(0, 4)}`;
    const k: ApiKey = { id: `k-${Date.now()}`, name: newName.trim(), prefix, created: new Date().toISOString().slice(0, 10) };
    setKeys((p) => [k, ...p]);
    setReveal({ id: k.id, full });
    setNewName('');
    setCreateOpen(false);
  };

  const revoke = (id: string) => {
    setKeys((p) => p.filter((k) => k.id !== id));
    info('Key revoked', 'This key can no longer be used.');
  };

  const copy = (text: string) => {
    if (navigator?.clipboard) navigator.clipboard.writeText(text);
    success('Copied to clipboard');
  };

  return (
    <div className="space-y-6">
      <Section
        title="API keys"
        description="Use these keys to access the AIROS API from your own tools. Keep them secret."
        action={
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            New key
          </Button>
        }
      >
        {keys.length === 0 ? (
          <EmptyState
            icon={<Key className="h-10 w-10" />}
            title="No API keys yet"
            description="Create your first key to start integrating AIROS with your own systems."
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {keys.map((k) => (
              <div key={k.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Key className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{k.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{k.prefix}\u2026</p>
                  </div>
                  <div className="text-xs text-gray-500 text-right hidden sm:block">
                    <p>Created {k.created}</p>
                    {k.last_used && <p>Last used {k.last_used}</p>}
                  </div>
                  <Button variant="ghost" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => revoke(k.id)}>
                    Revoke
                  </Button>
                </div>
                {reveal?.id === k.id && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-900 font-semibold mb-1">Save this key now \u2014 you won&apos;t see it again.</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs font-mono bg-white px-2 py-1.5 rounded border border-amber-200 truncate">
                        {reveal.full}
                      </code>
                      <Button size="sm" variant="secondary" leftIcon={<Copy className="h-3.5 w-3.5" />} onClick={() => copy(reveal.full)}>
                        Copy
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Webhooks">
        <div className="space-y-3">
          <Field label="Endpoint URL" placeholder="https://example.com/webhooks/airos" />
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Events</label>
            <div className="flex flex-wrap gap-2">
              {['candidate.created', 'interview.scheduled', 'offer.signed', 'workflow.run.completed'].map((e) => (
                <Badge key={e} variant="info" size="sm">{e}</Badge>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create API key" size="md">
        <div className="space-y-3">
          <Field label="Key name" value={newName} onChange={setNewName} placeholder="e.g. Production" />
          <p className="text-xs text-gray-500">Give the key a clear name so you can identify it later.</p>
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
  const [members, setMembers] = useState<TeamMember[]>(SAMPLE_TEAM);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamMember['role']>('recruiter');
  const { success, error: errorNotify } = useNotification();

  const invite = () => {
    if (!inviteEmail.includes('@')) {
      errorNotify('Invalid email', 'Please enter a valid email address.');
      return;
    }
    const m: TeamMember = {
      id: `m-${Date.now()}`,
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
      role: inviteRole,
      status: 'invited',
      last_active: 'never',
    };
    setMembers((p) => [...p, m]);
    setInviteOpen(false);
    setInviteEmail('');
    success('Invitation sent', `${inviteEmail} will receive an email shortly.`);
  };

  const updateRole = (id: string, role: TeamMember['role']) => {
    setMembers((p) => p.map((m) => (m.id === id ? { ...m, role } : m)));
  };

  const remove = (id: string) => {
    setMembers((p) => p.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-6">
      <Section
        title="Team members"
        description="Manage who has access to your workspace."
        action={
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
            Invite
          </Button>
        }
      >
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2 font-semibold hidden sm:table-cell">Status</th>
                <th className="px-3 py-2 font-semibold hidden md:table-cell">Last active</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50/50">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {m.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{m.name}</p>
                        <p className="text-xs text-gray-500 truncate">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={m.role}
                      onChange={(e) => updateRole(m.id, e.target.value as TeamMember['role'])}
                      className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label={`Role for ${m.name}`}
                    >
                      <option value="admin">Admin</option>
                      <option value="recruiter">Recruiter</option>
                      <option value="hiring_manager">Hiring manager</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell">
                    <Badge variant={m.status === 'active' ? 'success' : 'warning'} size="sm" dot>
                      {m.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell text-xs text-gray-500">
                    {m.last_active || 'never'}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button variant="ghost" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => remove(m.id)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Modal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite team member" size="md">
        <div className="space-y-3">
          <Field label="Email address" value={inviteEmail} onChange={setInviteEmail} placeholder="name@company.com" type="email" />
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as TeamMember['role'])}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="admin">Admin — full access</option>
              <option value="recruiter">Recruiter — manage candidates & jobs</option>
              <option value="hiring_manager">Hiring manager — review & feedback</option>
              <option value="viewer">Viewer — read only</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={invite} leftIcon={<Check className="h-4 w-4" />}>
              Send invite
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BillingTab() {
  const plan = {
    name: 'Pro',
    price: 499,
    seats: 10,
    usedSeats: 4,
    renews: '2026-07-01',
  };
  const usage = {
    apiCalls: 12480,
    apiLimit: 50000,
    interviews: 87,
    interviewLimit: 500,
    storageGb: 12.4,
    storageLimit: 100,
  };
  const { success } = useNotification();

  return (
    <div className="space-y-6">
      <Section title="Current plan">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border border-blue-100">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-gray-900">{plan.name}</p>
              <Badge variant="purple" size="sm">Most popular</Badge>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">${plan.price}/mo · renews {plan.renews} · {plan.usedSeats}/{plan.seats} seats</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">Manage seats</Button>
            <Button variant="primary" size="sm">Upgrade plan</Button>
          </div>
        </div>
      </Section>

      <Section title="Usage this month">
        <div className="space-y-4">
          <UsageBar label="API calls" used={usage.apiCalls} limit={usage.apiLimit} format={(n) => n.toLocaleString()} />
          <UsageBar label="Interviews" used={usage.interviews} limit={usage.interviewLimit} />
          <UsageBar label="Storage" used={usage.storageGb} limit={usage.storageLimit} format={(n) => `${n} GB`} />
        </div>
      </Section>

      <Section title="Invoices" action={<Button variant="ghost" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />}>Export all</Button>}>
        <div className="divide-y divide-gray-100">
          {SAMPLE_INVOICES.map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{inv.id}</p>
                <p className="text-xs text-gray-500">{inv.date}</p>
              </div>
              <p className="text-sm font-semibold text-gray-900">${inv.amount.toFixed(2)}</p>
              <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'pending' ? 'warning' : 'danger'} size="sm">
                {inv.status}
              </Badge>
              <Button variant="ghost" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />}>
                PDF
              </Button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="p-4 sm:p-5 rounded-xl border border-gray-200 bg-white">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', disabled, hint }: {
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
      />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
        checked ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function UsageBar({ label, used, limit, format = (n: number) => String(n) }: { label: string; used: number; limit: number; format?: (n: number) => string }) {
  const pct = Math.min(100, (used / limit) * 100);
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-blue-500';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">
          <strong className="text-gray-900">{format(used)}</strong> / {format(limit)}
        </p>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} role="progressbar" />
      </div>
    </div>
  );
}
