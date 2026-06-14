'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Eye,
  ShieldCheck,
  Palette,
  Type,
  ToggleLeft,
  CheckSquare,
  MessageSquare,
  LayoutGrid,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { ComponentPreview } from '@/components/dev/component-preview';

interface ComponentEntry {
  name: string;
  category: string;
  description: string;
  props: {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'select';
    label: string;
    defaultValue: string | number | boolean;
    options?: { label: string; value: string }[];
  }[];
  a11y: {
    hasAriaLabels: boolean;
    keyboardNav: boolean;
    screenReader: boolean;
    focusManagement: boolean;
  };
}

const SAMPLE_COMPONENTS: ComponentEntry[] = [
  {
    name: 'Badge',
    category: 'Data Display',
    description: 'Status indicator with variants',
    props: [
      { name: 'label', type: 'string', label: 'Label', defaultValue: 'Active' },
      {
        name: 'variant',
        type: 'select',
        label: 'Variant',
        defaultValue: 'success',
        options: [
          { label: 'Success', value: 'success' },
          { label: 'Warning', value: 'warning' },
          { label: 'Error', value: 'error' },
          { label: 'Info', value: 'info' },
        ],
      },
    ],
    a11y: { hasAriaLabels: true, keyboardNav: false, screenReader: true, focusManagement: false },
  },
  {
    name: 'Button',
    category: 'Actions',
    description: 'Primary action trigger',
    props: [
      { name: 'children', type: 'string', label: 'Text', defaultValue: 'Click me' },
      {
        name: 'variant',
        type: 'select',
        label: 'Variant',
        defaultValue: 'primary',
        options: [
          { label: 'Primary', value: 'primary' },
          { label: 'Secondary', value: 'secondary' },
          { label: 'Ghost', value: 'ghost' },
        ],
      },
      { name: 'disabled', type: 'boolean', label: 'Disabled', defaultValue: false },
      { name: 'size', type: 'select', label: 'Size', defaultValue: 'md', options: [
        { label: 'Small', value: 'sm' },
        { label: 'Medium', value: 'md' },
        { label: 'Large', value: 'lg' },
      ]},
    ],
    a11y: { hasAriaLabels: true, keyboardNav: true, screenReader: true, focusManagement: true },
  },
  {
    name: 'Switch',
    category: 'Inputs',
    description: 'Toggle switch control',
    props: [
      { name: 'label', type: 'string', label: 'Label', defaultValue: 'Enable notifications' },
      { name: 'checked', type: 'boolean', label: 'Checked', defaultValue: false },
      { name: 'disabled', type: 'boolean', label: 'Disabled', defaultValue: false },
    ],
    a11y: { hasAriaLabels: true, keyboardNav: true, screenReader: true, focusManagement: true },
  },
  {
    name: 'Card',
    category: 'Layout',
    description: 'Content container with shadow',
    props: [
      { name: 'title', type: 'string', label: 'Title', defaultValue: 'Card Title' },
      { name: 'description', type: 'string', label: 'Description', defaultValue: 'Card description text goes here.' },
      { name: 'padding', type: 'number', label: 'Padding', defaultValue: 16 },
    ],
    a11y: { hasAriaLabels: true, keyboardNav: false, screenReader: true, focusManagement: false },
  },
  {
    name: 'Avatar',
    category: 'Data Display',
    description: 'User avatar with fallback',
    props: [
      { name: 'name', type: 'string', label: 'Name', defaultValue: 'Jane Smith' },
      { name: 'size', type: 'select', label: 'Size', defaultValue: 'md', options: [
        { label: 'Small', value: 'sm' },
        { label: 'Medium', value: 'md' },
        { label: 'Large', value: 'lg' },
      ]},
    ],
    a11y: { hasAriaLabels: true, keyboardNav: false, screenReader: true, focusManagement: false },
  },
  {
    name: 'Modal',
    category: 'Overlays',
    description: 'Dialog overlay with focus trap',
    props: [
      { name: 'title', type: 'string', label: 'Title', defaultValue: 'Confirm action' },
      { name: 'open', type: 'boolean', label: 'Open', defaultValue: true },
      { name: 'closable', type: 'boolean', label: 'Closable', defaultValue: true },
    ],
    a11y: { hasAriaLabels: true, keyboardNav: true, screenReader: true, focusManagement: true },
  },
  {
    name: 'Tooltip',
    category: 'Overlays',
    description: 'Contextual hover tooltip',
    props: [
      { name: 'content', type: 'string', label: 'Content', defaultValue: 'Helpful information' },
      { name: 'position', type: 'select', label: 'Position', defaultValue: 'top', options: [
        { label: 'Top', value: 'top' },
        { label: 'Bottom', value: 'bottom' },
        { label: 'Left', value: 'left' },
        { label: 'Right', value: 'right' },
      ]},
    ],
    a11y: { hasAriaLabels: true, keyboardNav: false, screenReader: true, focusManagement: false },
  },
  {
    name: 'Search',
    category: 'Inputs',
    description: 'Search input with debounce',
    props: [
      { name: 'placeholder', type: 'string', label: 'Placeholder', defaultValue: 'Search...' },
      { name: 'debounce', type: 'number', label: 'Debounce (ms)', defaultValue: 300 },
    ],
    a11y: { hasAriaLabels: true, keyboardNav: true, screenReader: true, focusManagement: true },
  },
];

