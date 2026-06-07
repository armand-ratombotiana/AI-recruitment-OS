'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  MapPin,
  Clock,
  Mail,
  Send,
  CheckCircle2,
  AlertCircle,
  Twitter,
  Linkedin,
  Github,
  Globe,
  Briefcase,
  HeadphonesIcon,
  Handshake,
  Newspaper,
} from 'lucide-react';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { api, APIError } from '@/services/api/client';
import { cn } from '@/lib/utils';

type TopicKey = 'sales' | 'support' | 'partnership' | 'press' | 'other';

const TOPICS: TopicKey[] = ['sales', 'support', 'partnership', 'press', 'other'];

type OfficeKey = 'paris' | 'newyork' | 'remote';

const OFFICES: { key: OfficeKey; gradient: string }[] = [
  { key: 'paris', gradient: 'from-blue-500 to-indigo-600' },
  { key: 'newyork', gradient: 'from-purple-500 to-fuchsia-600' },
  { key: 'remote', gradient: 'from-emerald-500 to-teal-600' },
];

const CHANNELS: { key: 'sales' | 'support' | 'press'; icon: typeof Mail; gradient: string }[] = [
  { key: 'sales', icon: Briefcase, gradient: 'from-blue-500 to-indigo-600' },
  { key: 'support', icon: HeadphonesIcon, gradient: 'from-emerald-500 to-teal-600' },
  { key: 'press', icon: Newspaper, gradient: 'from-purple-500 to-fuchsia-600' },
];

const SOCIAL: { label: string; icon: typeof Twitter; href: string }[] = [
  { label: 'Twitter', icon: Twitter, href: 'https://twitter.com/airos' },
  { label: 'LinkedIn', icon: Linkedin, href: 'https://linkedin.com/company/airos' },
  { label: 'GitHub', icon: Github, href: 'https://github.com/airos' },
  { label: 'Website', icon: Globe, href: 'https://ai-ros.com' },
];

