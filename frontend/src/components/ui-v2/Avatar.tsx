'use client';

import { forwardRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  fallback?: React.ReactNode;
}

const sizeStyles: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

const statusSizeStyles: Record<AvatarSize, string> = {
  xs: 'h-1.5 w-1.5 border',
  sm: 'h-2 w-2 border',
  md: 'h-2.5 w-2.5 border-2',
  lg: 'h-3 w-3 border-2',
  xl: 'h-4 w-4 border-2',
};

const statusColorStyles: Record<AvatarStatus, string> = {
  online: 'bg-[var(--color-success-500)]',
  offline: 'bg-[var(--color-surface-400)]',
  busy: 'bg-[var(--color-danger-500)]',
  away: 'bg-[var(--color-warning-500)]',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(function Avatar(
  { src, alt, name, size = 'md', status, fallback, className, ...props },
  ref
) {
  const [imgError, setImgError] = useState(false);
  const showImage = src && !imgError;
  const initials = name ? getInitials(name) : '';
  const bgColor = name ? hashColor(name) : undefined;

  return (
    <div
      ref={ref}
      className={cn('relative inline-flex shrink-0', className)}
      {...props}
    >
      <div
        className={cn(
          'inline-flex items-center justify-center rounded-full overflow-hidden',
          'bg-[var(--color-surface-200)] dark:bg-[var(--color-surface-700)]',
          'text-[var(--color-ink-secondary)] dark:text-[var(--color-surface-300)]',
          'font-semibold select-none',
          sizeStyles[size]
        )}
        role="img"
        aria-label={alt ?? name ?? 'Avatar'}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt ?? name ?? 'Avatar'}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : fallback ? (
          fallback
        ) : initials ? (
          <span
            className="flex items-center justify-center h-full w-full rounded-full text-white"
            style={{ backgroundColor: bgColor }}
            aria-hidden="true"
          >
            {initials}
          </span>
        ) : (
          <svg
            className="h-3/5 w-3/5 text-[var(--color-ink-disabled)]"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-3.315 0-10 1.66-10 5v2h20v-2c0-3.34-6.685-5-10-5z" />
          </svg>
        )}
      </div>
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-white dark:border-[var(--color-surface-800)]',
            statusSizeStyles[size],
            statusColorStyles[status]
          )}
          aria-label={`Status: ${status}`}
        />
      )}
    </div>
  );
});
