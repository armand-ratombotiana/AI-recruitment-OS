'use client';

import type { Locale } from '@/stores/locale-store';

const LOCALE_BCP47: Record<Locale, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  ar: 'ar-SA',
  he: 'he-IL',
};

export function localeToBCP47(locale: Locale): string {
  return LOCALE_BCP47[locale] || 'en-US';
}

export function formatNumberLocale(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(localeToBCP47(locale), options).format(value);
}

export function formatCurrencyLocale(
  value: number,
  locale: Locale,
  currency: string = 'USD',
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(localeToBCP47(locale), {
    style: 'currency',
    currency,
    ...options,
  }).format(value);
}

export function formatDateLocale(
  date: Date | string | number,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(localeToBCP47(locale), options).format(d);
}

export function formatDateTimeLocale(
  date: Date | string | number,
  locale: Locale
): string {
  return formatDateLocale(date, locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDateLocale(
  date: Date | string | number,
  locale: Locale
): string {
  return formatDateLocale(date, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelativeTimeLocale(
  date: Date | string | number,
  locale: Locale,
  options?: Intl.RelativeTimeFormatOptions
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const diff = d.getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const sign = diff < 0 ? -1 : 1;

  const rtf = new Intl.RelativeTimeFormat(localeToBCP47(locale), {
    numeric: 'auto',
    ...options,
  });

  const seconds = absDiff / 1000;
  const minutes = seconds / 60;
  const hours = minutes / 60;
  const days = hours / 24;
  const months = days / 30;
  const years = days / 365;

  if (seconds < 60) {
    return rtf.format(sign * Math.round(seconds), 'second');
  } else if (minutes < 60) {
    return rtf.format(sign * Math.round(minutes), 'minute');
  } else if (hours < 24) {
    return rtf.format(sign * Math.round(hours), 'hour');
  } else if (days < 30) {
    return rtf.format(sign * Math.round(days), 'day');
  } else if (months < 12) {
    return rtf.format(sign * Math.round(months), 'month');
  } else {
    return rtf.format(sign * Math.round(years), 'year');
  }
}

export function formatPercentLocale(
  value: number,
  locale: Locale,
  decimals: number = 0
): string {
  return new Intl.NumberFormat(localeToBCP47(locale), {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

export function formatCompactNumberLocale(
  value: number,
  locale: Locale
): string {
  return new Intl.NumberFormat(localeToBCP47(locale), {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value);
}

export function getLocaleDateFormat(locale: Locale): string {
  switch (locale) {
    case 'en':
      return 'MM/DD/YYYY';
    case 'fr':
    case 'es':
      return 'DD/MM/YYYY';
    case 'ar':
      return 'DD/MM/YYYY';
    case 'he':
      return 'DD/MM/YYYY';
    default:
      return 'YYYY-MM-DD';
  }
}

export function getLocaleTimeFormat(locale: Locale): string {
  switch (locale) {
    case 'en':
      return 'h:mm A';
    default:
      return 'HH:mm';
  }
}

export function getLocaleFirstDayOfWeek(locale: Locale): number {
  switch (locale) {
    case 'ar':
    case 'he':
      return 6;
    case 'en':
      return 0;
    default:
      return 1;
  }
}

export function getLocaleCurrency(locale: Locale): string {
  switch (locale) {
    case 'en':
      return 'USD';
    case 'fr':
    case 'es':
      return 'EUR';
    case 'ar':
      return 'SAR';
    case 'he':
      return 'ILS';
    default:
      return 'USD';
  }
}
