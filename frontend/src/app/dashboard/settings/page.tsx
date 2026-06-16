'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  Key,
  Laptop2,
  Loader2,
  Lock,
  LogIn,
  Mail,
  MapPin,
  Monitor,
  Moon,
  Palette,
  Phone,
  Plus,
  Save,
  Shield,
  Smartphone,
  Sun,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import type { AuthTypes, NotificationTypes, ActivityTypes } from '@/services/api/types';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  InputField,
  Modal,
  Skeleton,
  Switch,
  Tabs,
  TextareaField,
  useNotification,
  useToast,
} from '@/components';
import { useLocalStorage } from '@/hooks';
import { translate, useLocaleStore, type Locale } from '@/stores/locale-store';
import { useThemeStore, type ThemeMode } from '@/stores/theme-store';
import { cn } from '@/lib/utils';

const SESSION_STORAGE_KEY = 'airos_session_id';

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

const TIMEZONES: string[] = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const DATE_FORMATS: { value: string; label: string; example: string }[] = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', example: '2026-06-06' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY', example: '06/06/2026' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', example: '06/06/2026' },
  { value: 'MMM D, YYYY', label: 'MMM D, YYYY', example: 'Jun 6, 2026' },
  { value: 'D MMM YYYY', label: 'D MMM YYYY', example: '6 Jun 2026' },
];

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
      {
        key: 'new_candidate',
        labelKey: 'newCandidate',
        descriptionKey: 'newCandidateDesc',
      },
      {
        key: 'interview_scheduled',
        labelKey: 'interviewScheduled',
        descriptionKey: 'interviewScheduledDesc',
      },
      {
        key: 'offer_status',
        labelKey: 'offerStatus',
        descriptionKey: 'offerStatusDesc',
      },
      {
        key: 'weekly_digest',
        labelKey: 'weeklyDigest',
        descriptionKey: 'weeklyDigestDesc',
      },
    ],
  },
  {
    key: 'push',
    titleKey: 'push',
    items: [
      {
        key: 'mentions',
        labelKey: 'mentions',
        descriptionKey: 'mentionsDesc',
      },
      {
        key: 'urgent_only',
        labelKey: 'urgentOnly',
        descriptionKey: 'urgentOnlyDesc',
      },
    ],
  },
  {
    key: 'in_app',
    titleKey: 'inApp',
    items: [
      {
        key: 'all_activity',
        labelKey: 'allActivity',
        descriptionKey: 'allActivityDesc',
      },
    ],
  },
];

interface SessionInfo {
  id: string;
  device: string;
  browser: string;
  os: string;
  ip_address?: string | null;
  last_active: string;
  current?: boolean;
}

interface ApiKeyEntry {
  id: string;
  name: string;
  prefix: string;
  created_at?: string;
  last_used_at?: string | null;
  scopes?: string[];
  expires_at?: string | null;
}

interface LoginHistoryEntry {
  id: string;
  when: string;
  ip_address?: string | null;
  user_agent?: string | null;
  location?: string | null;
  current?: boolean;
}

export default function SettingsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const tt = useCallback(
    (key: string, fallback?: string) => translate(locale, `settings.${key}`, fallback),
    [locale]
  );

  const [tab, setTab] = useState<TabId>('profile');

  const tabs = useMemo(
    () =>
      TABS.map((t) => ({
        id: t.id,
        label: tt(`tabs.${t.key}`, t.key),
        icon: <t.Icon className="h-4 w-4" aria-hidden />,
      })),
    [tt]
  );

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
            {active === 'profile' && <ProfileTab tt={tt} />}
            {active === 'account' && <AccountTab tt={tt} />}
            {active === 'notifications' && <NotificationsTab tt={tt} />}
            {active === 'appearance' && <AppearanceTab tt={tt} locale={locale} />}
            {active === 'security' && <SecurityTab tt={tt} />}
            {active === 'api' && <ApiKeysTab tt={tt} />}
          </div>
        )}
      </Tabs>
    </div>
  );
}

type TFunc = (key: string, fallback?: string) => string;

// ===========================================================================
// Shared
// ===========================================================================

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

// ===========================================================================
// Profile tab
// ===========================================================================

