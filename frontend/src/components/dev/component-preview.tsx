'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sun, Moon, Monitor, Copy, Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeStore, type ThemeMode } from '@/stores/theme-store';
import { useLocaleStore, translate } from '@/stores/locale-store';

interface PropControl {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  label: string;
  defaultValue: string | number | boolean;
  options?: { label: string; value: string }[];
}

interface ComponentPreviewProps {
  componentName: string;
  component: React.ComponentType<any>;
  props: PropControl[];
  className?: string;
}

export function ComponentPreview({
  componentName,
  component: Component,
  props: propControls,
  className,
}: ComponentPreviewProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);

  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  const [propValues, setPropValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    propControls.forEach((p) => {
      initial[p.name] = p.defaultValue;
    });
    return initial;
  });

  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const updateProp = (name: string, value: any) => {
    setPropValues((prev) => ({ ...prev, [name]: value }));
  };

  const resetProps = () => {
    const initial: Record<string, any> = {};
    propControls.forEach((p) => {
      initial[p.name] = p.defaultValue;
    });
    setPropValues(initial);
  };

  const generateCode = () => {
    const propsStr = Object.entries(propValues)
      .map(([key, val]) => {
        if (typeof val === 'string') return `${key}="${val}"`;
        if (typeof val === 'boolean') return val ? key : `${key}={false}`;
        return `${key}={${JSON.stringify(val)}}`;
      })
      .join(' ');
    return `<${componentName}${propsStr ? ' ' + propsStr : ''} />`;
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(generateCode());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const themeOptions: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];

  return (
    <div className={cn('rounded-xl border border-gray-200 dark:border-surface-700 overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-surface-700 dark:bg-surface-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{componentName}</h3>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Theme" className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 dark:border-surface-600 dark:bg-surface-900">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={opt.label}
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded transition',
                    active ? 'bg-blue-600 text-white dark:bg-brand-500' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-surface-700'
                  )}
                >
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={cn('p-8', resolvedTheme === 'dark' ? 'dark bg-surface-900' : 'bg-white')}>
        <div className="flex items-center justify-center min-h-[120px]">
          <Component {...propValues} />
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-surface-700">
        <div className="flex items-center justify-between px-4 py-2">
          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            {showCode ? t('dev.components.hideCode', 'Hide code') : t('dev.components.showCode', 'Show code')}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-surface-700"
              aria-label={t('dev.components.copyCode', 'Copy code')}
            >
              {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              {copied ? t('dev.components.copied', 'Copied') : t('dev.components.copy', 'Copy')}
            </button>
            <button
              type="button"
              onClick={resetProps}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-surface-700"
              aria-label={t('dev.components.resetProps', 'Reset props')}
            >
              <RotateCcw className="h-3 w-3" />
              {t('dev.components.reset', 'Reset')}
            </button>
          </div>
        </div>

        {showCode && (
          <pre className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-800 overflow-x-auto dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200">
            <code>{generateCode()}</code>
          </pre>
        )}

        <div className="border-t border-gray-200 bg-gray-50 px-4 py-4 dark:border-surface-700 dark:bg-surface-800">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('dev.components.props', 'Props')}
          </h4>
          <div className="space-y-3">
            {propControls.map((prop) => (
              <div key={prop.name} className="flex items-center gap-3">
                <label className="w-28 shrink-0 text-xs font-medium text-gray-700 dark:text-gray-300">
                  {prop.label}
                </label>
                {prop.type === 'string' && (
                  <input
                    type="text"
                    value={String(propValues[prop.name] ?? '')}
                    onChange={(e) => updateProp(prop.name, e.target.value)}
                    className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-900 dark:text-gray-100"
                  />
                )}
                {prop.type === 'number' && (
                  <input
                    type="number"
                    value={Number(propValues[prop.name] ?? 0)}
                    onChange={(e) => updateProp(prop.name, Number(e.target.value))}
                    className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-900 dark:text-gray-100"
                  />
                )}
                {prop.type === 'boolean' && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(propValues[prop.name])}
                    onClick={() => updateProp(prop.name, !propValues[prop.name])}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                      propValues[prop.name] ? 'bg-blue-600' : 'bg-gray-300 dark:bg-surface-600'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
                        propValues[prop.name] ? 'translate-x-4' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                )}
                {prop.type === 'select' && prop.options && (
                  <select
                    value={String(propValues[prop.name] ?? '')}
                    onChange={(e) => updateProp(prop.name, e.target.value)}
                    className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-900 dark:text-gray-100"
                  >
                    {prop.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
