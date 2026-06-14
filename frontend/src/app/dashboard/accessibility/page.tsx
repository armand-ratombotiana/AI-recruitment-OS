'use client';

import { useCallback } from 'react';
import {
  Accessibility,
  Type,
  Contrast,
  MonitorOff,
  RotateCcw,
  Eye,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAccessibilityStore,
  FONT_SIZE_CLASSES,
  type FontSize,
} from '@/stores/accessibility-store';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { Switch } from '@/components/ui/switch';

const FONT_SIZES: { value: FontSize; labelKey: string; fallback: string; sample: string }[] = [
  { value: 'sm', labelKey: 'accessibility.fontSizeSmall', fallback: 'Small', sample: 'Aa' },
  { value: 'md', labelKey: 'accessibility.fontSizeMedium', fallback: 'Medium', sample: 'Aa' },
  { value: 'lg', labelKey: 'accessibility.fontSizeLarge', fallback: 'Large', sample: 'Aa' },
  { value: 'xl', labelKey: 'accessibility.fontSizeXLarge', fallback: 'Extra Large', sample: 'Aa' },
];

const FONT_SIZE_PX: Record<FontSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
};

export default function AccessibilityPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback(
    (key: string, fb?: string) => translate(locale, key, fb),
    [locale]
  );

  const fontSize = useAccessibilityStore((s) => s.fontSize);
  const highContrast = useAccessibilityStore((s) => s.highContrast);
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion);
  const setFontSize = useAccessibilityStore((s) => s.setFontSize);
  const setHighContrast = useAccessibilityStore((s) => s.setHighContrast);
  const setReducedMotion = useAccessibilityStore((s) => s.setReducedMotion);

  const systemReducedMotion = useReducedMotion();

  const resetAll = () => {
    setFontSize('md');
    setHighContrast(false);
    setReducedMotion(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-brand-500/20">
            <Accessibility className="h-5 w-5 text-blue-600 dark:text-brand-400" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('accessibility.title', 'Accessibility')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('accessibility.subtitle', 'Customize your experience for comfort and usability.')}
            </p>
          </div>
        </div>
      </div>

      <section
        aria-labelledby="font-size-heading"
        className="rounded-xl border border-gray-200 bg-white p-6 dark:border-surface-700 dark:bg-surface-900"
      >
        <div className="flex items-center gap-2 mb-4">
          <Type className="h-5 w-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
          <h2 id="font-size-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('accessibility.fontSize', 'Font size')}
          </h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t('accessibility.fontSizeDesc', 'Adjust the base font size across the application.')}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="radiogroup" aria-label={t('accessibility.fontSize', 'Font size')}>
          {FONT_SIZES.map((size) => {
            const isActive = fontSize === size.value;
            return (
              <button
                key={size.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setFontSize(size.value)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                  'dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-surface-900',
                  isActive
                    ? 'border-blue-600 bg-blue-50 dark:border-brand-500 dark:bg-brand-500/10'
                    : 'border-gray-200 hover:border-gray-300 dark:border-surface-600 dark:hover:border-surface-500'
                )}
              >
                <span className={cn('font-semibold text-gray-900 dark:text-gray-100', FONT_SIZE_PX[size.value])}>
                  {size.sample}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {t(size.labelKey, size.fallback)}
                </span>
                {isActive && (
                  <Check className="h-4 w-4 text-blue-600 dark:text-brand-400" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
          {t('accessibility.currentFontSize', 'Current size: {size}').replace('{size}', t(`accessibility.fontSize${fontSize === 'sm' ? 'Small' : fontSize === 'md' ? 'Medium' : fontSize === 'lg' ? 'Large' : 'XLarge'}`, fontSize))}
        </p>
      </section>

      <section
        aria-labelledby="contrast-heading"
        className="rounded-xl border border-gray-200 bg-white p-6 dark:border-surface-700 dark:bg-surface-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Contrast className="h-5 w-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            <div>
              <h2 id="contrast-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('accessibility.highContrast', 'High contrast')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('accessibility.highContrastDesc', 'Increase contrast for better readability.')}
              </p>
            </div>
          </div>
          <Switch
            checked={highContrast}
            onChange={setHighContrast}
            label={t('accessibility.highContrast', 'High contrast')}
            id="high-contrast-toggle"
          />
        </div>
      </section>

      <section
        aria-labelledby="motion-heading"
        className="rounded-xl border border-gray-200 bg-white p-6 dark:border-surface-700 dark:bg-surface-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <MonitorOff className="h-5 w-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            <div>
              <h2 id="motion-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('accessibility.reducedMotion', 'Reduced motion')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('accessibility.reducedMotionDesc', 'Minimize animations and transitions.')}
                {systemReducedMotion && !reducedMotion && (
                  <span className="ml-1 text-amber-600 dark:text-amber-400">
                    {t('accessibility.systemReducedMotion', '(Your system prefers reduced motion)')}
                  </span>
                )}
              </p>
            </div>
          </div>
          <Switch
            checked={reducedMotion}
            onChange={setReducedMotion}
            label={t('accessibility.reducedMotion', 'Reduced motion')}
            id="reduced-motion-toggle"
          />
        </div>
      </section>

      <section
        aria-labelledby="reset-heading"
        className="rounded-xl border border-gray-200 bg-white p-6 dark:border-surface-700 dark:bg-surface-900"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            <div>
              <h2 id="reset-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('accessibility.reset', 'Reset to defaults')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('accessibility.resetDesc', 'Restore all accessibility settings to their default values.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700 dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-surface-900"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t('accessibility.reset', 'Reset')}
          </button>
        </div>
      </section>

      <section
        aria-labelledby="info-heading"
        className="rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-brand-500/30 dark:bg-brand-500/10"
      >
        <div className="flex items-center gap-2 mb-2">
          <Eye className="h-5 w-5 text-blue-600 dark:text-brand-400" aria-hidden="true" />
          <h2 id="info-heading" className="text-sm font-semibold text-blue-900 dark:text-brand-200">
            {t('accessibility.wcagTitle', 'WCAG 2.1 AA Compliance')}
          </h2>
        </div>
        <p className="text-sm text-blue-800 dark:text-brand-300">
          {t(
            'accessibility.wcagDesc',
            'This application is designed to meet WCAG 2.1 Level AA standards. We support keyboard navigation, screen readers, and customizable display settings.'
          )}
        </p>
      </section>
    </div>
  );
}
