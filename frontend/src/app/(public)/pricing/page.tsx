'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  X,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import {
  useLocaleStore,
  translate,
  formatNumber,
} from '@/stores/locale-store';
import { api } from '@/services/api/client';
import type { BillingTypes } from '@/services/api/types';
import { cn } from '@/lib/utils';

type PlanKey = 'free' | 'starter' | 'pro' | 'enterprise';
type BillingPeriod = 'monthly' | 'yearly';

type PlanDef = {
  id: PlanKey;
  priceMonthly: number | null;
  priceYearly: number | null;
  currency: string;
  popular: boolean;
  cta: 'start' | 'trial' | 'contact';
  href: string;
  featureCount: number;
  featureFallback: string[];
};

const PLAN_DEFS: PlanDef[] = [
  {
    id: 'free',
    priceMonthly: 0,
    priceYearly: 0,
    currency: 'USD',
    popular: false,
    cta: 'start',
    href: '/register',
    featureCount: 5,
    featureFallback: [
      'Up to 25 candidates / month',
      '1 active job posting',
      'Basic AI screening',
      'Community support',
      'Single workspace',
    ],
  },
  {
    id: 'starter',
    priceMonthly: 49,
    priceYearly: Math.round(49 * 12 * 0.8),
    currency: 'USD',
    popular: false,
    cta: 'trial',
    href: '/register',
    featureCount: 6,
    featureFallback: [
      'Up to 200 candidates / month',
      '5 active jobs',
      'AI matching + screening',
      'Email support',
      'Branded careers page',
      '3 team members',
    ],
  },
  {
    id: 'pro',
    priceMonthly: 199,
    priceYearly: Math.round(199 * 12 * 0.8),
    currency: 'USD',
    popular: true,
    cta: 'trial',
    href: '/register',
    featureCount: 8,
    featureFallback: [
      'Up to 1,000 candidates / month',
      'Unlimited active jobs',
      'Advanced AI matching',
      'Live coding interviews',
      'Custom workflows',
      'Priority support',
      '10 team members',
      'Advanced analytics',
    ],
  },
  {
    id: 'enterprise',
    priceMonthly: null,
    priceYearly: null,
    currency: 'USD',
    popular: false,
    cta: 'contact',
    href: '/contact',
    featureCount: 8,
    featureFallback: [
      'Unlimited candidates',
      'Unlimited jobs & seats',
      'Custom AI models',
      'Dedicated success manager',
      'SSO / SAML, SCIM, audit log',
      'On-prem or VPC deployment',
      '99.9% uptime SLA',
      'Custom integrations',
    ],
  },
];

type CompareRow = {
  key: string;
  values: Record<PlanKey, string | boolean>;
};

const COMPARE_ROWS: CompareRow[] = [
  {
    key: 'candidates',
    values: { free: '25 / mo', starter: '200 / mo', pro: '1,000 / mo', enterprise: 'unlimited' },
  },
  {
    key: 'jobs',
    values: { free: '1', starter: '5', pro: 'unlimited', enterprise: 'unlimited' },
  },
  {
    key: 'users',
    values: { free: '1', starter: '3', pro: '10', enterprise: 'unlimited' },
  },
  {
    key: 'aiScreening',
    values: { free: 'aiBasic', starter: 'standard', pro: 'aiAdvanced', enterprise: 'aiCustom' },
  },
  {
    key: 'aiMatching',
    values: { free: false, starter: 'aiBasic', pro: 'aiAdvanced', enterprise: 'aiCustom' },
  },
  {
    key: 'liveInterviews',
    values: { free: false, starter: false, pro: true, enterprise: true },
  },
  {
    key: 'workflows',
    values: { free: false, starter: false, pro: true, enterprise: true },
  },
  {
    key: 'branding',
    values: { free: false, starter: true, pro: true, enterprise: true },
  },
  {
    key: 'analytics',
    values: { free: false, starter: true, pro: true, enterprise: true },
  },
  {
    key: 'api',
    values: { free: false, starter: false, pro: 'apiReadonly', enterprise: 'apiFull' },
  },
  {
    key: 'sso',
    values: { free: false, starter: false, pro: false, enterprise: true },
  },
  {
    key: 'audit',
    values: { free: false, starter: false, pro: true, enterprise: true },
  },
  {
    key: 'support',
    values: { free: 'supportCommunity', starter: 'supportEmail', pro: 'supportPriority', enterprise: 'supportDedicated' },
  },
  {
    key: 'sla',
    values: { free: false, starter: false, pro: false, enterprise: '99.9%' },
  },
];

