'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { ErrorState } from './error-state';
import { reportErrorFromException, addBreadcrumb } from '@/utils/error-reporter';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  showHomeButton?: boolean;
  level?: 'page' | 'section' | 'component';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    addBreadcrumb('error-boundary', `Caught: ${error.message}`, 'error', {
      level: this.props.level ?? 'section',
    });
    reportErrorFromException(error, {
      componentStack: errorInfo.componentStack ?? undefined,
      tags: { level: this.props.level ?? 'section', source: 'error-boundary' },
      severity: this.props.level === 'page' ? 'fatal' : 'error',
    });
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { level = 'section' } = this.props;
      const isPage = level === 'page';

      if (isPage) {
        return (
          <div
            role="alert"
            className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center"
          >
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-10 w-10" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
            <p className="mt-2 max-w-md text-sm text-gray-600">
              An unexpected error occurred. Our team has been notified. You can try refreshing
              the page or returning to the dashboard.
            </p>
            {this.state.error && (
              <pre className="mt-4 max-w-2xl overflow-x-auto rounded-md bg-gray-50 border border-gray-200 px-4 py-3 text-left text-xs text-gray-700">
                {this.state.error.message}
              </pre>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
              {this.props.showHomeButton !== false && (
                <button
                  type="button"
                  onClick={this.handleHome}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <Home className="h-4 w-4" aria-hidden="true" />
                  Go to dashboard
                </button>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="rounded-lg border border-red-200 bg-red-50/30 p-4">
          <ErrorState
            title="This section failed to load"
            description="Please try again or refresh the page."
            error={this.state.error}
            onRetry={this.handleReset}
            retryLabel="Retry"
          />
        </div>
      );
    }

    return this.props.children;
  }
}
