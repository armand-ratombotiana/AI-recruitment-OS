'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Wrench,
  Blocks,
  Globe,
  Gauge,
  Bug,
  ArrowRight,
  Cpu,
  MemoryStick,
  Clock,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { useThemeStore } from '@/stores/theme-store';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LanguageToggle } from '@/components/ui/language-toggle';

interface PerfMetrics {
  fps: number;
  memory: number;
  domNodes: number;
  loadTime: number;
}

const TOOLS = [
  {
    href: '/dev/components',
    icon: Blocks,
    titleKey: 'dev.tools.components',
    titleFallback: 'Component Playground',
    descKey: 'dev.tools.componentsDesc',
    descFallback: 'Browse, preview, and test UI components with live props.',
    color: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
  },
  {
    href: '/dev/api',
    icon: Globe,
    titleKey: 'dev.tools.api',
    titleFallback: 'API Explorer',
    descKey: 'dev.tools.apiDesc',
    descFallback: 'Test endpoints, build requests, and inspect responses.',
    color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  },
];

export default function DevToolsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const initTheme = useThemeStore((s) => s._init);

  const [metrics, setMetrics] = useState<PerfMetrics>({
    fps: 0,
    memory: 0,
    domNodes: 0,
    loadTime: 0,
  });
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let rafId: number;

    const measureFps = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (now - lastTime));
        const mem = (performance as any).memory
          ? Math.round((performance as any).memory.usedJSHeapSize / 1048576)
          : 0;
        const nodes = document.querySelectorAll('*').length;
        setMetrics({ fps, memory: mem, domNodes: nodes, loadTime: Math.round(performance.timing?.loadEventEnd || 0) });
        frameCount = 0;
        lastTime = now;
      }
      rafId = requestAnimationFrame(measureFps);
    };
    rafId = requestAnimationFrame(measureFps);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const handler = (e: ErrorEvent) => {
      setErrors((prev) => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${e.message}`]);
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  const triggerError = () => {
    try {
      throw new Error('Test error from Dev Tools');
    } catch (e: any) {
      setErrors((prev) => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${e.message}`]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-950">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-surface-700 dark:bg-surface-900/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 dark:bg-brand-500">
              <Wrench className="h-4.5 w-4.5 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {t('dev.title', 'Developer Tools')}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('dev.subtitle', 'Component playground, API explorer & diagnostics')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageToggle />
            <Link
              href="/dashboard"
              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-surface-600 dark:text-gray-300 dark:hover:bg-surface-800"
            >
              {t('dev.backToApp', 'Back to app')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section aria-labelledby="perf-heading" className="mb-8">
          <h2 id="perf-heading" className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Gauge className="h-4 w-4" aria-hidden="true" />
            {t('dev.performance.title', 'Performance Monitor')}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Activity className="h-3.5 w-3.5" />
                {t('dev.performance.fps', 'FPS')}
              </div>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{metrics.fps}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <MemoryStick className="h-3.5 w-3.5" />
                {t('dev.performance.memory', 'Memory (MB)')}
              </div>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{metrics.memory || '—'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Cpu className="h-3.5 w-3.5" />
                {t('dev.performance.domNodes', 'DOM Nodes')}
              </div>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{metrics.domNodes}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Clock className="h-3.5 w-3.5" />
                {t('dev.performance.loadTime', 'Load (ms)')}
              </div>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{metrics.loadTime || '—'}</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="tools-heading" className="mb-8">
          <h2 id="tools-heading" className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('dev.tools.title', 'Tools')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="group rounded-xl border border-gray-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-md dark:border-surface-700 dark:bg-surface-900 dark:hover:border-brand-500/40"
                >
                  <div className="flex items-start justify-between">
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', tool.color)}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400 transition group-hover:translate-x-1 group-hover:text-blue-600 dark:group-hover:text-brand-400" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                    {t(tool.titleKey, tool.titleFallback)}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {t(tool.descKey, tool.descFallback)}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="errors-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="errors-heading" className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <Bug className="h-4 w-4" aria-hidden="true" />
              {t('dev.errors.title', 'Error Boundary Tester')}
            </h2>
            <button
              type="button"
              onClick={triggerError}
              className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            >
              {t('dev.errors.trigger', 'Trigger test error')}
            </button>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900">
            {errors.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-gray-400 dark:text-gray-500">
                {t('dev.errors.empty', 'No errors captured. Trigger one to test.')}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-surface-700 max-h-64 overflow-y-auto">
                {errors.map((err, i) => (
                  <li key={i} className="px-4 py-2 text-xs font-mono text-red-600 dark:text-red-400">
                    {err}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
