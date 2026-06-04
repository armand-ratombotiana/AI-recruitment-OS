'use client';

import { useEffect, useRef, useState } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useLocaleStore, LOCALE_META, type Locale } from '@/stores/locale-store';
import { useClickOutside } from '@/hooks';
import { cn } from '@/lib/utils';

const LOCALES: Locale[] = ['en', 'fr', 'es'];

export function LanguageToggle({ className }: { className?: string }) {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false));
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const current = LOCALE_META[locale];

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={useLocaleStore.getState().locale}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-9 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
          'dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700'
        )}
      >
        <Globe className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-[11px] font-bold tracking-wider">{current.flag}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Select language"
          className={cn(
            'absolute right-0 mt-2 w-48 origin-top-right rounded-lg border shadow-lg z-50 overflow-hidden animate-fade-in',
            'bg-white border-gray-200',
            'dark:bg-surface-800 dark:border-surface-700'
          )}
        >
          {LOCALES.map((code) => {
            const meta = LOCALE_META[code];
            const selected = code === locale;
            return (
              <li key={code} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    setLocale(code);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-sm transition focus:outline-none focus-visible:bg-blue-50 dark:focus-visible:bg-surface-700',
                    selected
                      ? 'bg-blue-50 text-blue-700 dark:bg-brand-500/10 dark:text-brand-300'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-700'
                  )}
                >
                  <span className="inline-flex h-5 w-7 items-center justify-center rounded text-[10px] font-bold tracking-wider bg-gray-100 text-gray-700 dark:bg-surface-700 dark:text-gray-300">
                    {meta.flag}
                  </span>
                  <span className="flex-1 text-left">{meta.native}</span>
                  {selected && <Check className="h-3.5 w-3.5 text-blue-600 dark:text-brand-400" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