const FAQ_KEYS = [
  'trial',
  'switch',
  'payment',
  'data',
  'security',
  'integrations',
  'discount',
  'cancel',
  'support',
  'onboarding',
] as const;

export default function PricingPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [openFaq, setOpenFaq] = useState<string | null>(FAQ_KEYS[0]);
  const [apiPlans, setApiPlans] = useState<BillingTypes.Plan[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.billing.listPlans();
        if (!active) return;
        const list = Array.isArray(res)
          ? res
          : ((res as unknown as { data?: BillingTypes.Plan[] }).data ?? []);
        if (Array.isArray(list) && list.length > 0) setApiPlans(list);
      } catch {
        if (active) setApiPlans(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const plans = useMemo(() => {
    return PLAN_DEFS.map((def) => {
      const apiMatch = apiPlans?.find(
        (p) =>
          p.id.toLowerCase() === def.id ||
          p.name.toLowerCase() === def.id ||
          p.name.toLowerCase().includes(def.id),
      );
      return {
        ...def,
        priceMonthly: apiMatch?.price_monthly ?? def.priceMonthly,
        priceYearly: apiMatch?.price_yearly ?? def.priceYearly,
        currency: apiMatch?.currency || def.currency,
        popular: apiMatch?.popular ?? def.popular,
      };
    });
  }, [apiPlans]);

  const formatPrice = (value: number, currency: string) => {
    try {
      return new Intl.NumberFormat(
        locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : 'en-US',
        {
          style: 'currency',
          currency: (currency || 'USD').toUpperCase(),
          maximumFractionDigits: 0,
        },
      ).format(value);
    } catch {
      return `$${value}`;
    }
  };

  const renderCellValue = (val: string | boolean): React.ReactNode => {
    if (val === true) return <Check className="mx-auto h-4 w-4 text-emerald-500" aria-label={t('pricing.compare.yes', 'Included')} />;
    if (val === false)
      return (
        <span className="inline-flex items-center justify-center" aria-label={t('pricing.compare.no', 'Not included')}>
          <X className="h-4 w-4 text-gray-300 dark:text-gray-600" aria-hidden="true" />
        </span>
      );
    if (val.match(/^\d/) || val === 'unlimited') {
      if (val === 'unlimited') return t('pricing.compare.values.unlimited', 'Unlimited');
      return val;
    }
    const translated = t(`pricing.compare.values.${val}`, val);
    return translated;
  };

  const ctaLabel = (key: 'start' | 'trial' | 'contact') => {
    if (key === 'start') return t('pricing.ctaStart', 'Start free');
    if (key === 'trial') return t('pricing.ctaTrial', 'Start 14-day trial');
    return t('pricing.ctaContact', 'Contact sales');
  };

  return (
    <div>
      <section className="relative overflow-hidden border-b border-gray-200 bg-gradient-to-b from-white via-brand-50/40 to-white dark:border-surface-800 dark:from-surface-950 dark:via-brand-950/30 dark:to-surface-950">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 backdrop-blur dark:border-brand-800 dark:bg-surface-900/60 dark:text-brand-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('pricing.hero.eyebrow', 'Pricing')}
          </div>
          <h1 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t('pricing.hero.title', 'Simple, transparent pricing')}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-gray-600 dark:text-gray-300 mx-auto max-w-2xl">
            {t('pricing.hero.subtitle', 'Pick the plan that fits your team. Upgrade, downgrade or cancel anytime.')}
          </p>

          <div
            role="radiogroup"
            aria-label={t('pricing.toggle.monthly', 'Monthly')}
            className="mt-8 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-sm dark:border-surface-700 dark:bg-surface-900"
          >
            <button
              type="button"
              role="radio"
              aria-checked={period === 'monthly'}
              onClick={() => setPeriod('monthly')}
              className={cn(
                'h-9 rounded-full px-4 text-sm font-semibold transition',
                period === 'monthly'
                  ? 'bg-gradient-to-r from-brand-500 to-accent-600 text-white shadow-sm shadow-brand-500/30'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white',
              )}
            >
              {t('pricing.toggle.monthly', 'Monthly')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={period === 'yearly'}
              onClick={() => setPeriod('yearly')}
              className={cn(
                'h-9 inline-flex items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition',
                period === 'yearly'
                  ? 'bg-gradient-to-r from-brand-500 to-accent-600 text-white shadow-sm shadow-brand-500/30'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white',
              )}
            >
              {t('pricing.toggle.yearly', 'Yearly')}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  period === 'yearly'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                )}
              >
                {t('pricing.toggle.save', 'Save 20%')}
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 dark:bg-surface-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {plans.map((plan) => {
              const price = period === 'monthly' ? plan.priceMonthly : plan.priceYearly;
              const isFree = plan.id === 'free';
              const isCustom = price == null;
              const monthlyEquivalent =
                period === 'yearly' && price != null && price > 0 ? Math.round(price / 12) : null;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    'relative h-full rounded-2xl transition-all',
                    plan.popular ? 'shadow-2xl shadow-brand-500/20 scale-[1.02]' : 'hover:shadow-lg',
                  )}
                >
                  {plan.popular && (
                    <>
                      <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-brand-500 via-accent-500 to-brand-500" aria-hidden="true" />
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                        <span className="rounded-full bg-gradient-to-r from-brand-500 to-accent-600 px-3.5 py-1 text-xs font-semibold text-white shadow-lg">
                          {t('pricing.popular', 'Most popular')}
                        </span>
                      </div>
                    </>
                  )}
                  <div
                    className={cn(
                      'relative flex h-full flex-col rounded-2xl bg-white p-7 dark:bg-surface-950',
                      !plan.popular && 'border border-gray-200 dark:border-surface-800',
                    )}
                  >
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      {t(`pricing.plans.${plan.id}.name`, plan.id)}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {t(`pricing.plans.${plan.id}.tagline`)}
                    </p>

                    <div className="mt-5 mb-6 min-h-[72px]">
                      {isFree ? (
                        <span className="text-4xl font-bold text-gray-900 dark:text-white">
                          {t('pricing.billing.free', 'Free forever')}
                        </span>
                      ) : isCustom ? (
                        <span className="text-4xl font-bold text-gray-900 dark:text-white">
                          {t('pricing.custom', 'Custom')}
                        </span>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-bold text-gray-900 dark:text-white">
                              {formatPrice(period === 'monthly' ? price : monthlyEquivalent ?? price, plan.currency)}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {t('pricing.billing.monthly', 'per month')}
                            </span>
                          </div>
                          {period === 'yearly' && (
                            <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              {t('pricing.billing.billedYearly', 'Billed yearly')} · {formatPrice(price, plan.currency)}/{t('landing.pricingPreview.perYear', '/yr').replace('/', '')}
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    <ul className="mb-6 flex-1 space-y-3">
                      {Array.from({ length: plan.featureCount }).map((_, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                          <span>{t(`pricing.plans.${plan.id}.features.${i}`, plan.featureFallback[i])}</span>
                        </li>
                      ))}
                    </ul>

                    <Link
                      href={plan.href}
                      className={cn(
                        'inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition',
                        plan.popular
                          ? 'bg-gradient-to-r from-brand-500 to-accent-600 text-white shadow-lg shadow-brand-500/30 hover:from-brand-600 hover:to-accent-700'
                          : 'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-surface-800 dark:text-white dark:hover:bg-surface-700',
                      )}
                    >
                      {ctaLabel(plan.cta)}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="compare" className="py-20 px-4 bg-white dark:bg-surface-950">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
              {t('pricing.compare.title', 'Compare every feature')}
            </h2>
            <p className="mt-3 text-base text-gray-500 dark:text-gray-400 mx-auto max-w-2xl">
              {t('pricing.compare.subtitle', 'All plans include unlimited interviews, secure storage and EU/US data residency.')}
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 dark:border-surface-800 dark:bg-surface-900">
                    <th scope="col" className="px-6 py-4 text-left font-semibold text-gray-700 dark:text-gray-200 min-w-[180px]">
                      {t('pricing.compare.feature', 'Feature')}
                    </th>
                    {PLAN_DEFS.map((p) => (
                      <th
                        key={p.id}
                        scope="col"
                        className={cn(
                          'px-6 py-4 text-center font-semibold min-w-[140px]',
                          p.popular
                            ? 'text-brand-700 bg-brand-50/50 dark:text-brand-300 dark:bg-brand-500/10'
                            : 'text-gray-700 dark:text-gray-200',
                        )}
                      >
                        {t(`pricing.plans.${p.id}.name`, p.id)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row) => (
                    <tr key={row.key} className="border-b border-gray-100 last:border-0 dark:border-surface-800">
                      <th scope="row" className="px-6 py-3.5 text-left font-medium text-gray-700 dark:text-gray-300">
                        {t(`pricing.compare.rows.${row.key}`, row.key)}
                      </th>
                      {PLAN_DEFS.map((p) => (
                        <td
                          key={p.id}
                          className={cn(
                            'px-6 py-3.5 text-center text-sm',
                            p.popular
                              ? 'bg-brand-50/30 text-gray-900 font-medium dark:bg-brand-500/5 dark:text-white'
                              : 'text-gray-600 dark:text-gray-300',
                          )}
                        >
                          {renderCellValue(row.values[p.id])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="py-24 px-4 bg-gray-50 dark:bg-surface-900">
        <div className="mx-auto max-w-3xl">
          <div className="text-center mb-12">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400 mb-4">
              <HelpCircle className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
              {t('pricing.faq.title', 'Frequently asked questions')}
            </h2>
            <p className="mt-3 text-base text-gray-500 dark:text-gray-400">
              {t('pricing.faq.subtitle', "Can't find what you're looking for? Reach out to our team.")}
            </p>
          </div>

          <div className="space-y-3">
            {FAQ_KEYS.map((key) => {
              const open = openFaq === key;
              return (
                <div
                  key={key}
                  className={cn(
                    'rounded-xl border transition-all',
                    open
                      ? 'border-brand-200 bg-white shadow-sm dark:border-brand-800 dark:bg-surface-950'
                      : 'border-gray-200 bg-white dark:border-surface-800 dark:bg-surface-950',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : key)}
                    aria-expanded={open}
                    aria-controls={`faq-panel-${key}`}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {t(`pricing.faq.items.${key}.q`)}
                    </span>
                    {open ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                    )}
                  </button>
                  {open && (
                    <div
                      id={`faq-panel-${key}`}
                      className="px-5 pb-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300"
                    >
                      {t(`pricing.faq.items.${key}.a`)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-white dark:bg-surface-950">
        <div className="mx-auto max-w-5xl">
          <div className="relative overflow-hidden rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-indigo-700 to-accent-700" aria-hidden="true" />
            <div className="relative px-8 py-14 sm:px-12 sm:py-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
                {t('landing.cta.title', 'Ready to transform your hiring?')}
              </h2>
              <p className="mx-auto max-w-2xl text-base sm:text-lg text-white/80 mb-8">
                {t('landing.cta.subtitle', 'Join hundreds of teams already hiring smarter, faster and fairer with AI-ROS.')}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/register"
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-7 text-sm font-semibold text-gray-900 shadow-xl transition hover:bg-gray-100"
                >
                  {t('landing.cta.primary', 'Start free trial')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex h-12 items-center gap-2 rounded-xl border-2 border-white/30 bg-white/5 px-7 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
                >
                  {t('landing.cta.secondary', 'Talk to sales')}
                </Link>
              </div>
              {apiPlans !== null && (
                <p className="mt-6 text-xs text-white/50">
                  {formatNumber(apiPlans.length, locale)} {t('pricing.hero.eyebrow', 'Pricing')}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
