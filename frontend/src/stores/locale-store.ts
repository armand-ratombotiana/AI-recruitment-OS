'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import en from '@/locales/en.json';
import fr from '@/locales/fr.json';
import es from '@/locales/es.json';

export type Locale = 'en' | 'fr' | 'es';

export const LOCALE_META: Record<Locale, { label: string; native: string; flag: string }> = {
  en: { label: 'English', native: 'English', flag: 'EN' },
  fr: { label: 'French', native: 'Français', flag: 'FR' },
  es: { label: 'Spanish', native: 'Español', flag: 'ES' },
};

const DICTIONARIES: Record<Locale, any> = { en, fr, es };

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale: (locale) => {
        set({ locale });
        if (typeof document !== 'undefined') {
          document.documentElement.lang = locale;
        }
      },
    }),
    {
      name: 'airos_locale',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return localStorage;
      }),
    }
  )
);

function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc != null ? acc[k] : undefined), obj);
}

export function translate(
  locale: Locale,
  key: string,
  fallback?: string
): string {
  const v = getByPath(DICTIONARIES[locale], key);
  if (typeof v === 'string') return v;
  const enV = getByPath(DICTIONARIES.en, key);
  if (typeof enV === 'string') return enV;
  return fallback ?? key;
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export function formatDate(date: Date | string, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(localeToBcp47(locale), opts).format(d);
}

export function formatNumber(value: number, locale: Locale, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeToBcp47(locale), opts).format(value);
}

export function formatRelativeTime(iso: string, locale: Locale): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(localeToBcp47(locale), { numeric: 'auto' });
  const min = Math.floor(diff / 60000);
  if (min < 1) return rtf.format(0, 'second');
  if (min < 60) return rtf.format(-min, 'minute');
  const hr = Math.floor(min / 60);
  if (hr < 24) return rtf.format(-hr, 'hour');
  const d = Math.floor(hr / 24);
  if (d < 30) return rtf.format(-d, 'day');
  const mo = Math.floor(d / 30);
  if (mo < 12) return rtf.format(-mo, 'month');
  return rtf.format(-Math.floor(mo / 12), 'year');
}

function localeToBcp47(locale: Locale): string {
  switch (locale) {
    case 'fr':
      return 'fr-FR';
    case 'es':
      return 'es-ES';
    default:
      return 'en-US';
  }
}

export function pluralize(
  locale: Locale,
  count: number,
  options: { one: string; other: string }
): string {
  const rules = new Intl.PluralRules(localeToBcp47(locale));
  const cat = rules.select(count);
  return cat === 'one' ? options.one : options.other;
}
