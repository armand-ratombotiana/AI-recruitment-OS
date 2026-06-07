'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  Target,
  Code2,
  Workflow,
  ShieldCheck,
  Globe,
  ArrowRight,
  Check,
  Play,
  Star,
  Sparkles,
  Users,
  Building2,
  Clock,
  TrendingUp,
  ArrowUpRight,
} from 'lucide-react';
import {
  useLocaleStore,
  translate,
  formatNumber,
  interpolate,
} from '@/stores/locale-store';
import { api } from '@/services/api/client';
import type { BillingTypes } from '@/services/api/types';
import { cn } from '@/lib/utils';

const TRUSTED_BY = [
  'TechScale',
  'DataFlow',
  'CloudBridge',
  'NexusAI',
  'QuantumHR',
  'Velocity',
];

type FeatureKey = 'screening' | 'matching' | 'interviews' | 'pipeline' | 'compliance' | 'enterprise';

const FEATURES: { key: FeatureKey; icon: typeof Bot; gradient: string }[] = [
  { key: 'screening', icon: Bot, gradient: 'from-blue-500 to-indigo-600' },
  { key: 'matching', icon: Target, gradient: 'from-emerald-500 to-teal-600' },
  { key: 'interviews', icon: Code2, gradient: 'from-purple-500 to-fuchsia-600' },
  { key: 'pipeline', icon: Workflow, gradient: 'from-amber-500 to-orange-600' },
  { key: 'compliance', icon: ShieldCheck, gradient: 'from-rose-500 to-red-600' },
  { key: 'enterprise', icon: Globe, gradient: 'from-cyan-500 to-sky-600' },
];

const TESTIMONIALS: { key: string; gradient: string; initials: string }[] = [
  { key: 'sarah', gradient: 'from-blue-500 to-cyan-500', initials: 'SC' },
  { key: 'marcus', gradient: 'from-purple-500 to-pink-500', initials: 'MR' },
  { key: 'emily', gradient: 'from-amber-500 to-orange-500', initials: 'EW' },
  { key: 'noah', gradient: 'from-emerald-500 to-teal-500', initials: 'NB' },
];

function useCountUp(end: number, duration = 1800) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = Date.now();
          const tick = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(tick);
            else setCount(end);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);

  return { count, ref };
}

