'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Check,
  X as XIcon,
  Download,
  Crown,
  TrendingUp,
  Receipt,
  Wallet,
  Plus,
  Trash2,
  Star,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Calendar,
  Eye,
  EyeOff,
  Sparkles,
  Building2,
  FileText,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import type { BillingTypes, TenantTypes } from '@/services/api/types';
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
  Modal,
  ConfirmDialog,
  Progress,
  useToast,
} from '@/components';
import { useLocaleStore, translate, formatNumber, formatDate } from '@/stores/locale-store';
import type { Locale } from '@/stores/locale-store';
import { useAuthStore } from '@/stores';

function formatCurrency(amount: number, currency = 'USD', locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const PLAN_GRADIENTS: Record<string, string> = {
  free: 'from-gray-400 to-gray-500',
  starter: 'from-emerald-500 to-teal-500',
  growth: 'from-blue-500 to-indigo-500',
  pro: 'from-blue-500 to-purple-500',
  enterprise: 'from-purple-500 to-pink-500',
};

const PLAN_VARIANT: Record<string, 'default' | 'info' | 'success' | 'purple'> = {
  free: 'default',
  starter: 'success',
  growth: 'info',
  pro: 'info',
  enterprise: 'purple',
};

export default function AdminBillingPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';
  const tenantId = currentUser?.tenant_id;

  const [subscription, setSubscription] = useState<BillingTypes.Subscription | null>(null);
  const [tenant, setTenant] = useState<TenantTypes.Tenant | null>(null);
  const [plans, setPlans] = useState<BillingTypes.Plan[]>([]);
  const [invoices, setInvoices] = useState<BillingTypes.Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<BillingTypes.PaymentMethod[]>([]);
  const [usage, setUsage] = useState<TenantTypes.TenantUsage | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmRemovePm, setConfirmRemovePm] = useState<BillingTypes.PaymentMethod | null>(null);
  const [addPmModal, setAddPmModal] = useState(false);
  const [showPmDetails, setShowPmDetails] = useState<Record<string, boolean>>({});

  const { push } = useToast();

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);
      try {
        const tasks: [
          Promise<BillingTypes.Plan[] | BillingTypes.PlanListResponse>,
          Promise<BillingTypes.Subscription | null>,
          Promise<BillingTypes.InvoiceListResponse | { data?: BillingTypes.Invoice[] }>,
          Promise<BillingTypes.PaymentMethod[]>,
          Promise<TenantTypes.Tenant | null>,
          Promise<TenantTypes.TenantUsage | null>,
        ] = [
          api.billing.listPlans(),
          api.billing.getMySubscription().catch(() => null),
          api.billing.listMyInvoices().catch(() => ({ data: [] })),
          api.billing.listMyPaymentMethods().catch(() => []),
          tenantId ? api.tenants.get(tenantId) : Promise.resolve(null),
          tenantId ? api.tenants.getUsage(tenantId) : Promise.resolve(null),
        ];
        const [plansR, subR, invR, pmsR, tenantR, usageR] = await Promise.allSettled(tasks);

        if (plansR.status === 'fulfilled') {
          const v = plansR.value;
          setPlans(Array.isArray(v) ? v : (v as { data?: BillingTypes.Plan[] })?.data || []);
        }
        if (subR.status === 'fulfilled' && subR.value) {
          setSubscription(subR.value as BillingTypes.Subscription);
        }
        if (invR.status === 'fulfilled') {
          const v = invR.value as { data?: BillingTypes.Invoice[]; items?: BillingTypes.Invoice[] };
          setInvoices(v.data || v.items || []);
        }
        if (pmsR.status === 'fulfilled' && Array.isArray(pmsR.value)) {
          setPaymentMethods(pmsR.value as BillingTypes.PaymentMethod[]);
        }
        if (tenantR.status === 'fulfilled' && tenantR.value) {
          setTenant(tenantR.value as TenantTypes.Tenant);
        }
        if (usageR.status === 'fulfilled' && usageR.value) {
          setUsage(usageR.value as TenantTypes.TenantUsage);
        }
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not load billing';
        setLoadError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const currentPlanId = subscription?.plan_id || tenant?.plan || 'free';
  const currentPlan = useMemo(
    () => plans.find((p) => p.id === currentPlanId) || plans[0],
    [plans, currentPlanId]
  );

  const planLimits = currentPlan?.limits || {};
  const candidatesLimit = Number(planLimits.candidates || 500);
  const jobsLimit = Number(planLimits.jobs || 50);
  const interviewsLimit = Number(planLimits.interviews || 200);
  const storageLimitMb = Number(planLimits.storage_mb || 5120);

  const handleChangePlan = useCallback(
    async (planId: string) => {
      if (planId === currentPlanId) return;
      try {
        const updated = await api.billing.updateMySubscription({ plan_id: planId });
        setSubscription(updated);
        if (tenantId) {
          try {
            await api.tenants.update(tenantId, { plan: planId });
          } catch {
            /* noop */
          }
        }
        push('success', t('billing.planChanged', 'Plan updated to {plan}').replace('{plan}', planId));
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not change plan';
        push('error', msg);
      }
    },
    [currentPlanId, tenantId, push, t]
  );

  const handleCancel = useCallback(async () => {
    try {
      const updated = await api.billing.cancelMySubscription({ at_period_end: true });
      setSubscription(updated);
      push('success', t('billing.cancelScheduled', 'Subscription will cancel at period end'));
    } catch (err) {
      const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not cancel subscription';
      push('error', msg);
    }
    setConfirmCancel(false);
  }, [push, t]);

  const handleResume = useCallback(async () => {
    try {
      const updated = await api.billing.resumeMySubscription();
      setSubscription(updated);
      push('success', t('billing.resumed', 'Subscription resumed'));
    } catch (err) {
      const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not resume subscription';
      push('error', msg);
    }
  }, [push, t]);

  const handleRemovePm = useCallback(
    async (pm: BillingTypes.PaymentMethod) => {
      try {
        await api.billing.removeMyPaymentMethod(pm.id);
        setPaymentMethods((prev) => prev.filter((p) => p.id !== pm.id));
        push('success', t('billing.pmRemoved', 'Payment method removed'));
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not remove payment method';
        push('error', msg);
      }
      setConfirmRemovePm(null);
    },
    [push, t]
  );

  const handleSetDefaultPm = useCallback(
    async (pm: BillingTypes.PaymentMethod) => {
      try {
        const updated = await api.billing.setDefaultPaymentMethod(pm.id);
        setPaymentMethods((prev) => prev.map((p) => ({ ...p, is_default: p.id === pm.id })));
        push('success', t('billing.pmDefault', 'Default payment method updated'));
        void updated;
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not set default';
        push('error', msg);
      }
    },
    [push, t]
  );

  const handleAddPm = useCallback(
    async (pmId: string) => {
      try {
        const created = await api.billing.addMyPaymentMethod({ payment_method_id: pmId });
        setPaymentMethods((prev) => [created, ...prev]);
        setAddPmModal(false);
        push('success', t('billing.pmAdded', 'Payment method added'));
      } catch (err) {
        const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not add payment method';
        push('error', msg);
      }
    },
    [push, t]
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6" role="alert" aria-live="assertive">
        <Breadcrumb />
        <Card>
          <CardContent className="p-10 text-center">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/20 dark:text-red-400"
              aria-hidden="true"
            >
              <CreditCard className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('billing.accessDenied', 'Admin only')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
              {t('billing.accessDeniedDesc', 'You need administrator privileges to manage billing.')}
            </p>
            <Link href="/dashboard">
              <Button variant="primary" className="mt-5">
                {t('common.dashboardHome', 'Dashboard home')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6"><Breadcrumb />

      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white shrink-0">
              <CreditCard className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                {t('billing.title', 'Billing')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t('billing.subtitle', 'Plan, usage, payment methods, and invoices.')}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={
              refreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />
            }
            onClick={() => load(true)}
            loading={refreshing}
            disabled={refreshing}
            aria-label={t('common.refresh', 'Refresh')}
          >
            {t('common.refresh', 'Refresh')}
          </Button>
          <Link href="/dashboard/admin">
            <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
              {t('common.back', 'Admin overview')}
            </Button>
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          <Skeleton height={180} />
          <Skeleton height={140} />
          <Skeleton height={300} />
        </div>
      ) : loadError ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<AlertCircle className="h-10 w-10" />}
              title={t('billing.loadError', 'Could not load billing')}
              description={loadError}
              action={
                <Button variant="primary" onClick={() => load()}>
                  {t('common.retry', 'Retry')}
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <CurrentPlanCard
            subscription={subscription}
            tenant={tenant}
            currentPlan={currentPlan}
            onCancel={() => setConfirmCancel(true)}
            onResume={handleResume}
            t={t}
            locale={locale}
          />

          <UsageCard
            usage={usage}
            candidatesLimit={candidatesLimit}
            jobsLimit={jobsLimit}
            interviewsLimit={interviewsLimit}
            storageLimitMb={storageLimitMb}
            t={t}
            locale={locale}
          />

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle as="h2" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-gray-500" aria-hidden="true" />
                    {t('billing.compare.title', 'Compare plans')}
                  </CardTitle>
                  <CardDescription>
                    {t('billing.compare.desc', 'Choose the plan that fits your team')}
                  </CardDescription>
                </div>
                <div className="inline-flex rounded-lg border border-gray-200 dark:border-surface-700 p-0.5 bg-gray-50 dark:bg-surface-800">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                      billingCycle === 'monthly'
                        ? 'bg-white dark:bg-surface-900 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                    aria-pressed={billingCycle === 'monthly'}
                  >
                    {t('billing.monthly', 'Monthly')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('yearly')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                      billingCycle === 'yearly'
                        ? 'bg-white dark:bg-surface-900 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                    aria-pressed={billingCycle === 'yearly'}
                  >
                    {t('billing.yearly', 'Yearly')}
                    <span className="ml-1 text-[10px] text-green-600 dark:text-success-500 font-semibold">
                      {t('billing.save', 'Save ~17%')}
                    </span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {plans.length === 0 ? (
                <EmptyState
                  icon={<CreditCard className="h-10 w-10" />}
                  title={t('billing.noPlans', 'No plans available')}
                  description={t('billing.noPlansDesc', 'Plans will appear here once configured.')}
                />
              ) : (
                <div className="overflow-x-auto -mx-2 pb-2">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-surface-700">
                        <th scope="col" className="text-left font-semibold px-2 py-2.5">
                          {t('billing.plan', 'Plan')}
                        </th>
                        <th scope="col" className="text-left font-semibold px-2 py-2.5">
                          {t('billing.price', 'Price')}
                        </th>
                        <th scope="col" className="text-left font-semibold px-2 py-2.5">
                          {t('billing.limits', 'Limits')}
                        </th>
                        <th scope="col" className="text-left font-semibold px-2 py-2.5">
                          {t('billing.features', 'Features')}
                        </th>
                        <th scope="col" className="text-right font-semibold px-2 py-2.5">
                          {t('common.actions', 'Action')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-surface-700">
                      {plans.map((plan) => {
                        const isCurrent = plan.id === currentPlanId;
                        const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
                        const gradient = PLAN_GRADIENTS[plan.id] || 'from-gray-400 to-gray-500';
                        return (
                          <tr key={plan.id} className={isCurrent ? 'bg-blue-50/30 dark:bg-brand-500/5' : undefined}>
                            <td className="px-2 py-3 align-top">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`h-8 w-8 rounded-md bg-gradient-to-br ${gradient} flex items-center justify-center text-white shrink-0`}
                                  aria-hidden="true"
                                >
                                  <Crown className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">
                                    {plan.name}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                                    {plan.description}
                                  </p>
                                </div>
                                {plan.popular && (
                                  <Badge variant="purple" size="sm" icon={<Star className="h-2.5 w-2.5" />}>
                                    {t('billing.popular', 'Popular')}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-3 align-top">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {formatCurrency(price, plan.currency, locale)}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                /{billingCycle === 'yearly' ? t('billing.year', 'year') : t('billing.month', 'month')}
                              </p>
                            </td>
                            <td className="px-2 py-3 align-top">
                              <ul className="space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
                                {plan.limits && Object.keys(plan.limits).length > 0 ? (
                                  Object.entries(plan.limits)
                                    .slice(0, 4)
                                    .map(([k, v]) => (
                                      <li key={k} className="capitalize">
                                        {k.replace(/_/g, ' ')}: <span className="font-medium">{String(v)}</span>
                                      </li>
                                    ))
                                ) : (
                                  <li>{t('billing.unlimited', 'Unlimited')}</li>
                                )}
                              </ul>
                            </td>
                            <td className="px-2 py-3 align-top">
                              <ul className="space-y-0.5 text-xs text-gray-600 dark:text-gray-400 max-w-xs">
                                {plan.features.slice(0, 4).map((f, i) => (
                                  <li key={i} className="flex items-start gap-1">
                                    <Check className="h-3 w-3 text-green-500 mt-0.5 shrink-0" aria-hidden="true" />
                                    <span className="line-clamp-1">{f}</span>
                                  </li>
                                ))}
                                {plan.features.length > 4 && (
                                  <li className="text-gray-400 italic">+{plan.features.length - 4} more</li>
                                )}
                              </ul>
                            </td>
                            <td className="px-2 py-3 text-right align-top">
                              {isCurrent ? (
                                <Badge variant="solid-primary" size="sm">
                                  {t('billing.current', 'Current')}
                                </Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  variant={
                                    (plan.price_monthly || 0) > (currentPlan?.price_monthly || 0) ? 'primary' : 'secondary'
                                  }
                                  onClick={() => handleChangePlan(plan.id)}
                                >
                                  {(plan.price_monthly || 0) > (currentPlan?.price_monthly || 0)
                                    ? t('billing.upgrade', 'Upgrade')
                                    : t('billing.downgrade', 'Downgrade')}
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle as="h2" className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-gray-500" aria-hidden="true" />
                    {t('billing.paymentMethods', 'Payment methods')}
                  </CardTitle>
                  <CardDescription>
                    {t('billing.paymentMethodsDesc', 'Manage how you pay for your subscription')}
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => setAddPmModal(true)}
                >
                  {t('billing.addPm', 'Add method')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {paymentMethods.length === 0 ? (
                <EmptyState
                  icon={<Wallet className="h-10 w-10" />}
                  title={t('billing.noPm', 'No payment methods')}
                  description={t('billing.noPmDesc', 'Add a card to manage your subscription.')}
                  action={
                    <Button size="sm" variant="primary" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddPmModal(true)}>
                      {t('billing.addPm', 'Add method')}
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-surface-700">
                  {paymentMethods.map((pm) => {
                    const revealed = showPmDetails[pm.id];
                    return (
                      <li key={pm.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold uppercase shrink-0">
                          {pm.brand || pm.type}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
                            {pm.brand || pm.type}
                            {pm.is_default && (
                              <Badge variant="success" size="sm" className="ml-2">
                                {t('billing.default', 'Default')}
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            •••• {revealed ? pm.last4 : '••••'}
                            {pm.exp_month && pm.exp_year && (
                              <span className="ml-2 text-gray-400">
                                {String(pm.exp_month).padStart(2, '0')}/{String(pm.exp_year).slice(-2)}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowPmDetails((s) => ({ ...s, [pm.id]: !s[pm.id] }))}
                            aria-label={revealed ? t('billing.hide', 'Hide details') : t('billing.show', 'Show details')}
                          >
                            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          {!pm.is_default && (
                            <Button size="sm" variant="ghost" onClick={() => handleSetDefaultPm(pm)}>
                              {t('billing.setDefault', 'Set default')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                            onClick={() => setConfirmRemovePm(pm)}
                            aria-label={`${t('common.delete', 'Delete')} ${pm.brand} ${pm.last4}`}
                          >
                            <span className="sr-only sm:not-sr-only">{t('common.delete', 'Delete')}</span>
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-gray-500" aria-hidden="true" />
                {t('billing.invoices', 'Invoice history')}
              </CardTitle>
              <CardDescription>
                {t('billing.invoicesDesc', 'Download and view past invoices')}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {invoices.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-10 w-10" />}
                  title={t('billing.noInvoices', 'No invoices yet')}
                  description={t('billing.noInvoicesDesc', 'Your invoices will appear here.')}
                />
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-surface-700">
                  {invoices.map((inv) => (
                    <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-surface-800 flex items-center justify-center text-gray-500 shrink-0">
                        <FileText className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {inv.number || inv.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                          {formatDate(inv.issued_at || inv.created_at || new Date().toISOString(), locale, {
                            dateStyle: 'medium',
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : 'warning'} size="sm" dot>
                          {inv.status}
                        </Badge>
                        <p className="text-sm font-semibold tabular-nums w-20 text-right">
                          {formatCurrency(inv.amount_due, inv.currency, locale)}
                        </p>
                        {inv.pdf_url ? (
                          <a href={inv.pdf_url} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost" leftIcon={<Download className="h-3.5 w-3.5" />}>
                              PDF
                            </Button>
                          </a>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<Download className="h-3.5 w-3.5" />}
                            onClick={() => push('info', t('billing.pdfSoon', 'PDF download will be available soon'))}
                          >
                            PDF
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
        title={t('billing.cancelTitle', 'Cancel subscription?')}
        description={t(
          'billing.cancelDesc',
          'Your subscription will remain active until the end of the current billing period, then revert to the free plan.'
        )}
        confirmLabel={t('billing.cancel', 'Cancel subscription')}
        variant="danger"
        destructive
      />

      <ConfirmDialog
        isOpen={!!confirmRemovePm}
        onClose={() => setConfirmRemovePm(null)}
        onConfirm={async () => {
          if (confirmRemovePm) await handleRemovePm(confirmRemovePm);
        }}
        title={t('billing.removePmTitle', 'Remove payment method?')}
        description={
          confirmRemovePm
            ? t('billing.removePmDesc', 'Remove {brand} •••• {last4} from your account?')
                .replace('{brand}', (confirmRemovePm.brand || confirmRemovePm.type).toUpperCase())
                .replace('{last4}', confirmRemovePm.last4)
            : ''
        }
        confirmLabel={t('common.delete', 'Remove')}
        variant="danger"
        destructive
      />

      <AddPaymentMethodModal
        isOpen={addPmModal}
        onClose={() => setAddPmModal(false)}
        onAdd={handleAddPm}
        t={t}
      />
    </div>
  );
}

function CurrentPlanCard({
  subscription,
  tenant,
  currentPlan,
  onCancel,
  onResume,
  t,
  locale,
}: {
  subscription: BillingTypes.Subscription | null;
  tenant: TenantTypes.Tenant | null;
  currentPlan?: BillingTypes.Plan;
  onCancel: () => void;
  onResume: () => void;
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  const planName = currentPlan?.name || tenant?.plan || subscription?.plan_id || 'Free';
  const status = subscription?.status || 'active';
  const planKey = (currentPlan?.id || tenant?.plan || 'free').toLowerCase();
  const gradient = PLAN_GRADIENTS[planKey] || 'from-blue-500 to-purple-500';
  const renews = subscription?.current_period_end
    ? formatDate(subscription.current_period_end, locale, { dateStyle: 'medium' })
    : '—';
  const isPausedOrCanceled = status === 'canceled' || status === 'paused' || !!subscription?.cancel_at;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 rounded-lg border border-gray-200 dark:border-surface-700 p-5 bg-gradient-to-br from-blue-50/40 via-white to-purple-50/30 dark:from-brand-500/10 dark:via-surface-900 dark:to-accent-500/5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {t('billing.currentPlan', 'Current plan')}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div
                    className={`h-8 w-8 rounded-md bg-gradient-to-br ${gradient} flex items-center justify-center text-white`}
                    aria-hidden="true"
                  >
                    <Crown className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 capitalize">{planName}</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {isPausedOrCanceled
                    ? t('billing.endsOn', 'Ends on {date}').replace('{date}', renews)
                    : t('billing.renewsOn', 'Renews on {date}').replace('{date}', renews)}
                </p>
              </div>
              <Badge variant={PLAN_VARIANT[planKey] || 'info'} size="md" dot>
                {status}
              </Badge>
            </div>
            {currentPlan && (
              <div className="mt-4 flex items-baseline gap-2">
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(currentPlan.price_monthly, currentPlan.currency, locale)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  /{t('billing.month', 'month')}
                </p>
                {currentPlan.price_yearly > 0 && (
                  <p className="text-xs text-gray-400 ml-2">
                    or {formatCurrency(currentPlan.price_yearly, currentPlan.currency, locale)} /{t('billing.year', 'year')}
                  </p>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<TrendingUp className="h-3.5 w-3.5" />}
                onClick={() => {
                  const el = document.getElementById('plan-comparison');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {t('billing.upgrade', 'Upgrade')}
              </Button>
              {isPausedOrCanceled ? (
                <Button variant="secondary" size="sm" onClick={onResume}>
                  {t('billing.resume', 'Resume')}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={onCancel}>
                  {t('billing.cancel', 'Cancel')}
                </Button>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-surface-700 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
              {t('billing.billingInfo', 'Billing info')}
            </p>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  {t('billing.customer', 'Customer')}
                </dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {tenant?.name || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  {t('billing.billingCycle', 'Billing cycle')}
                </dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t('billing.monthly', 'Monthly')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  {t('billing.trial', 'Trial')}
                </dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {subscription?.trial_end
                    ? t('billing.endsAt', 'Ends {date}').replace(
                        '{date}',
                        formatDate(subscription.trial_end, locale, { dateStyle: 'medium' })
                      )
                    : t('billing.noTrial', 'No active trial')}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UsageCard({
  usage,
  candidatesLimit,
  jobsLimit,
  interviewsLimit,
  storageLimitMb,
  t,
  locale,
}: {
  usage: TenantTypes.TenantUsage | null;
  candidatesLimit: number;
  jobsLimit: number;
  interviewsLimit: number;
  storageLimitMb: number;
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  const c = usage?.candidates ?? 0;
  const j = usage?.jobs ?? 0;
  const i = usage?.interviews ?? 0;
  const s = usage?.storage_mb ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-gray-500" aria-hidden="true" />
          {t('billing.usage.title', 'Current usage')}
        </CardTitle>
        <CardDescription>
          {t('billing.usage.desc', 'Track how much of your plan you have used this period')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UsageRow
            label={t('billing.usage.candidates', 'Candidates')}
            used={c}
            limit={candidatesLimit}
            locale={locale}
            t={t}
          />
          <UsageRow
            label={t('billing.usage.jobs', 'Open jobs')}
            used={j}
            limit={jobsLimit}
            locale={locale}
            t={t}
          />
          <UsageRow
            label={t('billing.usage.interviews', 'Interviews')}
            used={i}
            limit={interviewsLimit}
            locale={locale}
            t={t}
          />
          <UsageRow
            label={t('billing.usage.storage', 'Storage')}
            used={s}
            limit={storageLimitMb}
            locale={locale}
            t={t}
            unit="MB"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function UsageRow({
  label,
  used,
  limit,
  locale,
  t,
  unit,
}: {
  label: string;
  used: number;
  limit: number;
  locale: Locale;
  t: (key: string, fb?: string) => string;
  unit?: string;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const variant: 'default' | 'warning' | 'danger' = pct > 90 ? 'danger' : pct > 75 ? 'warning' : 'default';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {formatNumber(used, locale, { maximumFractionDigits: unit === 'MB' ? 0 : 0 })}
          {unit ? ` ${unit}` : ''} / {formatNumber(limit, locale)} {unit || ''}
        </p>
      </div>
      <Progress value={pct} size="md" variant={variant} />
      <p className="mt-1 text-[11px] text-gray-400">
        {pct >= 100
          ? t('billing.usage.exceeded', 'Limit reached — consider upgrading')
          : `${pct.toFixed(0)}% ${t('billing.usage.used', 'used')}`}
      </p>
    </div>
  );
}

function AddPaymentMethodModal({
  isOpen,
  onClose,
  onAdd,
  t,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (pmId: string) => Promise<void>;
  t: (key: string, fb?: string) => string;
}) {
  const [pmId, setPmId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPmId('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!pmId.trim()) {
      setError(t('billing.pmIdRequired', 'Please provide a payment method ID'));
      return;
    }
    setSubmitting(true);
    try {
      await onAdd(pmId.trim());
    } catch {
      /* parent handles */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => undefined : onClose}
      title={t('billing.addPmTitle', 'Add payment method')}
      description={t(
        'billing.addPmDesc',
        'Paste a payment method ID (e.g. from Stripe Elements) to attach it to your account.'
      )}
      size="md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} leftIcon={<Plus className="h-4 w-4" />}>
            {t('billing.addPm', 'Add method')}
          </Button>
        </div>
      }
    >
      <div>
        <label htmlFor="pm-id" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
          {t('billing.pmId', 'Payment method ID')}
          <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="pm-id"
          type="text"
          value={pmId}
          onChange={(e) => {
            setPmId(e.target.value);
            if (error) setError(null);
          }}
          placeholder="pm_1ABC…"
          className="block w-full rounded-lg border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          autoComplete="off"
          disabled={submitting}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? 'pm-id-error' : undefined}
        />
        {error && (
          <p id="pm-id-error" role="alert" className="mt-1 text-xs text-red-600 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" aria-hidden="true" /> {error}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
          <Building2 className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          {t('billing.pmSecureHint', 'Your payment details are handled securely by our payment processor.')}
        </p>
      </div>
    </Modal>
  );
}