const CATEGORY_ICONS: Record<string, typeof LayoutGrid> = {
  Actions: ToggleLeft,
  Inputs: Type,
  'Data Display': CheckSquare,
  Layout: LayoutGrid,
  Overlays: MessageSquare,
};

function PreviewComponent({ name, propValues }: { name: string; propValues: Record<string, any> }) {
  const base = 'rounded-lg border border-gray-200 dark:border-surface-700 px-4 py-3 text-sm';
  switch (name) {
    case 'Badge': {
      const colors: Record<string, string> = {
        success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      };
      return (
        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', colors[propValues.variant] || colors.info)}>
          {propValues.label}
        </span>
      );
    }
    case 'Button': {
      const variants: Record<string, string> = {
        primary: 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-brand-500',
        secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-surface-700 dark:text-gray-200',
        ghost: 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-surface-700',
      };
      const sizes: Record<string, string> = { sm: 'px-2 py-1 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };
      return (
        <button
          type="button"
          disabled={propValues.disabled}
          className={cn('rounded-lg font-medium transition disabled:opacity-50', variants[propValues.variant] || variants.primary, sizes[propValues.size] || sizes.md)}
        >
          {propValues.children}
        </button>
      );
    }
    case 'Switch':
      return (
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={propValues.checked}
            aria-label={propValues.label}
            disabled={propValues.disabled}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-50',
              propValues.checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-surface-600'
            )}
          >
            <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition', propValues.checked ? 'translate-x-4' : 'translate-x-0.5')} />
          </button>
          <span className="text-sm text-gray-700 dark:text-gray-300">{propValues.label}</span>
        </div>
      );
    case 'Card':
      return (
        <div className={cn(base, 'max-w-xs shadow-sm')} style={{ padding: propValues.padding }}>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{propValues.title}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{propValues.description}</p>
        </div>
      );
    case 'Avatar': {
      const initials = (propValues.name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
      const sizes: Record<string, string> = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' };
      return (
        <div className={cn('flex items-center justify-center rounded-full bg-blue-600 font-medium text-white', sizes[propValues.size] || sizes.md)} aria-label={propValues.name}>
          {initials}
        </div>
      );
    }
    case 'Modal':
      return propValues.open ? (
        <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-surface-700 dark:bg-surface-800">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{propValues.title}</h3>
            {propValues.closable && <button type="button" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">&times;</button>}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Modal content preview</p>
        </div>
      ) : (
        <span className="text-xs text-gray-400">Modal closed</span>
      );
    case 'Tooltip':
      return (
        <div className="relative inline-block">
          <div className="rounded-md bg-gray-800 px-2 py-1 text-xs text-white dark:bg-gray-200 dark:text-gray-900">
            {propValues.content}
          </div>
        </div>
      );
    case 'Search':
      return (
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={propValues.placeholder}
            className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
            aria-label={propValues.placeholder}
          />
        </div>
      );
    default:
      return <div className={base}>{name} preview</div>;
  }
}

export default function DevComponentsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);

  const [search, setSearch] = useState('');
  const [selectedComponent, setSelectedComponent] = useState<ComponentEntry | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const categories = Array.from(new Set(SAMPLE_COMPONENTS.map((c) => c.category)));

  const filtered = SAMPLE_COMPONENTS.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || c.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const a11yScore = (comp: ComponentEntry) => {
    const checks = [comp.a11y.hasAriaLabels, comp.a11y.keyboardNav, comp.a11y.screenReader, comp.a11y.focusManagement];
    return checks.filter(Boolean).length;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-950">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-surface-700 dark:bg-surface-900/80">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/dev"
            className="inline-flex items-center gap-1 rounded-md text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label={t('dev.back', 'Back to dev tools')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {t('dev.components.title', 'Component Library')}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('dev.components.subtitle', 'Browse, preview, and audit UI components')}
            </p>
          </div>
          <div className="relative hidden sm:block">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('dev.components.search', 'Search components...')}
              className="w-64 rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
              aria-label={t('dev.components.search', 'Search components')}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition',
              !categoryFilter
                ? 'bg-blue-600 text-white dark:bg-brand-500'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-surface-800 dark:text-gray-400 dark:hover:bg-surface-700'
            )}
          >
            {t('dev.components.all', 'All')} ({SAMPLE_COMPONENTS.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                categoryFilter === cat
                  ? 'bg-blue-600 text-white dark:bg-brand-500'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-surface-800 dark:text-gray-400 dark:hover:bg-surface-700'
              )}
            >
              {cat} ({SAMPLE_COMPONENTS.filter((c) => c.category === cat).length})
            </button>
          ))}
        </div>

        {selectedComponent ? (
          <div className="space-y-6">
            <button
              type="button"
              onClick={() => setSelectedComponent(null)}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-brand-400"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t('dev.components.backToList', 'Back to list')}
            </button>

            <div className="grid gap-6 lg:grid-cols-2">
              <ComponentPreview
                componentName={selectedComponent.name}
                component={(props: Record<string, any>) => <PreviewComponent name={selectedComponent.name} propValues={props} />}
                props={selectedComponent.props}
              />

              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-surface-700 dark:bg-surface-900">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    {t('dev.components.stateInspector', 'State Inspector')}
                  </h3>
                  <dl className="mt-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <dt className="text-gray-500 dark:text-gray-400">{t('dev.components.category', 'Category')}</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedComponent.category}</dd>
                    </div>
                    <div className="flex justify-between text-xs">
                      <dt className="text-gray-500 dark:text-gray-400">{t('dev.components.propCount', 'Props')}</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedComponent.props.length}</dd>
                    </div>
                    <div className="flex justify-between text-xs">
                      <dt className="text-gray-500 dark:text-gray-400">{t('dev.components.description', 'Description')}</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedComponent.description}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-surface-700 dark:bg-surface-900">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    {t('dev.components.a11yAudit', 'Accessibility Audit')}
                  </h3>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 rounded-full bg-gray-200 dark:bg-surface-700 h-2">
                      <div
                        className={cn(
                          'h-2 rounded-full transition-all',
                          a11yScore(selectedComponent) === 4
                            ? 'bg-green-500'
                            : a11yScore(selectedComponent) >= 2
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                        )}
                        style={{ width: `${(a11yScore(selectedComponent) / 4) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {a11yScore(selectedComponent)}/4
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {[
                      { key: 'hasAriaLabels', label: 'ARIA labels', icon: MessageSquare },
                      { key: 'keyboardNav', label: 'Keyboard navigation', icon: ToggleLeft },
                      { key: 'screenReader', label: 'Screen reader support', icon: Eye },
                      { key: 'focusManagement', label: 'Focus management', icon: AlertCircle },
                    ].map((check) => {
                      const Icon = check.icon;
                      const passed = selectedComponent.a11y[check.key as keyof typeof selectedComponent.a11y];
                      return (
                        <li key={check.key} className="flex items-center gap-2 text-xs">
                          {passed ? (
                            <CheckSquare className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                          )}
                          <span className={passed ? 'text-gray-700 dark:text-gray-300' : 'text-red-600 dark:text-red-400'}>
                            {check.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-surface-700 dark:bg-surface-900">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    <Palette className="h-4 w-4" aria-hidden="true" />
                    {t('dev.components.themePreview', 'Theme Preview')}
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-[10px] font-semibold uppercase text-gray-400">Light</p>
                      <div className="mt-2 flex gap-1">
                        <span className="h-4 w-4 rounded bg-blue-600" />
                        <span className="h-4 w-4 rounded bg-gray-900" />
                        <span className="h-4 w-4 rounded bg-gray-100 border border-gray-200" />
                      </div>
                    </div>
                    <div className="rounded-lg border border-surface-700 bg-surface-900 p-3">
                      <p className="text-[10px] font-semibold uppercase text-gray-500">Dark</p>
                      <div className="mt-2 flex gap-1">
                        <span className="h-4 w-4 rounded bg-brand-500" />
                        <span className="h-4 w-4 rounded bg-gray-100" />
                        <span className="h-4 w-4 rounded bg-surface-800" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((comp) => {
              const Icon = CATEGORY_ICONS[comp.category] || LayoutGrid;
              return (
                <button
                  key={comp.name}
                  type="button"
                  onClick={() => setSelectedComponent(comp)}
                  className="group rounded-xl border border-gray-200 bg-white p-5 text-left transition hover:border-blue-300 hover:shadow-md dark:border-surface-700 dark:bg-surface-900 dark:hover:border-brand-500/40"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-surface-800">
                      <Icon className="h-4 w-4 text-gray-600 dark:text-gray-400" aria-hidden="true" />
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            i < a11yScore(comp) ? 'bg-green-500' : 'bg-gray-200 dark:bg-surface-700'
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{comp.name}</h3>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{comp.description}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-surface-800 dark:text-gray-400">
                      {comp.category}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {comp.props.length} {t('dev.components.props', 'props')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
