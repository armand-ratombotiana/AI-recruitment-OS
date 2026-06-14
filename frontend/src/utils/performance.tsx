'use client';

import type React from 'react';
import dynamic from 'next/dynamic';

export function lazyImport(
  factory: () => Promise<{ default: React.ComponentType<any> }>,
  loadingFallback?: React.ReactNode
) {
  return dynamic(factory, {
    loading: () => (loadingFallback ? <>{loadingFallback}</> : <div aria-busy="true" />),
    ssr: false,
  });
}

export function generateSrcSet(
  basePath: string,
  widths: number[] = [320, 640, 768, 1024, 1280, 1536],
  format: 'webp' | 'jpg' | 'png' = 'webp'
): string {
  return widths.map((w) => `${basePath}?w=${w}&fm=${format} ${w}w`).join(', ');
}

export function getOptimizedImageUrl(
  src: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'avif' | 'jpg' | 'png';
  } = {}
): string {
  const { width, height, quality = 80, format = 'webp' } = options;
  const params = new URLSearchParams();
  if (width) params.set('w', String(width));
  if (height) params.set('h', String(height));
  params.set('q', String(quality));
  params.set('fm', format);
  const separator = src.includes('?') ? '&' : '?';
  return `${src}${separator}${params.toString()}`;
}

export function preloadRoute(route: string): void {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector(`link[rel="prefetch"][href="${route}"]`);
  if (existing) return;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = route;
  link.as = 'document';
  document.head.appendChild(link);
}

export function preloadImage(src: string): void {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector(`link[rel="preload"][href="${src}"]`);
  if (existing) return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = src;
  link.as = 'image';
  document.head.appendChild(link);
}

export function preloadModule(src: string): void {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector(`link[rel="modulepreload"][href="${src}"]`);
  if (existing) return;
  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.href = src;
  document.head.appendChild(link);
}

export function prefetchOnIdle(callback: () => void, timeout = 2000): void {
  if (typeof window === 'undefined') return;
  const execute = () => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(callback, { timeout });
    } else {
      setTimeout(callback, timeout);
    }
  };
  if (document.readyState === 'complete') {
    execute();
  } else {
    window.addEventListener('load', () => execute(), { once: true });
  }
}

export function prefetchOnHover(
  elementRef: React.RefObject<HTMLElement>,
  route: string
): () => void {
  if (typeof window === 'undefined') return () => {};
  const el = elementRef.current;
  if (!el) return () => {};
  const handler = () => preloadRoute(route);
  el.addEventListener('mouseenter', handler, { passive: true });
  el.addEventListener('focus', handler, { passive: true });
  return () => {
    el.removeEventListener('mouseenter', handler);
    el.removeEventListener('focus', handler);
  };
}

export function measurePerformance(label: string): () => void {
  if (typeof performance === 'undefined') return () => {};
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    if (typeof console !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.debug(`[perf] ${label}: ${duration.toFixed(2)}ms`);
    }
  };
}

export function reportWebVitals(metric: { id: string; value: number }): void {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV !== 'production') return;
  const body = JSON.stringify({
    name: metric.id,
    value: metric.value,
    timestamp: Date.now(),
  });
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics', body);
  }
}
