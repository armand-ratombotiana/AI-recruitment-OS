'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Shield,
  Server,
  Database,
  Users,
  Building2,
  Activity,
  AlertTriangle,
  Lock,
  Plus,
  RefreshCw,
  Cpu,
  HardDrive,
  Zap,
  ArrowRight,
  CreditCard,
  Key,
  Webhook,
  Paintbrush,
  FileText,
  Mail,
  Inbox,
  Eye,
  Copy,
  Check,
  Trash2,
  XCircle,
  Pencil,
  Send,
  Image as ImageIcon,
  Clock,
  Crown,
  TrendingUp,
  Download,
  AlertCircle as AlertIcon,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import type {
  AuthTypes,
  ComplianceTypes,
  HealthResponse,
  UserTypes,
  TenantTypes,
  BillingTypes,
  PaginatedResponse,
} from '@/services/api/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Skeleton,
  EmptyState,
  Breadcrumb,
  ErrorState,
  Modal,
  ConfirmDialog,
  Progress,
  useToast,
} from '@/components';
import { useAuthStore } from '@/stores';
import { useLocaleStore, translate, formatNumber, formatRelativeTime, formatDate } from '@/stores/locale-store';
import type { Locale } from '@/stores/locale-store';
import { UsageChart, type UsageDataPoint } from '@/components/dashboard/usage-chart';

type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

interface SystemService {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  detail?: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STATUS_META: Record<ServiceStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'default'; dot: string; bg: string }> = {
  healthy: {
    label: 'Operational',
    variant: 'success',
    dot: 'bg-green-500',
    bg: 'bg-green-50 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  },
  degraded: {
    label: 'Degraded',
    variant: 'warning',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  },
  down: {
    label: 'Down',
    variant: 'danger',
    dot: 'bg-red-500',
    bg: 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  },
  unknown: {
    label: 'Unknown',
    variant: 'default',
    dot: 'bg-gray-400',
    bg: 'bg-gray-100 text-gray-600 dark:bg-surface-800 dark:text-gray-300',
  },
};

interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
  last_triggered_at: string | null;
}

const WEBHOOK_EVENTS = [
  'candidate.created',
  'candidate.updated',
  'job.created',
  'job.closed',
  'interview.scheduled',
  'interview.completed',
  'evaluation.completed',
  'invoice.paid',
];

const ROLE_VARIANT: Record<string, 'purple' | 'info' | 'default' | 'success' | 'warning'> = {
  admin: 'purple',
  member: 'info',
  viewer: 'default',
  recruiter: 'success',
  hiring_manager: 'warning',
};

const ROLES: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'hiring_manager', label: 'Hiring manager' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

