'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useLocaleStore, translate } from '@/stores/locale-store';

interface LazyImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  srcSet?: string;
  sizes?: string;
  placeholder?: string;
  className?: string;
  imgClassName?: string;
  loading?: 'lazy' | 'eager';
  threshold?: number;
  rootMargin?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export function LazyImage({
  src,
  alt,
  width,
  height,
  srcSet,
  sizes,
  placeholder,
  className,
  imgClassName,
  loading = 'lazy',
  threshold = 0.1,
  rootMargin = '200px 0px',
  onLoad,
  onError,
}: LazyImageProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setError(true);
    onError?.();
  }, [onError]);

  const aspectRatio = width && height ? `${width} / ${height}` : undefined;

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden bg-gray-100 dark:bg-surface-800', className)}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {placeholder && !loaded && (
        <div
          className={cn(
            'absolute inset-0 bg-cover bg-center transition-opacity duration-500',
            loaded ? 'opacity-0' : 'opacity-100 blur-sm scale-105'
          )}
          style={{ backgroundImage: `url(${placeholder})` }}
          aria-hidden="true"
        />
      )}

      {!placeholder && !loaded && (
        <div
          className="absolute inset-0 animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 dark:from-surface-700 dark:via-surface-800 dark:to-surface-700"
          aria-hidden="true"
        />
      )}

      {inView && !error && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          srcSet={srcSet}
          sizes={sizes}
          width={width}
          height={height}
          loading={loading}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-500',
            loaded ? 'opacity-100' : 'opacity-0',
            imgClassName
          )}
          aria-label={alt}
        />
      )}

      {error && (
        <div
          className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-500"
          role="img"
          aria-label={t('performance.imageLoadFailed', 'Image failed to load')}
        >
          <svg
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

export default LazyImage;
