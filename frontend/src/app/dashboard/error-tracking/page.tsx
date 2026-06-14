'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Bug,
  AlertTriangle,
  Send,
  Trash2,
  ChevronDown,
  ChevronRight,
  Clock,
  Globe,
  Monitor,
  Layers,
  RefreshCw,
  Filter,
} from 'lucide-react';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { cn } from '@/lib/utils';
import {
  getBreadcrumbs,
  clearBreadcrumbs,
  type Breadcrumb,
  type ErrorReport,
} from '@/utils/error-reporter';
import { useErrorTracking } from '@/hooks/use-error-tracking';

const RECENT_ERRORS_KEY = 'airos_recent_errors';
const MAX_STORED_ERRORS = 100;

function getStoredErrors(): ErrorReport[] {
  try {
    const raw = localStorage.getItem(RECENT_ERRORS_KEY);
    if (raw) return JSON.parse(raw) as ErrorReport[];
  } catch {
    //
  }
  return [];
}

function storeError(report: ErrorReport): void {
  try {
    const existing = getStoredErrors();
    existing.unshift(report);
    const trimmed = existing.slice(0, MAX_STORED_ERRORS);
    localStorage.setItem(RECENT_ERRORS_KEY, JSON.stringify(trimmed));
  } catch {
    //
  }
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'fatal':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'error':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    case 'warning':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    default:
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  }
}