function FadeIn({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.unobserve(e.target);
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

type PricingPreview = {
  id: string;
  name: string;
  tagline: string;
  price_monthly: number | null;
  currency: string;
  features: string[];
  popular: boolean;
  cta: string;
  href: string;
};

export default function PublicLandingPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const candidates = useCountUp(125_000);
  const companies = useCountUp(520);
  const hours = useCountUp(38);
  const accuracy = useCountUp(95);

  const [jobsCount, setJobsCount] = useState<number | null>(null);
  const [plans, setPlans] = useState<BillingTypes.Plan[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.jobs.list({ status: 'open', limit: '1' });
        if (!active) return;
        const raw = res as unknown as { total?: number; data?: unknown[]; items?: unknown[] };
        const total =
          typeof raw.total === 'number'
            ? raw.total
            : Array.isArray(raw.data)
              ? raw.data.length
              : Array.isArray(raw.items)
                ? raw.items.length
                : 0;
        setJobsCount(total);
      } catch {
        if (active) setJobsCount(0);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.billing.listPlans();
        if (!active) return;
        const list = Array.isArray(res) ? res : ((res as unknown as { data?: BillingTypes.Plan[] }).data ?? []);
        if (active && Array.isArray(list) && list.length > 0) setPlans(list);
      } catch {
        if (active) setPlans(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const pricingPreview = useMemo<PricingPreview[]>(() => {
    if (plans && plans.length >= 3) {
      const subset = plans.slice(0, 3);
      return subset.map((p, i) => ({
        id: p.id,
        name: p.name,
        tagline: p.description,
        price_monthly: typeof p.price_monthly === 'number' ? p.price_monthly : null,
        currency: p.currency || 'USD',
        features: (p.features || []).slice(0, 5),
        popular: !!p.popular || i === 1,
        cta: t('pricing.ctaTrial', 'Start 14-day trial'),
        href: '/register',
      }));
    }
    return [
      {
        id: 'starter',
        name: t('pricing.plans.starter.name', 'Starter'),
        tagline: t('pricing.plans.starter.tagline', 'For growing teams hiring regularly'),
        price_monthly: 49,
        currency: 'USD',
        features: (
          (translate(locale, 'pricing.plans.starter.features') as unknown as string[]) ||
          ['Up to 200 candidates / month', '5 active jobs', 'AI matching + screening', 'Email support', '3 team members']
        ).slice(0, 5),
        popular: false,
        cta: t('pricing.ctaTrial', 'Start 14-day trial'),
        href: '/register',
      },
      {
        id: 'pro',
        name: t('pricing.plans.pro.name', 'Pro'),
        tagline: t('pricing.plans.pro.tagline', 'For scaling teams that hire continuously'),
        price_monthly: 199,
        currency: 'USD',
        features: (
          (translate(locale, 'pricing.plans.pro.features') as unknown as string[]) ||
          ['Up to 1,000 candidates / month', 'Unlimited active jobs', 'Advanced AI matching', 'Live coding interviews', '10 team members']
        ).slice(0, 5),
        popular: true,
        cta: t('pricing.ctaTrial', 'Start 14-day trial'),
        href: '/register',
      },
      {
        id: 'enterprise',
        name: t('pricing.plans.enterprise.name', 'Enterprise'),
        tagline: t('pricing.plans.enterprise.tagline', 'For large organisations with bespoke needs'),
        price_monthly: null,
        currency: 'USD',
        features: (
          (translate(locale, 'pricing.plans.enterprise.features') as unknown as string[]) ||
          ['Unlimited candidates', 'Unlimited jobs & seats', 'Custom AI models', 'Dedicated CSM', 'SSO / SAML, SCIM']
        ).slice(0, 5),
        popular: false,
        cta: t('pricing.ctaContact', 'Contact sales'),
        href: '/contact',
      },
    ];
  }, [plans, locale, t]);

  const formatPrice = (value: number, currency: string) => {
    try {
      return new Intl.NumberFormat(
        locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : 'en-US',
        { style: 'currency', currency: (currency || 'USD').toUpperCase(), maximumFractionDigits: 0 },
      ).format(value);
    } catch {
      return `$${value}`;
    }
  };

  return (
    <div>
      <section className="relative overflow-hidden border-b border-gray-200 dark:border-surface-800">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-indigo-700 to-accent-700" aria-hidden="true" />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.25),transparent_40%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.15),transparent_40%)]"
        />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-32 text-center">
          <FadeIn>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              {t('landing.hero.eyebrow', 'Now with AI Copilot v3')}
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
            </div>
          </FadeIn>

          <FadeIn className="mt-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight text-white leading-[1.1]">
              {t('landing.hero.title', 'The Future of Hiring')}
              <br />
              <span className="bg-gradient-to-r from-blue-200 via-purple-200 to-pink-200 bg-clip-text text-transparent">
                {t('landing.hero.titleHighlight', 'is Autonomous')}
              </span>
            </h1>
          </FadeIn>

          <FadeIn className="mt-6">
            <p className="mx-auto max-w-2xl text-base sm:text-lg text-white/80 leading-relaxed">
              {t(
                'landing.hero.subtitle',
                'AI-ROS deploys intelligent agents that screen candidates, conduct interviews, and surface the best hires — so your team can focus on building.',
              )}
            </p>
          </FadeIn>

          <FadeIn className="mt-10">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/register"
                className="group inline-flex h-12 items-center gap-2 rounded-xl bg-white px-7 text-sm font-semibold text-gray-900 shadow-xl shadow-black/20 transition hover:bg-gray-100 hover:shadow-2xl hover:scale-[1.02]"
              >
                {t('landing.hero.getStarted', 'Get started free')}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <Link
                href="/jobs"
                className="inline-flex h-12 items-center gap-2 rounded-xl border-2 border-white/30 bg-white/5 px-7 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                {t('landing.hero.viewJobs', 'View open positions')}
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/70">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                {t('landing.hero.noCard', 'No credit card required')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                {t('landing.hero.trial', '14-day free trial')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                {t('landing.hero.cancel', 'Cancel anytime')}
              </span>
            </div>
          </FadeIn>

          {jobsCount !== null && jobsCount > 0 && (
            <FadeIn className="mt-10">
              <Link
                href="/jobs"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/20"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {interpolate(
                  t('public.home.positionsCtaDesc', 'Browse {count} open roles across {companies} companies and apply in minutes.'),
                  { count: formatNumber(jobsCount, locale), companies: formatNumber(companies.count || 520, locale) },
                )}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </FadeIn>
          )}
        </div>
      </section>

      <section className="border-b border-gray-100 bg-white py-10 dark:border-surface-800 dark:bg-surface-950">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-6">
            {t('landing.trusted', 'Trusted by innovative teams worldwide')}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-6 items-center">
            {TRUSTED_BY.map((c) => (
              <div
                key={c}
                className="text-center text-base sm:text-lg font-bold tracking-tight text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
              >
                {c}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-24 px-4 bg-white dark:bg-surface-950">
        <div className="mx-auto max-w-7xl">
          <FadeIn className="text-center mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400 mb-3">
              {t('landing.features.eyebrow', 'Features')}
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
              {t('landing.features.title', 'Everything you need to hire smarter')}
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-gray-500 dark:text-gray-400">
              {t('landing.features.subtitle', 'Powered by AI, designed for humans. A complete platform from sourcing to offer.')}
            </p>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <FadeIn key={f.key}>
                  <div className="group h-full rounded-2xl border border-gray-100 bg-white p-7 transition-all hover:-translate-y-1 hover:border-gray-200 hover:shadow-xl hover:shadow-gray-200/40 dark:border-surface-800 dark:bg-surface-900 dark:hover:border-surface-700 dark:hover:shadow-black/30">
                    <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg transition-transform group-hover:scale-110', f.gradient)}>
                      <Icon className="h-6 w-6 text-white" aria-hidden="true" />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-gray-900 dark:text-white">
                      {t(`landing.features.items.${f.key}.title`)}
                    </h3>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                      {t(`landing.features.items.${f.key}.description`)}
                    </p>
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how" className="py-24 px-4 bg-gray-50 dark:bg-surface-900">
        <div className="mx-auto max-w-6xl">
          <FadeIn className="text-center mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400 mb-3">
              {t('landing.how.eyebrow', 'How it works')}
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
              {t('landing.how.title', 'Three steps to autonomous hiring')}
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-gray-500 dark:text-gray-400">
              {t('landing.how.subtitle', 'Go from job description to top candidate in minutes, not weeks.')}
            </p>
          </FadeIn>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="hidden md:block absolute top-7 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-brand-300 via-accent-400 to-brand-300 opacity-30" aria-hidden="true" />
            {[
              { num: '01', icon: ArrowUpRight, key: 'one' },
              { num: '02', icon: Bot, key: 'two' },
              { num: '03', icon: Check, key: 'three' },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <FadeIn key={s.num}>
                  <div className="relative text-center">
                    <div className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-600 shadow-lg shadow-brand-500/30">
                      <Icon className="h-7 w-7 text-white" aria-hidden="true" />
                    </div>
                    <div className="mt-5 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                      {`${t('landing.how.eyebrow', 'Step')} ${s.num}`}
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
                      {t(`landing.how.steps.${s.key}.title`)}
                    </h3>
                    <p className="mt-2 mx-auto max-w-xs text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                      {t(`landing.how.steps.${s.key}.description`)}
                    </p>
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gradient-to-br from-surface-950 via-slate-900 to-surface-950 dark:from-black dark:via-surface-950 dark:to-black relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900/30 via-accent-900/30 to-brand-900/30" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl">
          <FadeIn className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-300 mb-3">
              {t('landing.stats.eyebrow', 'By the numbers')}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              {t('landing.stats.title', 'Results recruiters love')}
            </h2>
          </FadeIn>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { stat: candidates, icon: Users, suffix: '+', label: t('landing.stats.candidates', 'Candidates processed') },
              { stat: companies, icon: Building2, suffix: '+', label: t('landing.stats.companies', 'Companies hiring') },
              { stat: hours, icon: Clock, suffix: 'h', label: t('landing.stats.time', 'Hours saved per hire') },
              { stat: accuracy, icon: TrendingUp, suffix: '%', label: t('landing.stats.accuracy', 'Matching accuracy') },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} ref={s.stat.ref} className="text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                    <Icon className="h-5 w-5 text-brand-300" aria-hidden="true" />
                  </div>
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tabular-nums">
                    {formatNumber(s.stat.count, locale)}
                    <span className="text-brand-300">{s.suffix}</span>
                  </p>
                  <p className="mt-2 text-sm font-medium text-white/60">{s.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="testimonials" className="py-24 px-4 bg-white dark:bg-surface-950">
        <div className="mx-auto max-w-7xl">
          <FadeIn className="text-center mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400 mb-3">
              {t('landing.testimonials.eyebrow', 'Testimonials')}
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
              {t('landing.testimonials.title', 'Trusted by leading teams')}
            </h2>
            <p className="text-lg text-gray-500 dark:text-gray-400">
              {t('landing.testimonials.subtitle', 'Real stories from real customers.')}
            </p>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {TESTIMONIALS.map((tst) => (
              <FadeIn key={tst.key}>
                <figure className="h-full rounded-2xl border border-gray-100 bg-white p-7 shadow-sm transition-all hover:shadow-lg dark:border-surface-800 dark:bg-surface-900">
                  <div className="flex gap-0.5 mb-4" aria-label="5 star rating">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                    ))}
                  </div>
                  <blockquote className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    &ldquo;{t(`landing.testimonials.items.${tst.key}.quote`)}&rdquo;
                  </blockquote>
                  <figcaption className="mt-5 flex items-center gap-3">
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white', tst.gradient)}>
                      {tst.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {t(`landing.testimonials.items.${tst.key}.name`)}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {t(`landing.testimonials.items.${tst.key}.role`)}
                      </p>
                    </div>
                  </figcaption>
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-surface-800">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 dark:text-brand-400">
                      <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                      {t(`landing.testimonials.items.${tst.key}.metric`)}
                    </span>
                  </div>
                </figure>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24 px-4 bg-gray-50 dark:bg-surface-900">
        <div className="mx-auto max-w-7xl">
          <FadeIn className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400 mb-3">
              {t('landing.pricingPreview.eyebrow', 'Pricing')}
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
              {t('landing.pricingPreview.title', 'Plans for every stage')}
            </h2>
            <p className="text-lg text-gray-500 dark:text-gray-400 mb-6">
              {t('landing.pricingPreview.subtitle', 'Start free, scale as you grow. Cancel anytime.')}
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              {t('landing.pricingPreview.seeAll', 'See full pricing')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </FadeIn>

          <div className="mx-auto grid max-w-5xl grid-cols-1 md:grid-cols-3 gap-6">
            {pricingPreview.map((tier) => (
              <FadeIn key={tier.id}>
                <div className={cn('relative h-full rounded-2xl transition-all', tier.popular ? 'shadow-2xl shadow-brand-500/20 scale-[1.02]' : 'hover:shadow-lg')}>
                  {tier.popular && (
                    <>
                      <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-brand-500 via-accent-500 to-brand-500" aria-hidden="true" />
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                        <span className="rounded-full bg-gradient-to-r from-brand-500 to-accent-600 px-3.5 py-1 text-xs font-semibold text-white shadow-lg">
                          {t('landing.pricingPreview.mostPopular', 'Most popular')}
                        </span>
                      </div>
                    </>
                  )}
                  <div className={cn('relative flex h-full flex-col rounded-2xl bg-white p-7 dark:bg-surface-950', !tier.popular && 'border border-gray-200 dark:border-surface-800')}>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{tier.name}</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{tier.tagline}</p>
                    <div className="mt-5 mb-6">
                      {tier.price_monthly != null ? (
                        <>
                          <span className="text-4xl font-bold text-gray-900 dark:text-white">
                            {formatPrice(tier.price_monthly, tier.currency)}
                          </span>
                          <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">
                            {t('landing.pricingPreview.perMonth', '/mo')}
                          </span>
                        </>
                      ) : (
                        <span className="text-4xl font-bold text-gray-900 dark:text-white">
                          {t('pricing.custom', 'Custom')}
                        </span>
                      )}
                    </div>
                    <ul className="mb-6 flex-1 space-y-3">
                      {tier.features.map((f, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={tier.href}
                      className={cn(
                        'inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition',
                        tier.popular
                          ? 'bg-gradient-to-r from-brand-500 to-accent-600 text-white shadow-lg shadow-brand-500/30 hover:from-brand-600 hover:to-accent-700'
                          : 'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-surface-800 dark:text-white dark:hover:bg-surface-700',
                      )}
                    >
                      {tier.cta}
                    </Link>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 px-4 bg-white dark:bg-surface-950">
        <div className="mx-auto max-w-5xl">
          <FadeIn>
            <div className="relative overflow-hidden rounded-3xl">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-indigo-700 to-accent-700" aria-hidden="true" />
              <div
                className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_30%_40%,rgba(255,255,255,0.2),transparent_50%)]"
                aria-hidden="true"
              />
              <div className="relative px-8 py-16 sm:px-12 sm:py-20 text-center">
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4">
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
              </div>
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