type FormState = {
  name: string;
  email: string;
  company: string;
  topic: TopicKey;
  message: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    company: '',
    topic: 'sales',
    message: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [serverError, setServerError] = useState<string>('');

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = t('contact.form.errors.name', 'Please enter your name');
    if (!form.email.trim() || !EMAIL_RE.test(form.email.trim())) {
      next.email = t('contact.form.errors.email', 'Please enter a valid work email');
    }
    if (form.message.trim().length < 10) {
      next.message = t('contact.form.errors.message', 'Please write a short message (at least 10 characters)');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;

    setStatus('submitting');
    try {
      const topicLabel = t(`contact.form.topics.${form.topic}`, form.topic);
      const subject = `[${topicLabel}] ${form.name}${form.company ? ' · ' + form.company : ''}`;
      const messageBody = [
        `Name: ${form.name}`,
        `Email: ${form.email}`,
        form.company ? `Company: ${form.company}` : null,
        `Topic: ${topicLabel}`,
        '',
        form.message,
      ]
        .filter(Boolean)
        .join('\n');

      await api.support.createTicket({
        subject,
        message: messageBody,
        priority: form.topic === 'support' ? 'high' : 'normal',
        category: form.topic,
      });
      setStatus('success');
      setForm({ name: '', email: '', company: '', topic: 'sales', message: '' });
    } catch (err) {
      const e2 = err as APIError;
      setServerError(e2?.message || t('contact.form.errorBody', 'Something went wrong on our end. Please email us at hello@ai-ros.com instead.'));
      setStatus('error');
    }
  };

  const inputBase =
    'block w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-gray-900 transition focus:outline-none focus:ring-2 dark:bg-surface-900 dark:text-white';
  const inputOk =
    'border-gray-200 focus:border-brand-400 focus:ring-brand-200 dark:border-surface-700 dark:focus:border-brand-500 dark:focus:ring-brand-500/30';
  const inputErr =
    'border-red-300 focus:border-red-400 focus:ring-red-200 dark:border-red-800 dark:focus:border-red-500 dark:focus:ring-red-500/30';

  return (
    <div>
      <section className="relative overflow-hidden border-b border-gray-200 bg-gradient-to-b from-white via-brand-50/40 to-white dark:border-surface-800 dark:from-surface-950 dark:via-brand-950/30 dark:to-surface-950">
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 backdrop-blur dark:border-brand-800 dark:bg-surface-900/60 dark:text-brand-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('contact.hero.eyebrow', 'Contact')}
          </div>
          <h1 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t('contact.hero.title', "Let's talk hiring")}
          </h1>
          <p className="mt-5 mx-auto max-w-2xl text-base sm:text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
            {t(
              'contact.hero.subtitle',
              "Questions about pricing, security, integrations or just want a demo? We'd love to hear from you.",
            )}
          </p>
        </div>
      </section>

      <section className="py-16 px-4 bg-white dark:bg-surface-950">
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm dark:border-surface-800 dark:bg-surface-900">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {t('contact.form.title', 'Send us a message')}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t('contact.form.subtitle', 'We typically reply within one business day.')}
              </p>

              {status === 'success' ? (
                <div
                  role="status"
                  className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-emerald-900 dark:text-emerald-200">
                    {t('contact.form.successTitle', 'Message sent!')}
                  </h3>
                  <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-300">
                    {t('contact.form.successBody', "Thanks for reaching out. We'll get back to you within one business day.")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatus('idle')}
                    className="mt-5 inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {t('contact.form.submit', 'Send another message')}
                  </button>
                </div>
              ) : (
                <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
                  {status === 'error' && serverError && (
                    <div
                      role="alert"
                      className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900/40 dark:bg-red-950/20"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                      <div>
                        <p className="font-semibold text-red-900 dark:text-red-200">
                          {t('contact.form.errorTitle', 'Could not send')}
                        </p>
                        <p className="mt-1 text-red-800 dark:text-red-300">{serverError}</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="contact-name"
                        className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200"
                      >
                        {t('contact.form.name', 'Full name')}
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        autoComplete="name"
                        required
                        value={form.name}
                        onChange={(e) => update('name', e.target.value)}
                        placeholder={t('contact.form.namePlaceholder', 'Jane Doe')}
                        aria-invalid={!!errors.name}
                        aria-describedby={errors.name ? 'contact-name-err' : undefined}
                        className={cn(inputBase, errors.name ? inputErr : inputOk)}
                      />
                      {errors.name && (
                        <p id="contact-name-err" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                          {errors.name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="contact-email"
                        className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200"
                      >
                        {t('contact.form.email', 'Work email')}
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={form.email}
                        onChange={(e) => update('email', e.target.value)}
                        placeholder={t('contact.form.emailPlaceholder', 'jane@company.com')}
                        aria-invalid={!!errors.email}
                        aria-describedby={errors.email ? 'contact-email-err' : undefined}
                        className={cn(inputBase, errors.email ? inputErr : inputOk)}
                      />
                      {errors.email && (
                        <p id="contact-email-err" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                          {errors.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="contact-company"
                      className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      {t('contact.form.company', 'Company')}
                    </label>
                    <input
                      id="contact-company"
                      type="text"
                      autoComplete="organization"
                      value={form.company}
                      onChange={(e) => update('company', e.target.value)}
                      placeholder={t('contact.form.companyPlaceholder', 'Acme Inc.')}
                      className={cn(inputBase, inputOk)}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="contact-topic"
                      className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      {t('contact.form.topic', 'How can we help?')}
                    </label>
                    <select
                      id="contact-topic"
                      value={form.topic}
                      onChange={(e) => update('topic', e.target.value as TopicKey)}
                      className={cn(inputBase, inputOk, 'pr-8')}
                    >
                      {TOPICS.map((topic) => (
                        <option key={topic} value={topic}>
                          {t(`contact.form.topics.${topic}`, topic)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="contact-message"
                      className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      {t('contact.form.message', 'Your message')}
                    </label>
                    <textarea
                      id="contact-message"
                      rows={5}
                      required
                      value={form.message}
                      onChange={(e) => update('message', e.target.value)}
                      placeholder={t('contact.form.messagePlaceholder', "Tell us a bit about your team and what you're trying to solve…")}
                      aria-invalid={!!errors.message}
                      aria-describedby={errors.message ? 'contact-message-err' : undefined}
                      className={cn(inputBase, errors.message ? inputErr : inputOk, 'resize-y')}
                    />
                    {errors.message && (
                      <p id="contact-message-err" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                        {errors.message}
                      </p>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('contact.form.consent', 'By submitting this form you agree to our Privacy Policy.')}
                  </p>

                  <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-accent-600 px-6 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:from-brand-600 hover:to-accent-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {status === 'submitting' ? (
                      <>
                        <span
                          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                          aria-hidden="true"
                        />
                        {t('contact.form.submitting', 'Sending…')}
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" aria-hidden="true" />
                        {t('contact.form.submit', 'Send message')}
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('contact.channels.title', 'Other ways to reach us')}
              </h3>
              <ul className="mt-4 space-y-3">
                {CHANNELS.map((c) => {
                  const Icon = c.icon;
                  return (
                    <li key={c.key} className="flex items-start gap-3">
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm', c.gradient)}>
                        <Icon className="h-4 w-4 text-white" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {t(`contact.channels.${c.key}Title`)}
                        </p>
                        <a
                          href={`mailto:${t(`contact.channels.${c.key}Body`)}`}
                          className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 break-all"
                        >
                          {t(`contact.channels.${c.key}Body`)}
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('contact.social.title', 'Follow us')}
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {SOCIAL.map((s) => {
                  const Icon = s.icon;
                  return (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-300 dark:hover:border-brand-500 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
                      aria-label={s.label}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </a>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="py-20 px-4 bg-gray-50 dark:bg-surface-900">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
              {t('contact.offices.title', 'Our offices')}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {OFFICES.map((o) => (
              <article
                key={o.key}
                className="group rounded-2xl border border-gray-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-surface-800 dark:bg-surface-950"
              >
                <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg transition-transform group-hover:scale-110', o.gradient)}>
                  <MapPin className="h-6 w-6 text-white" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-gray-900 dark:text-white">
                  {t(`contact.offices.items.${o.key}.city`)}
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {t(`contact.offices.items.${o.key}.address`)}
                </p>
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {t(`contact.offices.items.${o.key}.tz`)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 bg-white dark:bg-surface-950">
        <div className="mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-indigo-700 to-accent-700" aria-hidden="true" />
            <div className="relative px-8 py-12 sm:px-12 sm:py-14 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                <Handshake className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {t('landing.cta.title', 'Ready to transform your hiring?')}
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base text-white/80">
                {t('landing.cta.subtitle', 'Join hundreds of teams already hiring smarter, faster and fairer with AI-ROS.')}
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/register"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-gray-900 shadow-xl transition hover:bg-gray-100"
                >
                  {t('landing.cta.primary', 'Start free trial')}
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-white/30 bg-white/5 px-6 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
                >
                  {t('landing.pricingPreview.seeAll', 'See full pricing')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
