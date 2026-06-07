'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TagChipSize = 'sm' | 'md' | 'lg';

export interface TagChipProps {
  id?: string;
  name: string;
  color?: string;
  size?: TagChipSize;
  removable?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
  title?: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6) return null;
  const num = parseInt(h, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

function isLightColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  // standard relative luminance
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return lum > 0.6;
}

const sizeClasses: Record<TagChipSize, string> = {
  sm: 'px-2 py-0.5 text-[10px] gap-1',
  md: 'px-2.5 py-0.5 text-xs gap-1.5',
  lg: 'px-3 py-1 text-sm gap-1.5',
};

export function TagChip({
  id,
  name,
  color,
  size = 'md',
  removable = false,
  onRemove,
  onClick,
  className,
  ariaLabel,
  title,
}: TagChipProps) {
  const hasColor = typeof color === 'string' && color.length > 0;
  const light = hasColor ? isLightColor(color as string) : true;

  const style: React.CSSProperties = hasColor
    ? {
        backgroundColor: `${color}26`,
        color: color as string,
        borderColor: `${color}66`,
      }
    : {};

  const dotStyle: React.CSSProperties = hasColor
    ? { backgroundColor: color as string }
    : {};

  const interactive = typeof onClick === 'function';

  const baseClasses = cn(
    'inline-flex items-center rounded-full font-medium border whitespace-nowrap max-w-full',
    sizeClasses[size],
    hasColor
      ? ''
      : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-brand-500/20 dark:text-brand-300 dark:border-brand-500/30',
    interactive &&
      'cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:opacity-90',
    className
  );

  const content = (
    <>
      {hasColor && (
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={dotStyle}
          aria-hidden="true"
        />
      )}
      <span className={cn('truncate', size === 'sm' ? 'font-medium' : 'font-medium')}>
        {name}
      </span>
      {removable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className={cn(
            'inline-flex items-center justify-center rounded-full p-0.5 -mr-1 -ml-0.5',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            light ? 'hover:bg-black/10' : 'hover:bg-white/20'
          )}
          aria-label={ariaLabel || `Remove ${name}`}
          title={`Remove ${name}`}
        >
          <X className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} aria-hidden="true" />
        </button>
      )}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-tag-id={id}
        title={title}
        className={baseClasses}
        style={style}
        aria-label={ariaLabel || `Filter by ${name}`}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      data-tag-id={id}
      title={title}
      className={baseClasses}
      style={style}
      aria-label={ariaLabel || name}
    >
      {content}
    </span>
  );
}

export default TagChip;