function breadcrumbLevelColor(level: string): string {
  switch (level) {
    case 'error':
      return 'bg-red-500';
    case 'warning':
      return 'bg-amber-500';
    case 'debug':
      return 'bg-gray-400 dark:bg-gray-500';
    default:
      return 'bg-blue-500';
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function ErrorTrackingPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fallback: string) => translate(locale, key, fallback);
  const { captureMessage, getCollectedBreadcrumbs, clearCollectedBreadcrumbs } =
    useErrorTracking({ enabled: true });

  const [errors, setErrors] = useState<ErrorReport[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [selectedError, setSelectedError] = useState<ErrorReport | null>(null);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'errors' | 'breadcrumbs'>('errors');

  const refresh = useCallback(() => {
    setErrors(getStoredErrors());
    setBreadcrumbs(getBreadcrumbs());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const origReport = window.fetch;
    const patchedFetch = function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === '/api/errors' && init?.method === 'POST') {
        try {
          const body = init.body;
          if (typeof body === 'string') {
            const report = JSON.parse(body) as ErrorReport;
            storeError(report);
            setErrors(getStoredErrors());
          }
        } catch {
          //
        }
      }
      return origReport.call(window, input, init);
    };
    window.fetch = patchedFetch as typeof window.fetch;
    return () => {
      window.fetch = origReport;
    };
  }, []);

  const filteredErrors =
    filterSeverity === 'all'
      ? errors
      : errors.filter((e) => e.severity === filterSeverity);

  const handleClearErrors = () => {
    localStorage.removeItem(RECENT_ERRORS_KEY);
    setErrors([]);
    setSelectedError(null);
  };

  const handleClearBreadcrumbs = () => {
    clearBreadcrumbs();
    clearCollectedBreadcrumbs();
    setBreadcrumbs([]);
  };

  const handleTestError = () => {
    captureMessage('Test error from error tracking dashboard', 'error');
    const testError = new Error('Test error from error tracking dashboard');
    storeError({
      id: `err_${Date.now().toString(36)}_test`,
      message: testError.message,
      stack: testError.stack,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      timestamp: Date.now(),
      breadcrumbs: getBreadcrumbs(),
      user: null,
      tags: { source: 'test', level: 'page' },
      severity: 'error',
    });
    refresh();
  };

  const tabs = [
    { key: 'errors' as const, label: t('errors.recentErrors', 'Recent errors'), count: errors.length },
    {
      key: 'breadcrumbs' as const,
      label: t('errors.breadcrumbs', 'Breadcrumbs'),
      count: breadcrumbs.length,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Bug className="h-6 w-6 text-red-500 dark:text-red-400" aria-hidden="true" />
            {t('errors.trackingTitle', 'Error Tracking')}
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {t(
              'errors.trackingDescription',
              'Monitor and debug errors captured in the application.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestError}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium',
              'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
              'dark:border-surface-700 dark:bg-surface-800 dark:text-gray-300 dark:hover:bg-surface-700',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              'transition-colors'
            )}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {t('errors.testError', 'Test error')}
          </button>
          <button
            type="button"
            onClick={refresh}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium',
              'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
              'dark:border-surface-700 dark:bg-surface-800 dark:text-gray-300 dark:hover:bg-surface-700',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              'transition-colors'
            )}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('common.refresh', 'Refresh')}
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 p-1 rounded-lg bg-gray-100 dark:bg-surface-800">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-surface-700 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded',
                  activeTab === tab.key
                    ? 'bg-blue-100 text-blue-700 dark:bg-brand-500/20 dark:text-brand-300'
                    : 'bg-gray-200 text-gray-600 dark:bg-surface-600 dark:text-gray-400'
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {activeTab === 'errors' && (
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1">
              <Filter className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className={cn(
                  'h-8 px-2 rounded-md text-xs font-medium border',
                  'border-gray-300 bg-white text-gray-700',
                  'dark:border-surface-700 dark:bg-surface-800 dark:text-gray-300',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
                )}
              >
                <option value="all">{t('errors.allSeverities', 'All severities')}</option>
                <option value="fatal">{t('errors.fatal', 'Fatal')}</option>
                <option value="error">{t('errors.error', 'Error')}</option>
                <option value="warning">{t('errors.warning', 'Warning')}</option>
                <option value="info">{t('errors.info', 'Info')}</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleClearErrors}
              disabled={errors.length === 0}
              className={cn(
                'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium',
                'border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40',
                'dark:border-surface-700 dark:text-gray-400 dark:hover:bg-surface-700',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                'transition-colors'
              )}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('errors.clearAll', 'Clear all')}
            </button>
          </div>
        )}

        {activeTab === 'breadcrumbs' && (
          <button
            type="button"
            onClick={handleClearBreadcrumbs}
            disabled={breadcrumbs.length === 0}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium ml-auto',
              'border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40',
              'dark:border-surface-700 dark:text-gray-400 dark:hover:bg-surface-700',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              'transition-colors'
            )}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t('errors.clearBreadcrumbs', 'Clear breadcrumbs')}
          </button>
        )}
      </div>

      {activeTab === 'errors' && (
        <div className="space-y-2">
          {filteredErrors.length === 0 ? (
            <div
              className={cn(
                'rounded-xl border p-8 text-center',
                'border-gray-200 bg-white',
                'dark:border-surface-700 dark:bg-surface-900'
              )}
            >
              <Bug className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('errors.noErrors', 'No errors captured yet')}
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {t(
                  'errors.noErrorsHint',
                  'Errors will appear here when they occur in the application.'
                )}
              </p>
            </div>
          ) : (
            filteredErrors.map((err) => {
              const isExpanded = expandedError === err.id;
              const isSelected = selectedError?.id === err.id;
              return (
                <div
                  key={err.id}
                  className={cn(
                    'rounded-xl border overflow-hidden transition-colors',
                    isSelected
                      ? 'border-blue-300 ring-1 ring-blue-200 dark:border-brand-500/50 dark:ring-brand-500/20'
                      : 'border-gray-200 dark:border-surface-700',
                    'bg-white dark:bg-surface-900'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedError(isExpanded ? null : err.id);
                      setSelectedError(err);
                    }}
                    className={cn(
                      'w-full flex items-start gap-3 p-4 text-left',
                      'hover:bg-gray-50 dark:hover:bg-surface-800/50',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset',
                      'transition-colors'
                    )}
                  >
                    {isExpanded ? (
                      <ChevronDown
                        className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500 mt-1"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500 mt-1"
                        aria-hidden="true"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                            severityColor(err.severity)
                          )}
                        >
                          {err.severity}
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {err.message}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {timeAgo(err.timestamp)}
                        </span>
                        {err.tags.source && (
                          <span className="flex items-center gap-1">
                            <Layers className="h-3 w-3" aria-hidden="true" />
                            {err.tags.source}
                          </span>
                        )}
                        {err.breadcrumbs.length > 0 && (
                          <span>
                            {err.breadcrumbs.length}{' '}
                            {t('errors.breadcrumbs', 'breadcrumbs')}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div
                      className={cn(
                        'border-t px-4 py-4 space-y-4',
                        'border-gray-200 bg-gray-50/50',
                        'dark:border-surface-700 dark:bg-surface-800/30'
                      )}
                    >
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                          {t('errors.stackTrace', 'Stack trace')}
                        </p>
                        <pre
                          className={cn(
                            'text-xs font-mono rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words',
                            'bg-white border border-gray-200 text-gray-700',
                            'dark:bg-surface-950 dark:border-surface-700 dark:text-gray-300'
                          )}
                        >
                          {err.stack ?? err.message}
                        </pre>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                            <Globe className="h-3 w-3" aria-hidden="true" />
                            {t('errors.url', 'URL')}
                          </p>
                          <p className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
                            {err.url || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                            <Monitor className="h-3 w-3" aria-hidden="true" />
                            {t('errors.userAgent', 'User agent')}
                          </p>
                          <p className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
                            {err.userAgent || 'N/A'}
                          </p>
                        </div>
                      </div>

                      {Object.keys(err.tags).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                            {t('errors.tags', 'Tags')}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(err.tags).map(([k, v]) => (
                              <span
                                key={k}
                                className={cn(
                                  'text-[10px] font-mono px-1.5 py-0.5 rounded',
                                  'bg-gray-100 text-gray-700',
                                  'dark:bg-surface-700 dark:text-gray-300'
                                )}
                              >
                                {k}={v}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {err.breadcrumbs.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                            {t('errors.breadcrumbsLeading', 'Breadcrumbs leading to error')}
                          </p>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {err.breadcrumbs.map((bc, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-2 text-xs"
                              >
                                <span
                                  className={cn(
                                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                                    breadcrumbLevelColor(bc.level)
                                  )}
                                  aria-hidden="true"
                                />
                                <span className="text-gray-500 dark:text-gray-400 font-mono shrink-0">
                                  {formatTime(bc.timestamp)}
                                </span>
                                <span className="text-gray-400 dark:text-gray-500 shrink-0">
                                  [{bc.category}]
                                </span>
                                <span className="text-gray-700 dark:text-gray-300 truncate">
                                  {bc.message}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'breadcrumbs' && (
        <div
          className={cn(
            'rounded-xl border overflow-hidden',
            'border-gray-200 bg-white',
            'dark:border-surface-700 dark:bg-surface-900'
          )}
        >
          {breadcrumbs.length === 0 ? (
            <div className="p-8 text-center">
              <Layers className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('errors.noBreadcrumbs', 'No breadcrumbs recorded yet')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-surface-700">
              {breadcrumbs
                .slice()
                .reverse()
                .map((bc, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-surface-800/50 transition-colors"
                  >
                    <span
                      className={cn(
                        'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                        breadcrumbLevelColor(bc.level)
                      )}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500">
                          {bc.category}
                        </span>
                        <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">
                          {formatTime(bc.timestamp)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300 truncate">
                        {bc.message}
                      </p>
                      {bc.data && Object.keys(bc.data).length > 0 && (
                        <pre className="mt-1 text-[10px] font-mono text-gray-500 dark:text-gray-400 truncate">
                          {JSON.stringify(bc.data)}
                        </pre>
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0',
                        bc.level === 'error'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : bc.level === 'warning'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-surface-700 dark:text-gray-400'
                      )}
                    >
                      {bc.level}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