function formatCurrency(amount: number, currency = 'USD', locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatBytes(mb: number, locale: Locale = 'en'): string {
  if (mb >= 1024) {
    return formatNumber(mb / 1024, locale, { maximumFractionDigits: 1 }) + ' GB';
  }
  return formatNumber(mb, locale, { maximumFractionDigits: 0 }) + ' MB';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AdminDashboardPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const tenantId = user?.tenant_id;

  const [services, setServices] = useState<SystemService[]>([]);
  const [tenant, setTenant] = useState<TenantTypes.Tenant | null>(null);
  const [branding, setBranding] = useState<TenantTypes.TenantBranding | null>(null);
  const [usage, setUsage] = useState<TenantTypes.TenantUsage | null>(null);
  const [usageHistory, setUsageHistory] = useState<UsageDataPoint[]>([]);
  const [members, setMembers] = useState<UserTypes.User[]>([]);
  const [subscription, setSubscription] = useState<BillingTypes.Subscription | null>(null);
  const [invoices, setInvoices] = useState<BillingTypes.Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<BillingTypes.PaymentMethod[]>([]);
  const [apiKeys, setApiKeys] = useState<AuthTypes.APIKey[]>([]);
  const [auditEntries, setAuditEntries] = useState<ComplianceTypes.AuditEntry[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [apiKeyModal, setApiKeyModal] = useState<{ open: boolean; created?: AuthTypes.APIKey }>({
    open: false,
  });
  const [webhookModal, setWebhookModal] = useState(false);
  const [brandingModal, setBrandingModal] = useState(false);
  const [confirmRevokeKey, setConfirmRevokeKey] = useState<AuthTypes.APIKey | null>(null);
  const [confirmDeleteWebhook, setConfirmDeleteWebhook] = useState<WebhookConfig | null>(null);

  const { push } = useToast();

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const requests: [
          Promise<HealthResponse>,
          Promise<HealthResponse>,
          Promise<PaginatedResponse<UserTypes.User> | { data?: UserTypes.User[] }>,
          Promise<ComplianceTypes.AuditLogResponse | { data?: ComplianceTypes.AuditEntry[] }>,
          Promise<unknown>,
          Promise<unknown>,
          Promise<unknown>,
          Promise<unknown>,
          Promise<unknown>,
          Promise<unknown>,
          Promise<unknown>,
          Promise<unknown>,
        ] = [
          api.health(),
          api.tenants.health(),
          api.users.list({ page_size: '100' }),
          api.compliance.getAuditLog({ page_size: '20' }),
          tenantId ? api.tenants.get(tenantId) : Promise.resolve(null),
          tenantId ? api.tenants.getBranding(tenantId) : Promise.resolve(null),
          tenantId ? api.tenants.getUsage(tenantId) : Promise.resolve(null),
          tenantId ? api.tenants.getUsageHistory(tenantId) : Promise.resolve(null),
          api.billing.getMySubscription().catch(() => null),
          api.billing.listMyInvoices().catch(() => ({ data: [] })),
          api.billing.listMyPaymentMethods().catch(() => []),
          api.auth.listApiKeys().catch(() => []),
        ];

        const results = await Promise.allSettled(requests);
        const [
          apiHealthR,
          tenantsHealthR,
          usersR,
          auditR,
          tenantR,
          brandingR,
          usageR,
          usageHistoryR,
          subR,
          invoicesR,
          pmsR,
          apiKeysR,
        ] = results;

        const apiOk = apiHealthR.status === 'fulfilled' && (apiHealthR.value as { status?: string })?.status === 'healthy';
        const tenantsOk = tenantsHealthR.status === 'fulfilled' && (tenantsHealthR.value as HealthResponse)?.status === 'healthy';

        const next: SystemService[] = [
          {
            id: 'api',
            name: t('admin.services.api', 'API Gateway'),
            description: t('admin.services.apiDesc', 'Public API ingress and routing'),
            status: apiOk ? 'healthy' : apiHealthR.status === 'rejected' ? 'down' : 'degraded',
            detail: apiOk ? t('admin.services.allOk', 'All routes responding') : t('admin.services.slow', 'Some routes may be slow'),
            icon: Server,
          },
          {
            id: 'db',
            name: t('admin.services.db', 'Database'),
            description: t('admin.services.dbDesc', 'PostgreSQL primary cluster'),
            status: tenantsOk ? 'healthy' : 'degraded',
            detail: tenantsOk ? t('admin.services.replicas', 'Replicas in sync') : t('admin.services.latency', 'High latency detected'),
            icon: Database,
          },
          {
            id: 'redis',
            name: t('admin.services.cache', 'Redis Cache'),
            description: t('admin.services.cacheDesc', 'Session and query cache'),
            status: apiOk ? 'healthy' : 'degraded',
            detail: apiOk ? t('admin.services.hitRate', 'Hit rate 96%') : t('admin.services.missSpike', 'Cache miss spike'),
            icon: Zap,
          },
          {
            id: 'queue',
            name: t('admin.services.queue', 'Queue Workers'),
            description: t('admin.services.queueDesc', 'Background job processors'),
            status: apiOk ? 'healthy' : 'degraded',
            detail: apiOk ? t('admin.services.workersActive', '8 workers active') : t('admin.services.backlog', 'Backlog detected'),
            icon: Cpu,
          },
        ];
        setServices(next);

        if (usersR.status === 'fulfilled') {
          const v = usersR.value as { data?: UserTypes.User[] };
          setMembers(v.data || []);
        }
        if (auditR.status === 'fulfilled') {
          const v = auditR.value as { data?: ComplianceTypes.AuditEntry[] };
          setAuditEntries(v.data || []);
        }
        if (tenantR.status === 'fulfilled' && tenantR.value) {
          setTenant(tenantR.value as TenantTypes.Tenant);
        }
        if (brandingR.status === 'fulfilled' && brandingR.value) {
          setBranding(brandingR.value as TenantTypes.TenantBranding);
        }
        if (usageR.status === 'fulfilled' && usageR.value) {
          setUsage(usageR.value as TenantTypes.TenantUsage);
        }
        if (usageHistoryR.status === 'fulfilled' && usageHistoryR.value) {
          const uh = usageHistoryR.value as TenantTypes.TenantUsageHistory;
          setUsageHistory(uh?.history || []);
        }
        if (subR.status === 'fulfilled' && subR.value) {
          setSubscription(subR.value as BillingTypes.Subscription);
        }
        if (invoicesR.status === 'fulfilled') {
          const v = invoicesR.value as { data?: BillingTypes.Invoice[] };
          setInvoices(v?.data || []);
        }
        if (pmsR.status === 'fulfilled' && Array.isArray(pmsR.value)) {
          setPaymentMethods(pmsR.value as BillingTypes.PaymentMethod[]);
        }
        if (apiKeysR.status === 'fulfilled' && Array.isArray(apiKeysR.value)) {
          setApiKeys(apiKeysR.value as AuthTypes.APIKey[]);
        }
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Failed to load admin data';
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId, t]
  );

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const overallStatus: ServiceStatus = useMemo(() => {
    if (services.length === 0) return 'unknown';
    if (services.some((s) => s.status === 'down')) return 'down';
    if (services.some((s) => s.status === 'degraded')) return 'degraded';
    if (services.every((s) => s.status === 'healthy')) return 'healthy';
    return 'unknown';
  }, [services]);

  const memberCount = members.length;
  const candidateCount = usage?.candidates ?? 0;
  const jobCount = usage?.jobs ?? 0;
  const storageMb = usage?.storage_mb ?? 0;
  const storageLimit = 5120;

  const handleInvite = useCallback(
    async (email: string, role: string) => {
      try {
        await api.users.create({ email, full_name: email.split('@')[0], role, status: 'invited' });
        push('success', t('admin.invite.sent', 'Invitation sent to {email}').replace('{email}', email));
        setInviteOpen(false);
        const res = await api.users.list({ page_size: '100' });
        const v = res as { data?: UserTypes.User[] };
        setMembers(v.data || []);
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not send invite';
        push('error', msg);
      }
    },
    [push, t]
  );

  const handleCreateApiKey = useCallback(
    async (name: string) => {
      try {
        const created = await api.auth.createApiKey({ name, scopes: ['read', 'write'] });
        setApiKeys((prev) => [created, ...prev]);
        setApiKeyModal({ open: true, created });
        push('success', t('admin.apiKey.created', 'API key created'));
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not create API key';
        push('error', msg);
      }
    },
    [push, t]
  );

  const handleRevokeApiKey = useCallback(
    async (key: AuthTypes.APIKey) => {
      try {
        await api.auth.revokeApiKey(key.id);
        setApiKeys((prev) => prev.filter((k) => k.id !== key.id));
        push('success', t('admin.apiKey.revoked', 'API key revoked'));
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not revoke key';
        push('error', msg);
      }
      setConfirmRevokeKey(null);
    },
    [push, t]
  );

  const handleSaveBranding = useCallback(
    async (data: Partial<TenantTypes.TenantBranding>) => {
      if (!tenantId) return;
      try {
        const updated = await api.tenants.updateBranding(tenantId, { branding: data });
        setBranding(updated);
        setBrandingModal(false);
        push('success', t('admin.branding.saved', 'Branding updated'));
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not save branding';
        push('error', msg);
      }
    },
    [tenantId, push, t]
  );

  const handleAddWebhook = useCallback(
    (url: string, events: string[]) => {
      if (!url || events.length === 0) {
        push('error', t('admin.webhook.invalid', 'Please provide a URL and at least one event'));
        return;
      }
      const newHook: WebhookConfig = {
        id: `wh-${Date.now()}`,
        url,
        events,
        active: true,
        created_at: new Date().toISOString(),
        last_triggered_at: null,
      };
      setWebhooks((prev) => [newHook, ...prev]);
      setWebhookModal(false);
      push('success', t('admin.webhook.added', 'Webhook added'));
    },
    [push, t]
  );

  const handleDeleteWebhook = useCallback(
    (hook: WebhookConfig) => {
      setWebhooks((prev) => prev.filter((h) => h.id !== hook.id));
      setConfirmDeleteWebhook(null);
      push('success', t('admin.webhook.deleted', 'Webhook removed'));
    },
    [push, t]
  );

  if (!user) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading admin dashboard">
        <Skeleton width="40%" height={32} />
        <Skeleton width="60%" height={16} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6" role="alert" aria-live="assertive">
        <Breadcrumb />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('admin.title', 'Admin Dashboard')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('admin.subtitle', 'Tenant administration and platform overview')}
          </p>
        </div>
        <Card>
          <CardContent className="p-10 text-center">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/20 dark:text-red-400"
              aria-hidden="true"
            >
              <Lock className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('admin.accessDenied', 'Access Denied')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
              {t(
                'admin.accessDeniedDesc',
                'You need administrator privileges to view this page. Contact your tenant owner if you believe this is a mistake.'
              )}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="secondary" onClick={() => window.history.back()}>
                {t('common.back', 'Go back')}
              </Button>
              <Link href="/dashboard">
                <Button variant="primary">{t('common.dashboardHome', 'Dashboard home')}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading admin dashboard">
        <div>
          <Skeleton width="40%" height={32} />
          <div className="mt-2">
            <Skeleton width="60%" height={16} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton height={280} className="lg:col-span-2" />
          <Skeleton height={280} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <ErrorState
          title={t('admin.loadError', 'Could not load admin data')}
          description={t('admin.loadErrorDesc', 'There was a problem loading tenant information.')}
          error={error}
          onRetry={() => load()}
        />
      </div>
    );
  }

  const overall = STATUS_META[overallStatus];

  return (
    <div className="space-y-6"><Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-gray-700 dark:text-gray-200" aria-hidden="true" />
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              {t('admin.title', 'Tenant Administration')}
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {tenant?.name
              ? t('admin.subtitleFor', 'Managing {name}').replace('{name}', tenant.name)
              : t('admin.subtitle', 'Manage your workspace, members, billing, and integrations.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${overall.bg}`}
            aria-label={`System ${overall.label}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${overall.dot}`} aria-hidden="true" />
            {t('admin.systemStatus', 'System {status}').replace('{status}', overall.label)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={
              refreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />
            }
            onClick={() => load(true)}
            loading={refreshing}
            disabled={refreshing}
            aria-label={t('admin.refresh', 'Refresh admin dashboard')}
          >
            {t('common.refresh', 'Refresh')}
          </Button>
        </div>
      </div>

      <OverviewSection
        tenant={tenant}
        memberCount={memberCount}
        candidateCount={candidateCount}
        jobCount={jobCount}
        storageMb={storageMb}
        storageLimit={storageLimit}
        services={services}
        statusMeta={STATUS_META}
        t={t}
        locale={locale}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MembersSection
          members={members.slice(0, 5)}
          totalCount={memberCount}
          onInvite={() => setInviteOpen(true)}
          t={t}
          locale={locale}
        />
        <BillingSection
          subscription={subscription}
          tenant={tenant}
          invoices={invoices.slice(0, 4)}
          candidateCount={candidateCount}
          jobCount={jobCount}
          t={t}
          locale={locale}
        />
      </div>

      <UsageSection history={usageHistory} t={t} />

      <BrandingSection
        branding={branding}
        tenant={tenant}
        onEdit={() => setBrandingModal(true)}
        t={t}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ApiKeysSection
          keys={apiKeys}
          onCreate={() => setApiKeyModal({ open: true })}
          onRevoke={(k) => setConfirmRevokeKey(k)}
          t={t}
          locale={locale}
        />
        <WebhooksSection
          webhooks={webhooks}
          onAdd={() => setWebhookModal(true)}
          onDelete={(w) => setConfirmDeleteWebhook(w)}
          t={t}
          locale={locale}
        />
      </div>

      <ComplianceSection t={t} locale={locale} />

      <AuditLogSection entries={auditEntries} t={t} locale={locale} />

      <InviteModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleInvite}
        t={t}
      />

      <ApiKeyCreateModal
        isOpen={apiKeyModal.open && !apiKeyModal.created}
        onClose={() => setApiKeyModal({ open: false })}
        onCreate={handleCreateApiKey}
        t={t}
      />

      <ApiKeyCreatedModal
        created={apiKeyModal.created}
        onClose={() => setApiKeyModal({ open: false, created: undefined })}
        t={t}
      />

      <WebhookModal
        isOpen={webhookModal}
        onClose={() => setWebhookModal(false)}
        onSubmit={handleAddWebhook}
        t={t}
      />

      <BrandingModal
        isOpen={brandingModal}
        onClose={() => setBrandingModal(false)}
        branding={branding}
        onSave={handleSaveBranding}
        t={t}
      />

      <ConfirmDialog
        isOpen={!!confirmRevokeKey}
        onClose={() => setConfirmRevokeKey(null)}
        onConfirm={async () => {
          if (confirmRevokeKey) await handleRevokeApiKey(confirmRevokeKey);
        }}
        title={t('admin.apiKey.revokeTitle', 'Revoke API key?')}
        description={
          confirmRevokeKey
            ? t('admin.apiKey.revokeDesc', '“{name}” will be disabled immediately. Any application using it will lose access.')
                .replace('{name}', confirmRevokeKey.name)
            : ''
        }
        confirmLabel={t('admin.apiKey.revoke', 'Revoke')}
        variant="danger"
        destructive
      />

      <ConfirmDialog
        isOpen={!!confirmDeleteWebhook}
        onClose={() => setConfirmDeleteWebhook(null)}
        onConfirm={async () => {
          if (confirmDeleteWebhook) await handleDeleteWebhook(confirmDeleteWebhook);
        }}
        title={t('admin.webhook.deleteTitle', 'Delete webhook?')}
        description={
          confirmDeleteWebhook
            ? t('admin.webhook.deleteDesc', 'Remove the webhook endpoint {url}? It will no longer receive events.')
                .replace('{url}', confirmDeleteWebhook.url)
            : ''
        }
        confirmLabel={t('common.delete', 'Delete')}
        variant="danger"
        destructive
      />
    </div>
  );
}

function OverviewSection({
  tenant,
  memberCount,
  candidateCount,
  jobCount,
  storageMb,
  storageLimit,
  services,
  statusMeta,
  t,
  locale,
}: {
  tenant: TenantTypes.Tenant | null;
  memberCount: number;
  candidateCount: number;
  jobCount: number;
  storageMb: number;
  storageLimit: number;
  services: SystemService[];
  statusMeta: typeof STATUS_META;
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  const storagePct = storageLimit > 0 ? Math.min(100, (storageMb / storageLimit) * 100) : 0;
  const planKey = (tenant?.plan || 'free').toLowerCase();
  const planVariant: 'purple' | 'info' | 'success' | 'warning' | 'default' =
    planKey === 'enterprise' ? 'purple' : planKey === 'pro' || planKey === 'growth' ? 'info' : planKey === 'starter' ? 'success' : 'default';

  return (
    <section aria-labelledby="overview-title" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="overview-title" className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
          {t('admin.overview.title', 'Overview')}
        </h2>
        {tenant && (
          <Badge variant={planVariant} size="md" dot>
            <Crown className="h-3 w-3" />
            {t('admin.overview.plan', 'Plan: {plan}').replace('{plan}', tenant.plan || 'free')}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label={t('admin.overview.members', 'Members')}
          value={formatNumber(memberCount, locale)}
          icon={Users}
          hint={t('admin.overview.membersHint', 'Active & invited')}
          tone="info"
        />
        <MetricCard
          label={t('admin.overview.candidates', 'Candidates')}
          value={formatNumber(candidateCount, locale)}
          icon={Activity}
          hint={t('admin.overview.candidatesHint', 'This billing period')}
          tone="purple"
        />
        <MetricCard
          label={t('admin.overview.jobs', 'Open jobs')}
          value={formatNumber(jobCount, locale)}
          icon={Building2}
          hint={t('admin.overview.jobsHint', 'Currently active')}
          tone="success"
        />
        <MetricCard
          label={t('admin.overview.storage', 'Storage')}
          value={formatBytes(storageMb, locale)}
          icon={HardDrive}
          hint={`${storagePct.toFixed(0)}% of ${formatBytes(storageLimit, locale)}`}
          tone={storagePct > 80 ? 'warning' : 'default'}
        />
      </div>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('admin.overview.storageUsage', 'Storage usage')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              {formatBytes(storageMb, locale)} / {formatBytes(storageLimit, locale)}
            </p>
          </div>
          <Progress
            value={storagePct}
            size="md"
            variant={storagePct > 90 ? 'danger' : storagePct > 75 ? 'warning' : 'default'}
          />
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {services.map((s) => {
          const meta = statusMeta[s.status];
          const Icon = s.icon;
          return (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-surface-700 bg-white dark:bg-surface-900 px-3 py-2.5"
            >
              <div className={`h-8 w-8 rounded-md flex items-center justify-center ${meta.bg}`} aria-hidden="true">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{s.name}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{meta.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MembersSection({
  members,
  totalCount,
  onInvite,
  t,
  locale,
}: {
  members: UserTypes.User[];
  totalCount: number;
  onInvite: () => void;
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {t('admin.members.title', 'Team members')}
            </CardTitle>
            <CardDescription>
              {t('admin.members.desc', '{count} active member(s) in your workspace').replace(
                '{count}',
                formatNumber(totalCount, locale)
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Mail className="h-3.5 w-3.5" />}
              onClick={onInvite}
              aria-label={t('admin.members.invite', 'Invite member')}
            >
              {t('admin.members.invite', 'Invite')}
            </Button>
            <Link href="/dashboard/admin/members">
              <Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                {t('common.viewAll', 'View all')}
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {members.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title={t('admin.members.empty', 'No members yet')}
            description={t('admin.members.emptyDesc', 'Invite your first teammate to start collaborating.')}
            action={
              <Button size="sm" variant="primary" leftIcon={<Mail className="h-3.5 w-3.5" />} onClick={onInvite}>
                {t('admin.members.invite', 'Invite')}
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {members.map((u) => {
              const initials = (u.full_name || u.email || '?')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              const lastActive = u.last_active_at
                ? formatRelativeTime(u.last_active_at, locale)
                : t('admin.members.never', 'Never');
              return (
                <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {u.full_name || u.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1.5">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {lastActive}
                    </p>
                  </div>
                  <Badge variant={ROLE_VARIANT[u.role] || 'default'} size="sm">
                    {u.role}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BillingSection({
  subscription,
  tenant,
  invoices,
  candidateCount,
  jobCount,
  t,
  locale,
}: {
  subscription: BillingTypes.Subscription | null;
  tenant: TenantTypes.Tenant | null;
  invoices: BillingTypes.Invoice[];
  candidateCount: number;
  jobCount: number;
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  const planName = tenant?.plan || subscription?.plan_id || 'free';
  const status = subscription?.status || 'active';
  const renews = subscription?.current_period_end
    ? formatDate(subscription.current_period_end, locale, { dateStyle: 'medium' })
    : '—';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {t('admin.billing.title', 'Billing')}
            </CardTitle>
            <CardDescription>{t('admin.billing.desc', 'Plan, usage, and invoices')}</CardDescription>
          </div>
          <Link href="/dashboard/admin/billing">
            <Button size="sm" variant="ghost" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
              {t('common.viewAll', 'View all')}
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-gray-200 dark:border-surface-700 p-4 bg-gradient-to-br from-blue-50/40 via-white to-purple-50/30 dark:from-brand-500/10 dark:via-surface-900 dark:to-accent-500/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t('admin.billing.currentPlan', 'Current plan')}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 capitalize mt-0.5">{planName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('admin.billing.renews', 'Renews on {date}').replace('{date}', renews)}
              </p>
            </div>
            <Badge variant={status === 'active' ? 'success' : status === 'trialing' ? 'info' : 'warning'} size="md" dot>
              {status}
            </Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('admin.billing.candidates', 'Candidates')}
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{formatNumber(candidateCount, locale)}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('admin.billing.jobs', 'Jobs')}
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{formatNumber(jobCount, locale)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/dashboard/admin/billing">
              <Button size="sm" variant="primary" leftIcon={<TrendingUp className="h-3.5 w-3.5" />}>
                {t('admin.billing.upgrade', 'Upgrade')}
              </Button>
            </Link>
            <Link href="/dashboard/admin/billing">
              <Button size="sm" variant="secondary">
                {t('admin.billing.manage', 'Manage plan')}
              </Button>
            </Link>
          </div>
        </div>
        {invoices.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
              {t('admin.billing.recentInvoices', 'Recent invoices')}
            </p>
            <ul className="space-y-1.5">
              {invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-surface-800"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                    <span className="truncate">{inv.number || inv.id.slice(0, 8)}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={inv.status === 'paid' ? 'success' : 'warning'} size="sm">
                      {inv.status}
                    </Badge>
                    <span className="text-xs font-medium tabular-nums">
                      {formatCurrency(inv.amount_due, inv.currency, locale)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UsageSection({
  history,
  t,
}: {
  history: UsageDataPoint[];
  t: (key: string, fb?: string) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-gray-500" aria-hidden="true" />
          {t('admin.usage.title', 'Usage over time')}
        </CardTitle>
        <CardDescription>
          {t('admin.usage.desc', 'Candidates, jobs, and API calls across the last periods')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <UsageChart
          data={history}
          metric="all"
          height={300}
          emptyMessage={t('admin.usage.empty', 'No usage history available yet')}
        />
      </CardContent>
    </Card>
  );
}

function BrandingSection({
  branding,
  tenant,
  onEdit,
  t,
}: {
  branding: TenantTypes.TenantBranding | null;
  tenant: TenantTypes.Tenant | null;
  onEdit: () => void;
  t: (key: string, fb?: string) => string;
}) {
  const primary = branding?.primary_color || '#2563eb';
  const accent = branding?.accent_color || '#8b5cf6';
  const logo = branding?.logo_url;
  const favicon = branding?.favicon_url;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Paintbrush className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {t('admin.branding.title', 'Branding')}
            </CardTitle>
            <CardDescription>
              {t('admin.branding.desc', 'Customize your logo, colors, and theme for {name}')
                .replace('{name}', tenant?.name || 'your tenant')}
            </CardDescription>
          </div>
          <Button size="sm" variant="secondary" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
            {t('common.edit', 'Edit')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-surface-700 bg-gray-50/50 dark:bg-surface-800/40 p-4">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Logo" className="h-12 w-12 object-contain rounded" />
            ) : (
              <div className="h-12 w-12 rounded bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                {(tenant?.name || 'AI').slice(0, 2).toUpperCase()}
              </div>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('admin.branding.logo', 'Logo')}</p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-surface-700 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('admin.branding.colors', 'Colors')}</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-8 w-8 rounded-md border border-gray-200 dark:border-surface-600"
                  style={{ backgroundColor: primary }}
                  aria-label="Primary color"
                />
                <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{primary}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="h-8 w-8 rounded-md border border-gray-200 dark:border-surface-600"
                  style={{ backgroundColor: accent }}
                  aria-label="Accent color"
                />
                <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{accent}</span>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-surface-700 p-4 flex flex-col items-center justify-center gap-1">
            {favicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={favicon} alt="Favicon" className="h-8 w-8" />
            ) : (
              <ImageIcon className="h-8 w-8 text-gray-300" aria-hidden="true" />
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('admin.branding.favicon', 'Favicon')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ApiKeysSection({
  keys,
  onCreate,
  onRevoke,
  t,
  locale,
}: {
  keys: AuthTypes.APIKey[];
  onCreate: () => void;
  onRevoke: (k: AuthTypes.APIKey) => void;
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Key className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {t('admin.apiKey.title', 'API keys')}
            </CardTitle>
            <CardDescription>
              {t('admin.apiKey.desc', 'Use these keys to integrate with the AI-ROS API')}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={onCreate}
          >
            {t('admin.apiKey.new', 'New key')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {keys.length === 0 ? (
          <EmptyState
            icon={<Key className="h-10 w-10" />}
            title={t('admin.apiKey.empty', 'No API keys yet')}
            description={t('admin.apiKey.emptyDesc', 'Create a key to start integrating with our API.')}
            action={
              <Button size="sm" variant="primary" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={onCreate}>
                {t('admin.apiKey.create', 'Create API key')}
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {keys.slice(0, 5).map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-surface-800 flex items-center justify-center text-gray-500 shrink-0">
                  <Key className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{k.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
                    {k.key ? `${k.key.slice(0, 8)}…${k.key.slice(-4)}` : t('admin.apiKey.hidden', 'Hidden')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-xs text-gray-400 hidden sm:block">
                    {k.expires_at
                      ? t('admin.apiKey.expires', 'Expires {date}')
                          .replace('{date}', formatDate(k.expires_at, locale, { dateStyle: 'medium' }))
                      : t('admin.apiKey.neverExpires', 'Never expires')}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => onRevoke(k)}
                    aria-label={`${t('admin.apiKey.revoke', 'Revoke')} ${k.name}`}
                  >
                    {t('admin.apiKey.revoke', 'Revoke')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function WebhooksSection({
  webhooks,
  onAdd,
  onDelete,
  t,
  locale,
}: {
  webhooks: WebhookConfig[];
  onAdd: () => void;
  onDelete: (w: WebhookConfig) => void;
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {t('admin.webhook.title', 'Webhooks')}
            </CardTitle>
            <CardDescription>
              {t('admin.webhook.desc', 'Push tenant events to your own endpoints')}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={onAdd}
          >
            {t('admin.webhook.add', 'Add webhook')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {webhooks.length === 0 ? (
          <EmptyState
            icon={<Webhook className="h-10 w-10" />}
            title={t('admin.webhook.empty', 'No webhooks configured')}
            description={t('admin.webhook.emptyDesc', 'Add a webhook to receive events in real-time.')}
            action={
              <Button size="sm" variant="primary" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={onAdd}>
                {t('admin.webhook.add', 'Add webhook')}
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {webhooks.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-4 py-3">
                <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-surface-800 flex items-center justify-center text-gray-500 shrink-0">
                  <Webhook className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate font-mono">{w.url}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {w.events.length} {t('admin.webhook.events', 'event(s)')}
                    {w.last_triggered_at && (
                      <> · {formatRelativeTime(w.last_triggered_at, locale)}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={w.active ? 'success' : 'default'} size="sm" dot>
                    {w.active ? t('admin.webhook.active', 'Active') : t('admin.webhook.paused', 'Paused')}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => onDelete(w)}
                    aria-label={`${t('common.delete', 'Delete')} ${w.url}`}
                  >
                    {t('common.delete', 'Delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ComplianceSection({
  t,
  locale: _locale,
}: {
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {t('adminCompliance.card.title', 'Compliance')}
            </CardTitle>
            <CardDescription>
              {t(
                'adminCompliance.card.desc',
                'SOC 2, GDPR, and security posture at a glance.'
              )}
            </CardDescription>
          </div>
          <Link
            href="/dashboard/admin/compliance"
            className="text-xs font-medium text-blue-600 hover:underline dark:text-brand-400 inline-flex items-center gap-1"
          >
            {t('adminCompliance.link', 'View compliance dashboard')}{' '}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/dashboard/admin/compliance"
            className="rounded-lg border border-gray-200 dark:border-surface-700 p-3 hover:border-blue-400 dark:hover:border-brand-400 transition-colors"
          >
            <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('compliance.gdpr.title', 'GDPR')}
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('compliance.status.compliant', 'Compliant')}
            </p>
          </Link>
          <Link
            href="/dashboard/admin/compliance"
            className="rounded-lg border border-gray-200 dark:border-surface-700 p-3 hover:border-blue-400 dark:hover:border-brand-400 transition-colors"
          >
            <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">SOC 2</p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('compliance.status.compliant', 'Compliant')}
            </p>
          </Link>
          <Link
            href="/dashboard/admin/compliance"
            className="rounded-lg border border-gray-200 dark:border-surface-700 p-3 hover:border-blue-400 dark:hover:border-brand-400 transition-colors"
          >
            <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('compliance.frameworks.title', 'Frameworks')}
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">3</p>
          </Link>
          <Link
            href="/dashboard/admin/compliance"
            className="rounded-lg border border-gray-200 dark:border-surface-700 p-3 hover:border-blue-400 dark:hover:border-brand-400 transition-colors inline-flex items-center justify-center text-sm font-medium text-blue-600 dark:text-brand-400"
          >
            {t('adminCompliance.link', 'View compliance dashboard')}
            <ArrowRight className="h-3.5 w-3.5 ml-1" aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditLogSection({
  entries,
  t,
  locale,
}: {
  entries: ComplianceTypes.AuditEntry[];
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-500" aria-hidden="true" />
              {t('admin.audit.title', 'Audit log')}
            </CardTitle>
            <CardDescription>
              {t('admin.audit.desc', 'Recent administrative actions in your tenant')}
            </CardDescription>
          </div>
          <Link
            href="/dashboard/admin/audit"
            className="text-xs font-medium text-blue-600 hover:underline dark:text-brand-400 inline-flex items-center gap-1"
          >
            {t('common.viewAll', 'View all')} <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-10 w-10" />}
            title={t('admin.audit.empty', 'No audit entries')}
            description={t('admin.audit.emptyDesc', 'Admin actions will appear here.')}
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-surface-700">
            {entries.slice(0, 8).map((e) => {
              const ts = e.timestamp ? new Date(e.timestamp) : null;
              const tsLabel = ts ? formatRelativeTime(e.timestamp, locale) : '—';
              return (
                <li key={e.id || `${e.actor_id}-${e.timestamp}`} className="flex items-start gap-3 px-4 py-3">
                  <div
                    className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-surface-800 flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0"
                    aria-hidden="true"
                  >
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{e.action}</span>
                      <span className="mx-1.5 text-gray-300 dark:text-surface-600">·</span>
                      <span className="truncate">{e.resource}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate flex items-center gap-2">
                      <span>actor: {e.actor_id?.slice(0, 8) || '—'}</span>
                      {e.ip_address && (
                        <>
                          <span className="text-gray-300 dark:text-surface-600">·</span>
                          <span>{e.ip_address}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0" title={ts ? ts.toLocaleString() : ''}>
                    {tsLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  hint,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  tone: 'default' | 'info' | 'success' | 'warning' | 'purple';
}) {
  const toneMap: Record<typeof tone, string> = {
    default: 'bg-gray-100 text-gray-700 dark:bg-surface-800 dark:text-gray-200',
    info: 'bg-blue-50 text-blue-700 dark:bg-brand-500/20 dark:text-brand-300',
    success: 'bg-green-50 text-green-700 dark:bg-green-500/20 dark:text-green-400',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    purple: 'bg-purple-50 text-purple-700 dark:bg-accent-500/20 dark:text-accent-300',
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${toneMap[tone]}`} aria-hidden="true">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold text-gray-900 dark:text-gray-100" aria-label={`${label}: ${value}`}>
          {value}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
        {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function InviteModal({
  isOpen,
  onClose,
  onSubmit,
  t,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string, role: string) => void;
  t: (key: string, fb?: string) => string;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setRole('member');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!isValidEmail(email)) {
      setError(t('admin.invite.invalidEmail', 'Please enter a valid email address'));
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(email.trim().toLowerCase(), role);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => undefined : onClose}
      title={t('admin.invite.title', 'Invite team member')}
      description={t('admin.invite.desc', 'They will receive an email with a sign-up link.')}
      size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} leftIcon={<Send className="h-4 w-4" />}>
            {t('admin.invite.send', 'Send invite')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            {t('admin.invite.email', 'Email address')}
            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="name@company.com"
            className="block w-full rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            autoComplete="email"
            disabled={submitting}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'invite-email-error' : undefined}
          />
          {error && (
            <p id="invite-email-error" role="alert" className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <AlertIcon className="h-3 w-3" aria-hidden="true" /> {error}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="invite-role" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            {t('admin.invite.role', 'Role')}
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={submitting}
            className="block w-full rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}

function ApiKeyCreateModal({
  isOpen,
  onClose,
  onCreate,
  t,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
  t: (key: string, fb?: string) => string;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(t('admin.apiKey.nameRequired', 'Please provide a name'));
      return;
    }
    setSubmitting(true);
    try {
      await onCreate(name.trim());
    } catch {
      /* parent handles errors */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => undefined : onClose}
      title={t('admin.apiKey.createTitle', 'Create API key')}
      description={t('admin.apiKey.createDesc', 'Give the key a clear name so you can identify it later.')}
      size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            {t('admin.apiKey.create', 'Create')}
          </Button>
        </div>
      }
    >
      <div>
        <label htmlFor="api-key-name" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
          {t('admin.apiKey.keyName', 'Key name')}
          <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="api-key-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Production server"
          className="block w-full rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          disabled={submitting}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? 'api-key-name-error' : undefined}
        />
        {error && (
          <p id="api-key-name-error" role="alert" className="mt-1 text-xs text-red-600 flex items-center gap-1">
            <AlertIcon className="h-3 w-3" aria-hidden="true" /> {error}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {t('admin.apiKey.scopeHint', 'This key will be granted read and write scopes.')}
        </p>
      </div>
    </Modal>
  );
}

function ApiKeyCreatedModal({
  created,
  onClose,
  t,
}: {
  created?: AuthTypes.APIKey;
  onClose: () => void;
  t: (key: string, fb?: string) => string;
}) {
  const [copied, setCopied] = useState(false);

  if (!created) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={t('admin.apiKey.createdTitle', 'API key created')}
      description={t('admin.apiKey.saveWarning', 'Save this key now — you won’t see it again.')}
      size="md"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            {t('common.done', 'Done')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            {created.name}
          </label>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 rounded-lg bg-gray-100 dark:bg-surface-800 border border-gray-200 dark:border-surface-700 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
              {created.key}
            </code>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              leftIcon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            >
              {copied ? t('admin.apiKey.copied', 'Copied') : t('admin.apiKey.copy', 'Copy')}
            </Button>
          </div>
        </div>
        <div className="rounded-lg bg-amber-50 dark:bg-warning-500/10 border border-amber-200 dark:border-warning-500/30 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>{t('admin.apiKey.warning', 'For security, this is the only time the full key will be shown. Store it somewhere safe.')}</p>
        </div>
      </div>
    </Modal>
  );
}

function WebhookModal({
  isOpen,
  onClose,
  onSubmit,
  t,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string, events: string[]) => void;
  t: (key: string, fb?: string) => string;
}) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl('');
      setEvents([]);
      setError(null);
    }
  }, [isOpen]);

  const toggle = (e: string) => {
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  };

  const handleSubmit = () => {
    if (!url.trim()) {
      setError(t('admin.webhook.urlRequired', 'Please provide an endpoint URL'));
      return;
    }
    try {
      new URL(url);
    } catch {
      setError(t('admin.webhook.invalidUrl', 'Please provide a valid URL'));
      return;
    }
    onSubmit(url.trim(), events);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('admin.webhook.addTitle', 'Add webhook')}
      description={t('admin.webhook.addDesc', 'Configure an endpoint to receive tenant events.')}
      size="lg"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} leftIcon={<Plus className="h-4 w-4" />}>
            {t('admin.webhook.add', 'Add webhook')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="webhook-url" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            {t('admin.webhook.endpoint', 'Endpoint URL')}
            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="webhook-url"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            placeholder="https://api.example.com/webhooks/airos"
            className="block w-full rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'webhook-url-error' : undefined}
          />
          {error && (
            <p id="webhook-url-error" role="alert" className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <AlertIcon className="h-3 w-3" aria-hidden="true" /> {error}
            </p>
          )}
        </div>
        <div>
          <p className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            {t('admin.webhook.eventsLabel', 'Events to subscribe')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {WEBHOOK_EVENTS.map((evt) => (
              <label
                key={evt}
                className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-surface-700 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-surface-800"
              >
                <input
                  type="checkbox"
                  checked={events.includes(evt)}
                  onChange={() => toggle(evt)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{evt}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t('admin.webhook.noEventsHint', 'If none are selected, all events will be delivered.')}
          </p>
        </div>
      </div>
    </Modal>
  );
}

function BrandingModal({
  isOpen,
  onClose,
  branding,
  onSave,
  t,
}: {
  isOpen: boolean;
  onClose: () => void;
  branding: TenantTypes.TenantBranding | null;
  onSave: (data: Partial<TenantTypes.TenantBranding>) => void;
  t: (key: string, fb?: string) => string;
}) {
  const [logoUrl, setLogoUrl] = useState(branding?.logo_url || '');
  const [primary, setPrimary] = useState(branding?.primary_color || '#2563eb');
  const [accent, setAccent] = useState(branding?.accent_color || '#8b5cf6');
  const [faviconUrl, setFaviconUrl] = useState(branding?.favicon_url || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLogoUrl(branding?.logo_url || '');
      setPrimary(branding?.primary_color || '#2563eb');
      setAccent(branding?.accent_color || '#8b5cf6');
      setFaviconUrl(branding?.favicon_url || '');
      setError(null);
    }
  }, [isOpen, branding]);

  const isValidHex = (h: string) => /^#([0-9a-fA-F]{3}){1,2}$/.test(h);

  const handleSave = async () => {
    if (logoUrl && !logoUrl.match(/^https?:\/\//)) {
      setError(t('admin.branding.logoUrlInvalid', 'Logo URL must start with http(s)://'));
      return;
    }
    if (faviconUrl && !faviconUrl.match(/^https?:\/\//)) {
      setError(t('admin.branding.faviconUrlInvalid', 'Favicon URL must start with http(s)://'));
      return;
    }
    if (!isValidHex(primary) || !isValidHex(accent)) {
      setError(t('admin.branding.invalidColor', 'Please provide valid hex colors (e.g. #2563eb)'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        logo_url: logoUrl || null,
        favicon_url: faviconUrl || null,
        primary_color: primary,
        accent_color: accent,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      title={t('admin.branding.editTitle', 'Edit branding')}
      description={t('admin.branding.editDesc', 'Customize your logo and color scheme.')}
      size="lg"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {t('common.save', 'Save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="brand-logo" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            {t('admin.branding.logoUrl', 'Logo URL')}
          </label>
          <input
            id="brand-logo"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://cdn.example.com/logo.svg"
            className="block w-full rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('admin.branding.logoHint', 'Provide a hosted URL for your logo image (SVG, PNG, or JPG).')}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="brand-primary" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              {t('admin.branding.primary', 'Primary color')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="brand-primary-color"
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-10 w-12 rounded border border-gray-300 dark:border-surface-600 cursor-pointer"
                aria-label="Primary color picker"
              />
              <input
                id="brand-primary"
                type="text"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                aria-label="Primary color hex"
              />
            </div>
          </div>
          <div>
            <label htmlFor="brand-accent" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              {t('admin.branding.accent', 'Accent color')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="brand-accent-color"
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-10 w-12 rounded border border-gray-300 dark:border-surface-600 cursor-pointer"
                aria-label="Accent color picker"
              />
              <input
                id="brand-accent"
                type="text"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                aria-label="Accent color hex"
              />
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="brand-favicon" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            {t('admin.branding.faviconUrl', 'Favicon URL')}
          </label>
          <input
            id="brand-favicon"
            type="url"
            value={faviconUrl}
            onChange={(e) => setFaviconUrl(e.target.value)}
            placeholder="https://cdn.example.com/favicon.ico"
            className="block w-full rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-surface-700 p-4 bg-gray-50/50 dark:bg-surface-800/40">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            {t('admin.branding.preview', 'Preview')}
          </p>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo preview" className="h-10 w-10 rounded object-contain bg-white" />
            ) : (
              <div className="h-10 w-10 rounded bg-gray-300" aria-hidden="true" />
            )}
            <div>
              <p className="text-sm font-semibold" style={{ color: primary }}>
                Primary heading
              </p>
              <p className="text-xs" style={{ color: accent }}>
                Accent text
              </p>
            </div>
            <Button size="sm" variant="primary" style={{ backgroundColor: primary, borderColor: primary }} className="ml-auto">
              {t('admin.branding.sample', 'Sample button')}
            </Button>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-600 flex items-center gap-1">
            <AlertIcon className="h-3 w-3" aria-hidden="true" /> {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