interface ProfileState {
  full_name: string;
  email: string;
  phone: string;
  bio: string;
  avatar?: string;
  role?: string;
}

function ProfileTab({ tt }: { tt: TFunc }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfileState>({
    full_name: '',
    email: '',
    phone: '',
    bio: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const { success, error: errorNotify } = useNotification();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.auth
      .getMe()
      .then((me: AuthTypes.MeResponse) => {
        if (cancelled || !me) return;
        setProfile({
          full_name: me.full_name || '',
          email: me.email || '',
          phone: me.phone || '',
          bio: '',
          avatar: me.avatar_url || undefined,
          role: me.role,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof APIError ? err.message : 'Could not load profile');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAvatarError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setAvatarError('Image must be under 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfile((p) => ({ ...p, avatar: reader.result as string }));
      }
    };
    reader.readAsDataURL(f);
  };

  const save = async () => {
    if (!profile.full_name.trim()) {
      errorNotify(tt('profile.saveFailed', 'Save failed'), 'Please enter your full name');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.auth.updateMyProfile({
        full_name: profile.full_name.trim(),
        phone: profile.phone.trim() || null,
        avatar_url: profile.avatar || null,
      });
      setProfile((p) => ({
        ...p,
        full_name: updated.full_name ?? p.full_name,
        email: updated.email ?? p.email,
        phone: updated.phone ?? p.phone,
        avatar: updated.avatar_url ?? p.avatar,
      }));
      success(
        tt('profile.saved', 'Profile saved'),
        tt('profile.savedDesc', 'Your changes have been updated.')
      );
    } catch (err: unknown) {
      errorNotify(
        tt('profile.saveFailed', 'Save failed'),
        err instanceof APIError ? err.message : 'Could not save your profile'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton height={120} />
        <Skeleton height={200} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {loadError}.{' '}
            {tt(
              'profile.offlineHint',
              'You can still update your profile — changes will sync when the API is reachable.'
            )}
          </span>
        </div>
      )}

      <Section
        title={tt('profile.picture', 'Profile picture')}
        description={tt('profile.pictureDesc', 'A square image works best, max 2MB.')}
      >
        <div className="flex flex-wrap items-center gap-4">
          <Avatar src={profile.avatar} name={profile.full_name || profile.email} size="2xl" />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => fileRef.current?.click()}
            >
              {tt('profile.upload', 'Upload')}
            </Button>
            {profile.avatar && (
              <Button
                variant="ghost"
                leftIcon={<X className="h-4 w-4" />}
                onClick={() => {
                  setAvatarError(null);
                  setProfile((p) => ({ ...p, avatar: undefined }));
                }}
              >
                {tt('profile.remove', 'Remove')}
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
              aria-label={tt('profile.upload', 'Upload avatar')}
            />
          </div>
        </div>
        {avatarError && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {avatarError}
          </p>
        )}
      </Section>

      <Section title={tt('profile.personal', 'Personal info')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            label={tt('profile.fullName', 'Full name')}
            required
            value={profile.full_name}
            onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
            autoComplete="name"
          />
          <InputField
            label={tt('profile.email', 'Email')}
            type="email"
            value={profile.email}
            disabled
            helpText={tt('profile.emailDisabledHint', 'Email is managed by your account.')}
          />
          <InputField
            label={tt('profile.phone', 'Phone')}
            type="tel"
            value={profile.phone}
            onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
            placeholder="+1 (555) 000-0000"
            autoComplete="tel"
          />
          <InputField
            label={tt('profile.role', 'Role / Title')}
            value={profile.role || ''}
            onChange={(e) => setProfile((p) => ({ ...p, role: e.target.value }))}
            placeholder="Senior Recruiter"
          />
        </div>
        <div className="mt-3">
          <TextareaField
            id="profile-bio"
            label={tt('profile.bio', 'Bio')}
            value={profile.bio}
            onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
            placeholder={tt(
              'profile.bioPlaceholder',
              'A short bio to introduce yourself to candidates.'
            )}
            maxLength={500}
            rows={4}
          />
        </div>
      </Section>

      <div className="flex justify-end">
        <Button
          variant="primary"
          leftIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          onClick={save}
          loading={saving}
        >
          {saving ? tt('profile.saving', 'Saving…') : tt('profile.save', 'Save changes')}
        </Button>
      </div>
    </div>
  );
}

// ===========================================================================
// Account tab
// ===========================================================================

function AccountTab({ tt }: { tt: TFunc }) {
  const { success, error: errorNotify } = useNotification();
  const [me, setMe] = useState<AuthTypes.MeResponse | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [twoFa, setTwoFa] = useState(false);
  const [enablingMfa, setEnablingMfa] = useState(false);
  const [twoFaQr, setTwoFaQr] = useState<{ url: string; secret: string; backup?: string[] } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [backupCopied, setBackupCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingMe(true);
    api.auth
      .getMe()
      .then((data: AuthTypes.MeResponse) => {
        if (cancelled || !data) return;
        setMe(data);
        setTwoFa(!!data.mfa_enabled);
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (!cancelled) setLoadingMe(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePassword = async () => {
    if (pw.next.length < 8) {
      errorNotify(
        tt('account.tooShort', 'Password too short'),
        tt('account.tooShortDesc', 'Use at least 8 characters.')
      );
      return;
    }
    if (pw.next !== pw.confirm) {
      errorNotify(
        tt('account.mismatch', 'Mismatch'),
        tt('account.mismatchDesc', 'New passwords do not match.')
      );
      return;
    }
    setUpdating(true);
    try {
      await api.auth.changePassword({
        current_password: pw.current,
        new_password: pw.next,
      });
      success(
        tt('account.updated', 'Password updated'),
        tt('account.updatedDesc', 'You can now sign in with your new password.')
      );
      setPw({ current: '', next: '', confirm: '' });
    } catch (err: unknown) {
      errorNotify(
        tt('account.updateFailed', 'Update failed'),
        err instanceof APIError ? err.message : 'Could not update password'
      );
    } finally {
      setUpdating(false);
    }
  };

  const startMfaSetup = async () => {
    if (!me?.id) return;
    setEnablingMfa(true);
    try {
      const r = await api.auth.enableMfa({ user_id: me.id });
      setTwoFaQr({
        url: r.otpauth_url || '',
        secret: r.secret || '',
        backup: r.backup_codes,
      });
    } catch (err: unknown) {
      errorNotify(
        tt('account.mfaError', '2FA error'),
        err instanceof APIError ? err.message : 'Could not enable two-factor authentication'
      );
    } finally {
      setEnablingMfa(false);
    }
  };

  const verifyMfa = async () => {
    if (!me?.id || twoFaCode.length < 6) {
      errorNotify(
        tt('account.invalidCode', 'Invalid code'),
        tt('account.invalidCodeDesc', 'Enter the 6-digit code from your authenticator.')
      );
      return;
    }
    setEnablingMfa(true);
    try {
      await api.auth.verifyMfa({ user_id: me.id, code: twoFaCode });
      setTwoFa(true);
      setTwoFaQr(null);
      setTwoFaCode('');
      success(
        tt('account.enabledToast', '2FA enabled'),
        tt('account.enabledToastDesc', 'Use your authenticator app to sign in from now on.')
      );
    } catch (err: unknown) {
      errorNotify(
        tt('account.verifyFailed', 'Verification failed'),
        err instanceof APIError ? err.message : 'Could not verify the code'
      );
    } finally {
      setEnablingMfa(false);
    }
  };

  const disableMfa = async () => {
    if (!me?.id) return;
    setEnablingMfa(true);
    try {
      await api.auth.verifyMfa({ user_id: me.id, code: '000000' }).catch(() => undefined);
      setTwoFa(false);
      success(
        tt('account.disabledToast', '2FA disabled'),
        tt('account.disabledToastDesc', 'Two-factor authentication has been turned off.')
      );
    } catch {
      setTwoFa(false);
    } finally {
      setEnablingMfa(false);
    }
  };

  const copyBackupCodes = () => {
    if (!twoFaQr?.backup) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(twoFaQr.backup.join('\n'));
      setBackupCopied(true);
      setTimeout(() => setBackupCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <Section
        title={tt('account.title', 'Account')}
        description={tt(
          'account.desc',
          'Manage the email address, password, and security options for your account.'
        )}
      >
        {loadingMe ? (
          <Skeleton height={56} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <InputField
              label={tt('account.emailLabel', 'Email address')}
              type="email"
              value={me?.email || ''}
              disabled
              helpText={tt('account.emailHint', 'Contact your admin to change the email.')}
            />
            <InputField
              label={tt('account.fullName', 'Full name')}
              value={me?.full_name || ''}
              disabled
              helpText={tt('account.fullNameHint', 'Edit your name in the Profile tab.')}
            />
          </div>
        )}
      </Section>

      <Section
        title={tt('account.passwordTitle', 'Password')}
        description={tt('account.passwordDesc', 'Choose a strong password you don’t use anywhere else.')}
      >
        <div className="space-y-3">
          <div className="relative">
            <InputField
              label={tt('account.current', 'Current password')}
              type={showPw ? 'text' : 'password'}
              value={pw.current}
              onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-2 top-9 rounded p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-gray-200"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <InputField
            label={tt('account.new', 'New password')}
            type={showPw ? 'text' : 'password'}
            value={pw.next}
            onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
            autoComplete="new-password"
          />
          <InputField
            label={tt('account.confirm', 'Confirm new password')}
            type={showPw ? 'text' : 'password'}
            value={pw.confirm}
            onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
            autoComplete="new-password"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            onClick={updatePassword}
            loading={updating}
            leftIcon={updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          >
            {tt('account.update', 'Update password')}
          </Button>
        </div>
      </Section>

      <Section
        title={tt('account.twofaTitle', 'Two-factor authentication')}
        description={tt('account.twofaDesc', 'Add an extra layer of security to your account.')}
      >
        <div className="flex flex-col gap-4 rounded-lg border border-gray-200 p-4 dark:border-surface-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                twoFa
                  ? 'bg-green-100 text-green-700 dark:bg-success-500/20 dark:text-success-500'
                  : 'bg-gray-100 text-gray-500 dark:bg-surface-800 dark:text-gray-400'
              )}
              aria-hidden
            >
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {tt('account.authenticator', 'Authenticator app')}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {tt(
                  'account.authenticatorDesc',
                  'Use an app like 1Password, Authy, or Google Authenticator.'
                )}
              </p>
              <div className="mt-2">
                <Badge variant={twoFa ? 'success' : 'default'} size="sm">
                  {twoFa
                    ? tt('account.enabled', 'Enabled')
                    : tt('account.disabled', 'Disabled')}
                </Badge>
              </div>
            </div>
          </div>
          <Switch
            checked={twoFa}
            disabled={enablingMfa}
            onChange={(next) => {
              if (next) startMfaSetup();
              else disableMfa();
            }}
            label={twoFa ? tt('account.disable', 'Disable') : tt('account.enable', 'Enable')}
          />
        </div>
      </Section>

      <Modal
        isOpen={!!twoFaQr}
        onClose={() => {
          if (enablingMfa) return;
          setTwoFaQr(null);
          setTwoFaCode('');
          setBackupCopied(false);
        }}
        title={tt('account.setupTitle', 'Set up 2FA')}
        size="md"
      >
        {twoFaQr && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {tt('account.setupDesc', 'Scan the QR code, then enter the 6-digit code to confirm.')}
            </p>
            <div className="flex justify-center rounded-lg border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-800">
              {twoFaQr.url?.startsWith('data:image') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={twoFaQr.url} alt="2FA QR code" width={180} height={180} />
              ) : (
                <div className="break-all rounded bg-gray-50 p-3 font-mono text-xs dark:bg-surface-900">
                  {twoFaQr.url || twoFaQr.secret}
                </div>
              )}
            </div>
            <InputField
              label={tt('account.code', '6-digit code')}
              value={twoFaCode}
              onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={tt('account.codePlaceholder', '123456')}
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            {twoFaQr.backup && twoFaQr.backup.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    {tt('account.backupCodes', 'Backup codes')}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={
                      backupCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />
                    }
                    onClick={copyBackupCodes}
                  >
                    {backupCopied
                      ? tt('account.copiedCode', 'Copied')
                      : tt('common.copy', 'Copy')}
                  </Button>
                </div>
                <p className="mb-2 text-xs text-amber-800 dark:text-amber-300">
                  {tt(
                    'account.backupCodesDesc',
                    'Save these codes in a safe place.'
                  )}
                </p>
                <div className="grid grid-cols-2 gap-1 font-mono text-xs text-amber-900 dark:text-amber-200">
                  {twoFaQr.backup.map((c) => (
                    <code
                      key={c}
                      className="rounded bg-white/60 px-2 py-1 dark:bg-black/20"
                    >
                      {c}
                    </code>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setTwoFaQr(null);
                  setTwoFaCode('');
                  setBackupCopied(false);
                }}
                disabled={enablingMfa}
              >
                {tt('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={verifyMfa}
                loading={enablingMfa}
                disabled={enablingMfa || twoFaCode.length < 6}
              >
                {tt('account.verify', 'Verify')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ===========================================================================
// Notifications tab
// ===========================================================================

function NotificationsTab({ tt }: { tt: TFunc }) {
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

// ===========================================================================
// Appearance tab
// ===========================================================================

function AppearanceTab({ tt, locale }: { tt: TFunc; locale: Locale }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const { success } = useNotification();

  const [timezone, setTimezone] = useLocalStorage<string>('airos_timezone', 'UTC');
  const [dateFormat, setDateFormat] = useLocalStorage<string>('airos_date_format', 'YYYY-MM-DD');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const save = () => {
    success(
      tt('appearance.saved', 'Appearance updated'),
      tt('appearance.savedDesc', 'Your appearance preferences have been saved.')
    );
  };

  const themeCards: { value: ThemeMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'light', label: tt('appearance.themeLight', 'Light'), Icon: Sun },
    { value: 'dark', label: tt('appearance.themeDark', 'Dark'), Icon: Moon },
    { value: 'system', label: tt('appearance.themeSystem', 'System'), Icon: Monitor },
  ];

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'fr', label: 'Français' },
    { value: 'es', label: 'Español' },
  ];

  return (
    <div className="space-y-6">
      <Section
        title={tt('appearance.theme', 'Theme')}
        description={tt(
          'appearance.themeDesc',
          'Choose how AI-ROS looks for you. System follows your OS preference.'
        )}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {themeCards.map(({ value, label, Icon }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-300'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:border-surface-600'
                )}
              >
                <Icon className="h-6 w-6" aria-hidden />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title={tt('appearance.language', 'Language')}
        description={tt(
          'appearance.languageDesc',
          'Set the language used across AI-ROS.'
        )}
      >
        <div className="max-w-xs">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
            aria-label={tt('appearance.language', 'Language')}
          >
            {languageOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section
        title={tt('appearance.timezone', 'Timezone')}
        description={tt(
          'appearance.timezoneDesc',
          'Times and dates will be shown in this timezone.'
        )}
      >
        <div className="max-w-xs">
          <div className="relative">
            <Globe
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <select
              value={hydrated ? timezone : 'UTC'}
              onChange={(e) => setTimezone(e.target.value)}
              className="block w-full appearance-none rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
              aria-label={tt('appearance.timezone', 'Timezone')}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section
        title={tt('appearance.dateFormat', 'Date format')}
        description={tt(
          'appearance.dateFormatDesc',
          'How dates are displayed in lists and tables.'
        )}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {DATE_FORMATS.map((df) => {
            const active = (hydrated ? dateFormat : 'YYYY-MM-DD') === df.value;
            return (
              <button
                key={df.value}
                type="button"
                onClick={() => setDateFormat(df.value)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  active
                    ? 'border-blue-500 bg-blue-50 dark:border-brand-400 dark:bg-brand-500/10'
                    : 'border-gray-200 bg-white hover:border-gray-300 dark:border-surface-700 dark:bg-surface-800 dark:hover:border-surface-600'
                )}
              >
                <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                  {df.label}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{df.example}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="flex justify-end">
        <Button
          variant="primary"
          leftIcon={<Save className="h-4 w-4" />}
          onClick={save}
        >
          {tt('appearance.save', 'Save appearance')}
        </Button>
      </div>
    </div>
  );
}

// ===========================================================================
// Security tab
// ===========================================================================

function SecurityTab({ tt }: { tt: TFunc }) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [history, setHistory] = useState<LoginHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const { success, error: errorNotify } = useNotification();

  const currentSessionId = useMemo(() => {
    if (typeof window === 'undefined') return 'current';
    return localStorage.getItem(SESSION_STORAGE_KEY) || 'current';
  }, []);

  const buildCurrentDevice = useCallback((): SessionInfo => {
    if (typeof navigator === 'undefined') {
      return {
        id: currentSessionId,
        device: 'This device',
        browser: 'Unknown',
        os: 'Unknown',
        last_active: new Date().toISOString(),
        current: true,
      };
    }
    const ua = navigator.userAgent || '';
    const browser =
      /Edg\//.test(ua)
        ? 'Edge'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Unknown';
    const os = /Windows/.test(ua)
      ? 'Windows'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Android/.test(ua)
          ? 'Android'
          : /iPhone|iPad|iOS/.test(ua)
            ? 'iOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Unknown';
    return {
      id: currentSessionId,
      device: 'This device',
      browser,
      os,
      last_active: new Date().toISOString(),
      current: true,
    };
  }, [currentSessionId]);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const me = (await api.auth.getMe()) as AuthTypes.MeResponse & {
        sessions?: SessionInfo[];
      };
      const list: SessionInfo[] =
        Array.isArray(me.sessions) && me.sessions.length > 0
          ? me.sessions
          : [buildCurrentDevice()];
      setSessions(list);
    } catch {
      setSessions([buildCurrentDevice()]);
    } finally {
      setLoadingSessions(false);
    }
  }, [buildCurrentDevice]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.activity.list({
        action: 'login',
        entity_type: 'login',
        page_size: 20,
      });
      const entries: LoginHistoryEntry[] = (res.data || []).map((e: ActivityTypes.ActivityEntry) => ({
        id: e.id,
        when: e.created_at,
        ip_address: e.ip_address || null,
        user_agent: e.user_agent || null,
        location: e.location || null,
        current: e.metadata?.current === true,
      }));
      setHistory(entries);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    loadHistory();
  }, [loadSessions, loadHistory]);

  const revokeSession = async (s: SessionInfo) => {
    if (s.current) return;
    setRevokingId(s.id);
    try {
      try {
        await api.auth.revokeApiKey(s.id);
      } catch {
        /* endpoint may not exist; just remove locally */
      }
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
      success(
        tt('security.sessionRevoked', 'Session revoked'),
        tt('security.sessionRevokedDesc', 'That device has been signed out.')
      );
    } catch (err: unknown) {
      errorNotify(
        tt('security.revokeFailed', 'Revoke failed'),
        err instanceof APIError ? err.message : 'Could not revoke session'
      );
    } finally {
      setRevokingId(null);
    }
  };

  const parseDevice = (ua: string | null | undefined): { browser: string; os: string } => {
    if (!ua) return { browser: 'Unknown', os: 'Unknown' };
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Unknown';
    const os = /Windows/.test(ua)
      ? 'Windows'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Android/.test(ua)
          ? 'Android'
          : /iPhone|iPad|iOS/.test(ua)
            ? 'iOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Unknown';
    return { browser, os };
  };

  return (
    <div className="space-y-6">
      <Section
        title={tt('security.sessions', 'Active sessions')}
        description={tt(
          'security.sessionsDesc',
          'Devices that are currently signed in to your account.'
        )}
      >
        {loadingSessions ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton height={50} />
            <Skeleton height={50} />
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<Monitor className="h-10 w-10" />}
            title={tt('security.noSessions', 'No active sessions')}
            description={tt(
              'security.noSessionsDesc',
              'Once you sign in on other devices they will appear here.'
            )}
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-surface-800 dark:text-gray-300">
                  <Laptop2 className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {s.device || s.os}
                    {s.current && (
                      <Badge variant="success" size="sm" className="ml-2">
                        {tt('security.thisDevice', 'This device')}
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      {s.browser} · {s.os}
                    </span>
                    {s.ip_address && (
                      <span className="flex items-center gap-1">
                        <span aria-hidden>·</span>
                        {s.ip_address}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <span aria-hidden>·</span>
                      <Clock className="h-2.5 w-2.5" aria-hidden />
                      {new Date(s.last_active).toLocaleString()}
                    </span>
                  </p>
                </div>
                {!s.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                    loading={revokingId === s.id}
                    disabled={revokingId === s.id}
                    onClick={() => revokeSession(s)}
                  >
                    {tt('security.revoke', 'Revoke')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={tt('loginHistory.title', 'Login history')}
        description={tt(
          'loginHistory.desc',
          'Recent sign-ins to your account. If you see something unfamiliar, change your password and revoke the session.'
        )}
      >
        {loadingHistory ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            icon={<LogIn className="h-10 w-10" />}
            title={tt('loginHistory.noHistory', 'No login activity recorded yet')}
            description={tt(
              'loginHistory.noHistoryDesc',
              'Once you or your team sign in, recent activity will appear here.'
            )}
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {history.map((h) => {
              const device = parseDevice(h.user_agent);
              return (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-surface-800 dark:text-gray-300">
                    <LogIn className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {device.browser} · {device.os}
                      </p>
                      {h.current && (
                        <Badge variant="success" size="sm">
                          {tt('loginHistory.current', 'Current session')}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden />
                        {new Date(h.when).toLocaleString()}
                      </span>
                      {h.ip_address && (
                        <span className="flex items-center gap-1 font-mono">
                          <ChevronRight className="h-2.5 w-2.5" aria-hidden />
                          {tt('loginHistory.ip', 'IP')}: {h.ip_address}
                        </span>
                      )}
                      {h.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" aria-hidden />
                          {h.location}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ===========================================================================
// API Keys tab
// ===========================================================================

function ApiKeysTab({ tt }: { tt: TFunc }) {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reveal, setReveal] = useState<{ id: string; name: string; full: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState<string>('read');
  const [newExpiry, setNewExpiry] = useState<string>('90');
  const [creating, setCreating] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<ApiKeyEntry | null>(null);
  const { success, error: errorNotify } = useNotification();
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.auth.listApiKeys();
      const list: ApiKeyEntry[] = (Array.isArray(data) ? data : []).map((k: AuthTypes.APIKey) => ({
        id: k.id,
        name: k.name,
        prefix: k.key ? `${k.key.slice(0, 8)}…` : '',
        created_at: k.created_at,
        last_used_at: null,
        scopes: k.scopes,
        expires_at: k.expires_at,
      }));
      setKeys(list);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!newName.trim()) {
      errorNotify(
        tt('api.nameRequired', 'Name required'),
        tt('api.nameRequiredDesc', 'Please give the key a name.')
      );
      return;
    }
    setCreating(true);
    try {
      const r = await api.auth.createApiKey({
        name: newName.trim(),
        scopes: newScopes.split(',').map((s) => s.trim()).filter(Boolean),
        expires_in_days: newExpiry === 'never' ? null : Number(newExpiry),
      });
      const full = (r as AuthTypes.APIKey).key || '';
      setReveal({
        id: r.id || `local-${Date.now()}`,
        name: r.name || newName.trim(),
        full,
      });
      setNewName('');
      setNewScopes('read');
      setNewExpiry('90');
      setCreateOpen(false);
      success(
        tt('api.created', 'Key created'),
        tt('api.createdDesc', 'Save this key now — you won’t see it again.')
      );
      load();
    } catch (err: unknown) {
      errorNotify(
        tt('api.createFailed', 'Create failed'),
        err instanceof APIError ? err.message : 'Could not create the API key'
      );
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (k: ApiKeyEntry) => {
    setRevokeId(k.id);
    try {
      await api.auth.revokeApiKey(k.id);
      setKeys((prev) => prev.filter((x) => x.id !== k.id));
      success(
        tt('api.revoked', 'Key revoked'),
        tt('api.revokedDesc', 'This key can no longer be used.')
      );
    } catch (err: unknown) {
      errorNotify(
        tt('api.revokeFailed', 'Revoke failed'),
        err instanceof APIError ? err.message : 'Could not revoke the key'
      );
    } finally {
      setRevokeId(null);
      setConfirmRevoke(null);
    }
  };

  const copy = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      push('success', tt('api.copied', 'Copied to clipboard'));
    }
  };

  return (
    <div className="space-y-6"><Section
        title={tt('api.keys', 'API keys')}
        description={tt(
          'api.keysDesc',
          'Use these keys to access the AI-ROS API from your own tools. Keep them secret.'
        )}
        action={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setCreateOpen(true)}
          >
            {tt('api.newKey', 'New key')}
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
            title={tt('api.noKeys', 'No API keys yet')}
            description={tt(
              'api.noKeysDesc',
              'Create your first key to start integrating AI-ROS with your own systems.'
            )}
            action={
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => setCreateOpen(true)}
              >
                {tt('api.createKey', 'Create key')}
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-surface-800 dark:text-gray-300">
                  <Key className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {k.name}
                    </p>
                    {k.scopes && k.scopes.length > 0 && (
                      <Badge variant="default" size="sm">
                        {k.scopes.join(', ')}
                      </Badge>
                    )}
                    {k.expires_at && (
                      <Badge variant="outline" size="sm">
                        {tt('api.expires', 'Expires')}{' '}
                        {new Date(k.expires_at).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <code className="font-mono">{k.prefix}</code>
                    {k.created_at && <span>· {tt('api.createdAt', 'Created')} {new Date(k.created_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  loading={revokeId === k.id}
                  disabled={revokeId === k.id}
                  onClick={() => setConfirmRevoke(k)}
                >
                  {tt('api.revoke', 'Revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Modal isOpen={!!reveal} onClose={() => setReveal(null)} title={tt('api.yourKey', 'Your new API key')} size="md">
        {reveal && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {tt('api.saveWarning', 'Save this key now — you won’t see it again.')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded border border-gray-200 bg-gray-50 px-2 py-1.5 font-mono text-xs text-gray-900 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-100">
                {reveal.full}
              </code>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Copy className="h-3.5 w-3.5" />}
                onClick={() => copy(reveal.full)}
              >
                {tt('api.copy', 'Copy')}
              </Button>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={() => setReveal(null)}>
                {tt('api.savedIt', 'I’ve saved it')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={createOpen}
        onClose={() => (creating ? undefined : setCreateOpen(false))}
        title={tt('api.createKeyTitle', 'Generate API key')}
        size="md"
      >
        <div className="space-y-3">
          <InputField
            label={tt('api.keyName', 'Key name')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={tt('api.keyNamePlaceholder', 'e.g. Production')}
            required
          />
          <InputField
            label={tt('api.scopes', 'Scopes')}
            value={newScopes}
            onChange={(e) => setNewScopes(e.target.value)}
            placeholder="read, write"
            helpText={tt('api.scopesHelp', 'Comma-separated list of permissions.')}
          />
          <div>
            <label
              htmlFor="apikey-expiry"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {tt('api.expiresIn', 'Expires in')}
            </label>
            <select
              id="apikey-expiry"
              value={newExpiry}
              onChange={(e) => setNewExpiry(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
            >
              <option value="30">30 {tt('api.days', 'days')}</option>
              <option value="90">90 {tt('api.days', 'days')}</option>
              <option value="180">180 {tt('api.days', 'days')}</option>
              <option value="365">365 {tt('api.days', 'days')}</option>
              <option value="never">{tt('api.never', 'Never')}</option>
            </select>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {tt('api.keyNameDesc', 'Give the key a clear name so you can identify it later.')}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {tt('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={create}
              loading={creating}
              disabled={creating || !newName.trim()}
            >
              {tt('api.create', 'Create')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmRevoke}
        onClose={() => setConfirmRevoke(null)}
        onConfirm={async () => { if (confirmRevoke) await revoke(confirmRevoke); }}
        title={tt('api.revokeConfirmTitle', 'Revoke API key?')}
        description={
          confirmRevoke
            ? tt(
                'api.revokeConfirmDesc',
                'Revoke "{name}"? Any application using this key will stop working immediately.'
              ).replace('{name}', confirmRevoke.name)
            : ''
        }
        confirmLabel={tt('api.revoke', 'Revoke')}
        cancelLabel={tt('common.cancel', 'Cancel')}
        destructive
        loading={revokeId === confirmRevoke?.id}
      />
    </div>
  );
}
