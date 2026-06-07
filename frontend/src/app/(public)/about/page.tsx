'use client';

import Link from 'next/link';
import {
  Sparkles,
  Compass,
  Eye,
  Heart,
  Scale,
  Brush,
  Smile,
  ArrowRight,
  Linkedin,
} from 'lucide-react';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { cn } from '@/lib/utils';

type ValueKey = 'transparency' | 'fairness' | 'craft' | 'candidates';

const VALUES: { key: ValueKey; icon: typeof Heart; gradient: string }[] = [
  { key: 'transparency', icon: Eye, gradient: 'from-blue-500 to-indigo-600' },
  { key: 'fairness', icon: Scale, gradient: 'from-emerald-500 to-teal-600' },
  { key: 'craft', icon: Brush, gradient: 'from-purple-500 to-fuchsia-600' },
  { key: 'candidates', icon: Smile, gradient: 'from-amber-500 to-orange-600' },
];

type MemberKey = 'alex' | 'priya' | 'diego' | 'lina' | 'yusuf' | 'claire';

const TEAM: { key: MemberKey; initials: string; gradient: string }[] = [
  { key: 'alex', initials: 'AD', gradient: 'from-blue-500 to-cyan-500' },
  { key: 'priya', initials: 'PS', gradient: 'from-purple-500 to-pink-500' },
  { key: 'diego', initials: 'DM', gradient: 'from-amber-500 to-orange-500' },
  { key: 'lina', initials: 'LP', gradient: 'from-rose-500 to-red-500' },
  { key: 'yusuf', initials: 'YO', gradient: 'from-emerald-500 to-teal-500' },
  { key: 'claire', initials: 'CL', gradient: 'from-indigo-500 to-blue-500' },
];

const INVESTOR_FALLBACK = [
  'Sequoia',
  'Accel',
  'Index Ventures',
  'Y Combinator',
  'First Round',
  'Headline',
];

export default function AboutPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-gray-200 bg-gradient-to-b from-white via-brand-50/40 to-white dark:border-surface-800 dark:from-surface-950 dark:via-brand-950/30 dark:to-surface-950">
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 backdrop-blur dark:border-brand-800 dark:bg-surface-900/60 dark:text-brand-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('about.hero.eyebrow', 'Our story')}
          </div>
          <h1 className="mt-5 text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight">
            {t('about.hero.title', 'Hiring should be human, not heavy.')}
          </h1>
          <p className="mt-5 mx-auto max-w-2xl text-base sm:text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
            {t(
              'about.hero.subtitle',
              'We started AI-ROS to give every recruiter the leverage of a Fortune-500 talent team — without the spreadsheets.',
            )}
          </p>
        </div>
      </section>

      <section className="py-20 px-4 bg-white dark:bg-surface-950">
        <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 transition hover:shadow-lg dark:border-surface-800 dark:bg-surface-900">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-600 shadow-lg shadow-brand-500/30">
              <Compass className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">
              {t('about.mission.title', 'Our mission')}
            </h2>
            <p className="mt-3 text-base text-gray-600 dark:text-gray-300 leading-relaxed">
              {t(
                'about.mission.body',
                'Make every hiring decision smarter, faster and fairer using AI that recruiters and candidates actually trust.',
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-8 transition hover:shadow-lg dark:border-surface-800 dark:bg-surface-900">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-lg shadow-purple-500/30">
              <Eye className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">
              {t('about.vision.title', 'Our vision')}
            </h2>
            <p className="mt-3 text-base text-gray-600 dark:text-gray-300 leading-relaxed">
              {t(
                'about.vision.body',
                'A world where the best person for the job is always found — regardless of network, geography or pedigree.',
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gray-50 dark:bg-surface-900">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
              {t('about.values.title', 'What we value')}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUES.map((v) => {
              const Icon = v.icon;
              return (
                <div
                  key={v.key}
                  className="group h-full rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:-translate-y-1 hover:shadow-lg dark:border-surface-800 dark:bg-surface-950"
                >
                  <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg transition-transform group-hover:scale-110', v.gradient)}>
                    <Icon className="h-6 w-6 text-white" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-gray-900 dark:text-white">
                    {t(`about.values.items.${v.key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    {t(`about.values.items.${v.key}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-white dark:bg-surface-950">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
              {t('about.team.title', 'Meet the team')}
            </h2>
            <p className="mt-3 mx-auto max-w-2xl text-base text-gray-500 dark:text-gray-400">
              {t('about.team.subtitle', 'A small, senior team building the future of hiring from Paris, NYC and remote.')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {TEAM.map((m) => (
              <article
                key={m.key}
                className="group rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-surface-800 dark:bg-surface-900"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-base font-bold text-white shadow-md',
                      m.gradient,
                    )}
                    aria-hidden="true"
                  >
                    {m.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                      {t(`about.team.members.${m.key}.name`)}
                    </h3>
                    <p className="truncate text-sm text-brand-600 dark:text-brand-400">
                      {t(`about.team.members.${m.key}.role`)}
                    </p>
                  </div>
                  <a
                    href="#"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-surface-800 dark:hover:text-gray-200"
                    aria-label={`LinkedIn ${t(`about.team.members.${m.key}.name`)}`}
                  >
                    <Linkedin className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
                <p className="mt-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {t(`about.team.members.${m.key}.bio`)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gray-50 dark:bg-surface-900">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t('about.investors.title', 'Backed by the best')}
          </h2>
          <p className="mt-3 mx-auto max-w-2xl text-base text-gray-500 dark:text-gray-400">
            {t('about.investors.subtitle', "We're proud to be supported by investors and partners who believe in fairer hiring.")}
          </p>
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 items-center">
            {INVESTOR_FALLBACK.map((name, i) => (
              <div
                key={name}
                className="flex h-16 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-base sm:text-lg font-bold tracking-tight text-gray-500 transition hover:border-gray-300 hover:text-gray-900 dark:border-surface-800 dark:bg-surface-950 dark:text-gray-400 dark:hover:text-white"
              >
                {t(`about.investors.backers.${i}`, name)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-white dark:bg-surface-950">
        <div className="mx-auto max-w-5xl">
          <div className="relative overflow-hidden rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-indigo-700 to-accent-700" aria-hidden="true" />
            <div className="relative px-8 py-14 sm:px-12 sm:py-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
                {t('about.cta.title', 'Want to join us?')}
              </h2>
              <p className="mx-auto max-w-2xl text-base sm:text-lg text-white/80 mb-8">
                {t('about.cta.subtitle', "We're hiring across product, engineering and design.")}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/jobs"
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-7 text-sm font-semibold text-gray-900 shadow-xl transition hover:bg-gray-100"
                >
                  {t('about.cta.primary', 'See open roles')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex h-12 items-center gap-2 rounded-xl border-2 border-white/30 bg-white/5 px-7 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
                >
                  {t('about.cta.secondary', 'Contact us')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
