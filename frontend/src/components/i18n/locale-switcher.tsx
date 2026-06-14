'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocaleStore, LOCALE_META, translate, type Locale } from '@/stores/locale-store';
import { isRTLLocale } from '@/utils/rtl';
import {
  formatDateTimeLocale,
  formatNumberLocale,
  formatCurrencyLocale,
  getLocaleCurrency,
} from '@/utils/locale-formatting';
import { useRTL } from '@/hooks/use-rtl';
import { Globe, ChevronDown, Check, ArrowRightLeft } from 'lucide-react';

const ALL_LOCALES: Locale[] = ['en', 'fr', 'es', 'ar', 'he'];

const LOCALE_FLAGS: Record<Locale, string> = {
  en: '🇺🇸',
  fr: '🇫🇷',
  es: '🇪🇸',
  ar: '🇸🇦',
  he: '🇮🇱',
};

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const [open, setOpen] = useState(false);
  const { isRTL } = useRTL();
  const ref = useRef<HTMLDivElement>(null);

  const t = useCallback(
    (key: string, fallback?: string) => translate(locale, key, fallback),
    [locale]
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const now = new Date();
  const sampleNumber = 1234567.89;
  const sampleCurrency = 9999.99;

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700 transition-colors"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('locale.selectLanguage', 'Select language')}
      >
        <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{LOCALE_FLAGS[locale]}</span>
        <span className="hidden sm:inline">{LOCALE_META[locale]?.native ?? locale}</span>
        {isRTL && (
          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/20 px-1 rounded">
            RTL
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-xl dark:border-surface-700 dark:bg-surface-800 ${
            isRTL ? 'left-0' : 'right-0'
          } sm:${isRTL ? 'right-0' : 'left-auto'}`}
          role="listbox"
          aria-label={t('locale.selectLanguage', 'Select language')}
        >
          <div className="p-3 border-b border-gray-100 dark:border-surface-700">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              {t('locale.title', 'Language & Region')}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5">
            {ALL_LOCALES.map((loc) => {
              const meta = LOCALE_META[loc];
              const isActive = loc === locale;
              const isRtl = isRTLLocale(loc);
              return (
                <button
                  key={loc}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    setLocale(loc);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-700'
                  }`}
                >
                  <span className="text-lg" aria-hidden="true">
                    {LOCALE_FLAGS[loc]}
                  </span>
                  <div className="flex-1 min-w-0 text-start">
                    <div className="font-medium">{meta?.native ?? loc}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{meta?.label ?? loc}</div>
                  </div>
                  {isRtl && (
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/20 px-1.5 py-0.5 rounded">
                      RTL
                    </span>
                  )}
                  {isActive && (
                    <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-gray-100 dark:border-surface-700 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t('locale.preview', 'Preview')}
            </div>

            <div className="grid grid-cols-1 gap-1.5 text-xs">
              <div className="flex items-center justify-between rounded-md bg-gray-50 dark:bg-surface-900 px-2.5 py-1.5">
                <span className="text-gray-500 dark:text-gray-400">
                  {t('locale.sampleDate', 'Date')}
                </span>
                <span className="font-mono text-gray-900 dark:text-gray-100" dir={isRTLLocale(locale) ? 'rtl' : 'ltr'}>
                  {formatDateTimeLocale(now, locale)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-gray-50 dark:bg-surface-900 px-2.5 py-1.5">
                <span className="text-gray-500 dark:text-gray-400">
                  {t('locale.sampleNumber', 'Number')}
                </span>
                <span className="font-mono text-gray-900 dark:text-gray-100" dir={isRTLLocale(locale) ? 'rtl' : 'ltr'}>
                  {formatNumberLocale(sampleNumber, locale)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-gray-50 dark:bg-surface-900 px-2.5 py-1.5">
                <span className="text-gray-500 dark:text-gray-400">
                  {t('locale.sampleCurrency', 'Currency')}
                </span>
                <span className="font-mono text-gray-900 dark:text-gray-100" dir={isRTLLocale(locale) ? 'rtl' : 'ltr'}>
                  {formatCurrencyLocale(sampleCurrency, locale, getLocaleCurrency(locale))}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px] text-gray-400 dark:text-gray-500">
              <span>{t('locale.direction', 'Direction')}</span>
              <span className="font-medium">
                {isRTLLocale(locale)
                  ? t('locale.rtl', 'Right-to-Left')
                  : t('locale.ltr', 'Left-to-Right')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
