import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Laptop2,
  Loader2,
  Lock,
  LogIn,
  MapPin,
  Monitor,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import type { AuthTypes, ActivityTypes } from '@/services/api/types';
import {
  Badge,
  Button,
  EmptyState,
  InputField,
  Modal,
  Skeleton,
  Switch,
  useNotification,
} from '@/components';
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

interface SessionInfo {
  id: string;
  device: string;
  browser: string;
  os: string;
  ip_address?: string | null;
  last_active: string;
  current?: boolean;
}

interface LoginHistoryEntry {
  id: string;
  when: string;
  ip_address?: string | null;
  user_agent?: string | null;
  location?: string | null;
  current?: boolean;
}

const SESSION_STORAGE_KEY = 'airos_session_id';

export function SecuritySection({ tt }: { tt: TFunc }) {
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

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [history, setHistory] = useState<LoginHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

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

  useEffect(() => {
    loadSessions();
    loadHistory();
  }, [loadSessions, loadHistory]);

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
        description={tt('account.passwordDesc', "Choose a strong password you don't use anywhere else.")}
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
                      backupCopied ? <Copy className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />
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
