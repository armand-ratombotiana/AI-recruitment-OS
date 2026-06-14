'use client';

export interface Breadcrumb {
  timestamp: number;
  category: string;
  message: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  data?: Record<string, unknown>;
}

export interface UserContext {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
}

export interface ErrorReport {
  id: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  timestamp: number;
  breadcrumbs: Breadcrumb[];
  user: UserContext | null;
  tags: Record<string, string>;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  digest?: string;
}

const MAX_BREADCRUMBS = 50;
const breadcrumbBuffer: Breadcrumb[] = [];
let userContext: UserContext | null = null;

export function addBreadcrumb(
  category: string,
  message: string,
  level: Breadcrumb['level'] = 'info',
  data?: Record<string, unknown>
): void {
  breadcrumbBuffer.push({
    timestamp: Date.now(),
    category,
    message,
    level,
    ...(data ? { data } : {}),
  });
  if (breadcrumbBuffer.length > MAX_BREADCRUMBS) {
    breadcrumbBuffer.shift();
  }
}

export function getBreadcrumbs(): Breadcrumb[] {
  return [...breadcrumbBuffer];
}

export function clearBreadcrumbs(): void {
  breadcrumbBuffer.length = 0;
}

export function setUserContext(ctx: UserContext | null): void {
  userContext = ctx;
}

export function getUserContext(): UserContext | null {
  return userContext;
}

function generateId(): string {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildErrorReport(
  error: Error,
  options: {
    componentStack?: string;
    tags?: Record<string, string>;
    severity?: ErrorReport['severity'];
    digest?: string;
  } = {}
): ErrorReport {
  const { componentStack, tags = {}, severity = 'error', digest } = options;
  return {
    id: generateId(),
    message: error.message,
    stack: error.stack,
    componentStack,
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    timestamp: Date.now(),
    breadcrumbs: getBreadcrumbs(),
    user: userContext,
    tags,
    severity,
    ...(digest ? { digest } : {}),
  };
}

export async function reportError(report: ErrorReport): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(report)], { type: 'application/json' });
      const sent = navigator.sendBeacon('/api/errors', blob);
      if (sent) return;
    }
  } catch {
    //
  }

  try {
    await fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    });
  } catch {
    //
  }
}

export async function reportErrorFromException(
  error: Error,
  options: {
    componentStack?: string;
    tags?: Record<string, string>;
    severity?: ErrorReport['severity'];
    digest?: string;
  } = {}
): Promise<void> {
  const report = buildErrorReport(error, options);
  await reportError(report);
}

export function initSentryIntegration(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    if (event.error) {
      reportErrorFromException(event.error, { severity: 'fatal', tags: { source: 'unhandled' } });
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    reportErrorFromException(error, { severity: 'fatal', tags: { source: 'unhandledrejection' } });
  });
}
