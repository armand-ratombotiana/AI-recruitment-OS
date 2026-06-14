'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Send, ChevronDown } from 'lucide-react';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { reportErrorFromException, addBreadcrumb, type ErrorReport } from '@/utils/error-reporter';
import { cn } from '@/lib/utils';

interface ErrorBoundaryWrapperProps {
  children: ReactNode;
  fallback?: ReactNode;
  level?: 'page' | 'section' | 'component';
  showHomeButton?: boolean;
  showReportButton?: boolean;
  tags?: Record<string, string>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  className?: string;
}

interface ErrorBoundaryInnerState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  reported: boolean;
  detailsOpen: boolean;
  reporting: boolean;
}

class ErrorBoundaryInner extends Component<
  Omit<ErrorBoundaryWrapperProps, 'className'> & { locale: string },
  ErrorBoundaryInnerState
> {
  constructor(
    props: Omit<ErrorBoundaryWrapperProps, 'className'> & { locale: string }
  ) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: null,
      reported: false,
      detailsOpen: false,
      reporting: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryInnerState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const stack = errorInfo.componentStack ?? null;
    this.setState({ componentStack: stack });

    addBreadcrumb('error-boundary', `Caught: ${error.message}`, 'error', {
      level: this.props.level,
    });

    reportErrorFromException(error, {
      componentStack: stack ?? undefined,
      tags: { ...this.props.tags, level: this.props.level ?? 'section' },
      severity: this.props.level === 'page' ? 'fatal' : 'error',
    }).then(() => {
      this.setState({ reported: true });
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, componentStack: null, reported: false });
  };

  handleReport = async () => {
    if (!this.state.error || this.state.reported) return;
    this.setState({ reporting: true });
    try {
      await reportErrorFromException(this.state.error, {
        componentStack: this.state.componentStack ?? undefined,
        tags: { ...this.props.tags, level: this.props.level ?? 'section' },
      });
      this.setState({ reported: true });
    } finally {
      this.setState({ reporting: false });
    }
  };

  handleHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
  };

  render() {
    const { locale } = this.props;
    const t = (key: string, fallback: string) => translate(locale as any, key, fallback);

    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const isPage = this.props.level === 'page';
      const isComponent = this.props.level === 'component';

      if (isComponent) {
        return (
          <div
            role="alert"
            className={cn(
              'rounded-lg border p-4',
              'border-red-200 bg-red-50/30',
              'dark:border-red-900/50 dark:bg-red-950/20'
            )}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5"
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t('errors.componentFailed', 'This component failed to load')}
                </p>
                <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                  {this.state.error?.message}
                </p>
                <button
                  type="button"
                  onClick={this.handleReset}
                  className={cn(
                    'mt-2 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                    'bg-blue-600 text-white hover:bg-blue-700',
                    'dark:bg-brand-500 dark:hover:bg-brand-400',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
                  )}
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  {t('common.retry', 'Retry')}
                </button>
              </div>
            </div>
          </div>
        );
      }

      if (isPage) {
        return (
          <div
            role="alert"
            className="min-h-[60vh] flex items-center justify-center p-4 sm:p-6"
          >
            <div className="w-full max-w-lg">
              <div
                className={cn(
                  'rounded-2xl border shadow-sm overflow-hidden',
                  'border-red-200 bg-white',
                  'dark:border-red-900/50 dark:bg-surface-900'
                )}
              >
                <div className="p-6 sm:p-8">
                  <div className="flex items-start gap-4">
                    <div
                      className="shrink-0 h-12 w-12 rounded-xl flex items-center justify-center bg-red-100 dark:bg-red-900/30"
                      aria-hidden="true"
                    >
                      <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                        {t('errors.pageTitle', 'Something went wrong')}
                      </h1>
                      <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                        {t(
                          'errors.pageDescription',
                          'An unexpected error occurred. Our team has been notified. You can try again or return to the dashboard.'
                        )}
                      </p>
                      {this.state.reported && (
                        <p className="mt-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                          <Send className="h-3 w-3" aria-hidden="true" />
                          {t('errors.reported', 'Error report sent')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                    {this.props.showHomeButton !== false && (
                      <button
                        type="button"
                        onClick={this.handleHome}
                        className={cn(
                          'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg',
                          'border border-gray-300 bg-white text-sm font-semibold text-gray-700',
                          'hover:bg-gray-50',
                          'dark:border-surface-700 dark:bg-surface-800 dark:text-gray-300 dark:hover:bg-surface-700',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                          'dark:focus-visible:ring-offset-surface-900',
                          'transition-colors'
                        )}
                      >
                        <Home className="h-4 w-4" aria-hidden="true" />
                        {t('errors.goHome', 'Go to dashboard')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={this.handleReset}
                      className={cn(
                        'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg',
                        'bg-red-600 text-white text-sm font-semibold hover:bg-red-700',
                        'dark:bg-red-600 dark:hover:bg-red-500',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
                        'dark:focus-visible:ring-offset-surface-900',
                        'transition-colors'
                      )}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      {t('common.retry', 'Retry')}
                    </button>
                    {this.props.showReportButton !== false && !this.state.reported && (
                      <button
                        type="button"
                        onClick={this.handleReport}
                        disabled={this.state.reporting}
                        className={cn(
                          'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg',
                          'border border-gray-300 bg-white text-sm font-medium text-gray-700',
                          'hover:bg-gray-50 disabled:opacity-50',
                          'dark:border-surface-700 dark:bg-surface-800 dark:text-gray-300 dark:hover:bg-surface-700',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                          'transition-colors'
                        )}
                      >
                        <Send className="h-4 w-4" aria-hidden="true" />
                        {this.state.reporting
                          ? t('errors.reporting', 'Sending…')
                          : t('errors.report', 'Report error')}
                      </button>
                    )}
                  </div>
                </div>

                {this.state.error && (
                  <div
                    className={cn(
                      'border-t',
                      'border-gray-200 bg-gray-50',
                      'dark:border-surface-700 dark:bg-surface-800/50'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => this.setState((s) => ({ detailsOpen: !s.detailsOpen }))}
                      aria-expanded={this.state.detailsOpen}
                      aria-controls="error-boundary-details"
                      className={cn(
                        'w-full flex items-center justify-between gap-2 px-6 sm:px-8 py-3 text-sm font-medium',
                        'text-gray-700 hover:bg-gray-100',
                        'dark:text-gray-300 dark:hover:bg-surface-700',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset',
                        'transition-colors'
                      )}
                    >
                      <span>{t('errors.details', 'Error details')}</span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform duration-200',
                          this.state.detailsOpen ? 'rotate-180' : ''
                        )}
                        aria-hidden="true"
                      />
                    </button>
                    {this.state.detailsOpen && (
                      <div id="error-boundary-details" className="px-6 sm:px-8 pb-4 sm:pb-6">
                        <pre
                          className={cn(
                            'text-xs font-mono rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words',
                            'bg-white border border-gray-200 text-gray-700',
                            'dark:bg-surface-950 dark:border-surface-700 dark:text-gray-300'
                          )}
                        >
                          {this.state.error.message}
                          {this.state.componentStack && (
                            <>
                              {'\n\nComponent stack:\n'}
                              {this.state.componentStack}
                            </>
                          )}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }

      return (
        <div
          role="alert"
          className={cn(
            'rounded-xl border p-5',
            'border-red-200 bg-red-50/30',
            'dark:border-red-900/50 dark:bg-red-950/20'
          )}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('errors.sectionFailed', 'This section failed to load')}
              </p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {this.state.error?.message}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={this.handleReset}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                    'bg-blue-600 text-white hover:bg-blue-700',
                    'dark:bg-brand-500 dark:hover:bg-brand-400',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
                  )}
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  {t('common.retry', 'Retry')}
                </button>
                {this.props.showReportButton !== false && !this.state.reported && (
                  <button
                    type="button"
                    onClick={this.handleReport}
                    disabled={this.state.reporting}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                      'border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50',
                      'dark:border-surface-700 dark:text-gray-300 dark:hover:bg-surface-700',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
                    )}
                  >
                    <Send className="h-3 w-3" aria-hidden="true" />
                    {t('errors.report', 'Report')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundary(props: ErrorBoundaryWrapperProps) {
  const locale = useLocaleStore((s) => s.locale);
  return <ErrorBoundaryInner {...props} locale={locale} />;
}
