'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Bot, Menu, X } from 'lucide-react';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LanguageToggle } from '@/components/ui/language-toggle';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { label: t('public.nav.home', 'Home'), href: '/' },
    { label: t('public.nav.jobs', 'Open Positions'), href: '/jobs' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 dark:bg-surface-950 dark:text-gray-100">
      <header
        className={`sticky top-0 z-40 w-full transition-all duration-300 ${
          scrolled
            ? 'border-b border-gray-200 bg-white/90 backdrop-blur-md dark:border-surface-800 dark:bg-surface-950/90'
            : 'border-b border-transparent bg-white/60 backdrop-blur-sm dark:bg-surface-950/60'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 group"
            aria-label={t('common.appName', 'AI-ROS')}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-600 shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform">
              <Bot className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-lg font-bold tracking-tight">AI-ROS</span>
              <span className="hidden sm:block text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">
                {t('public.nav.tagline', 'AI-native recruitment')}
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-7" aria-label="Primary">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700 transition-colors"
            >
              {t('public.nav.login', 'Sign in')}
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center rounded-lg bg-gradient-to-r from-brand-500 to-accent-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/30 hover:from-brand-600 hover:to-accent-700 transition-colors"
            >
              {t('public.nav.signup', 'Get started')}
            </Link>
          </div>

          <button
            type="button"
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-surface-800"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-surface-800 bg-white dark:bg-surface-950">
            <div className="space-y-1 px-4 py-3">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-800"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-surface-800">
                <LanguageToggle />
                <ThemeToggle />
              </div>
              <Link
                href="/login"
                className="mt-2 block rounded-lg border border-gray-200 px-3 py-2 text-center text-sm font-medium text-gray-700 dark:border-surface-700 dark:text-gray-200"
                onClick={() => setMobileOpen(false)}
              >
                {t('public.nav.login', 'Sign in')}
              </Link>
              <Link
                href="/register"
                className="block rounded-lg bg-gradient-to-r from-brand-500 to-accent-600 px-3 py-2 text-center text-sm font-semibold text-white"
                onClick={() => setMobileOpen(false)}
              >
                {t('public.nav.signup', 'Get started')}
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-gray-200 bg-gray-50 dark:border-surface-800 dark:bg-surface-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
            <div className="col-span-2">
              <Link href="/" className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-600">
                  <Bot className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <span className="text-lg font-bold">AI-ROS</span>
              </Link>
              <p className="mt-3 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                {t(
                  'public.footer.tagline',
                  'AI-native recruitment platform for modern teams. Hire faster, fairer, smarter.',
                )}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('public.footer.product', 'Product')}
              </h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-500 dark:text-gray-400">
                <li>
                  <Link href="/#features" className="hover:text-gray-900 dark:hover:text-white">
                    {t('public.footer.links.features', 'Features')}
                  </Link>
                </li>
                <li>
                  <Link href="/#pricing" className="hover:text-gray-900 dark:hover:text-white">
                    {t('public.footer.links.pricing', 'Pricing')}
                  </Link>
                </li>
                <li>
                  <Link href="/#features" className="hover:text-gray-900 dark:hover:text-white">
                    {t('public.footer.links.integrations', 'Integrations')}
                  </Link>
                </li>
                <li>
                  <Link href="/#features" className="hover:text-gray-900 dark:hover:text-white">
                    {t('public.footer.links.api', 'API Docs')}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('public.footer.company', 'Company')}
              </h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-500 dark:text-gray-400">
                <li>
                  <Link href="/" className="hover:text-gray-900 dark:hover:text-white">
                    {t('public.footer.links.about', 'About')}
                  </Link>
                </li>
                <li>
                  <Link href="/jobs" className="hover:text-gray-900 dark:hover:text-white">
                    {t('public.footer.links.careers', 'Careers')}
                  </Link>
                </li>
                <li>
                  <Link href="/" className="hover:text-gray-900 dark:hover:text-white">
                    {t('public.footer.links.contact', 'Contact')}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('public.footer.legal', 'Legal')}
              </h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-500 dark:text-gray-400">
                <li>
                  <Link href="/" className="hover:text-gray-900 dark:hover:text-white">
                    {t('public.footer.links.privacy', 'Privacy')}
                  </Link>
                </li>
                <li>
                  <Link href="/" className="hover:text-gray-900 dark:hover:text-white">
                    {t('public.footer.links.terms', 'Terms')}
                  </Link>
                </li>
                <li>
                  <Link href="/" className="hover:text-gray-900 dark:hover:text-white">
                    {t('public.footer.links.cookies', 'Cookies')}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-gray-200 pt-6 dark:border-surface-800 sm:flex-row">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('public.footer.rights', '© 2026 AI-ROS. All rights reserved.')}
            </p>
            <div className="flex items-center gap-3">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
