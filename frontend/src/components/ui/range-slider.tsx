'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface RangeSliderProps {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  label?: string;
  showValue?: boolean;
  formatValue?: (v: number) => string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function RangeSlider({
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  label,
  showValue = true,
  formatValue = (v) => String(v),
  disabled = false,
  className,
  ariaLabel,
}: RangeSliderProps) {
  const id = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const ratio = rect.width === 0 ? 0 : x / rect.width;
      const raw = min + ratio * (max - min);
      const stepped = Math.round(raw / step) * step;
      const next = Math.max(min, Math.min(max, stepped));
      if (next !== value) onChange(next);
    },
    [min, max, step, value, onChange]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => setFromClientX(e.clientX);
    const onUp = () => setDragging(false);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [dragging, setFromClientX]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next = value;
    const big = Math.max(step, (max - min) / 10);
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = Math.min(max, value + step);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = Math.max(min, value - step);
        break;
      case 'PageUp':
        next = Math.min(max, value + big);
        break;
      case 'PageDown':
        next = Math.max(min, value - big);
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    if (next !== value) onChange(next);
  };

  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <label htmlFor={id} className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {label}
            </label>
          )}
          {showValue && (
            <span className="text-xs font-mono font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
              {formatValue(value)}
            </span>
          )}
        </div>
      )}
      <div
        ref={trackRef}
        role="slider"
        id={id}
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel || label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          if (disabled) return;
          setDragging(true);
          setFromClientX(e.clientX);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        className={cn(
          'relative h-6 flex items-center cursor-pointer select-none touch-none focus:outline-none',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-gray-200 dark:bg-surface-700" aria-hidden="true" />
        <div
          className="absolute h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 dark:from-brand-400 dark:to-accent-400"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
        <div
          className={cn(
            'absolute h-4 w-4 rounded-full bg-white dark:bg-surface-900 border-2 border-blue-500 dark:border-brand-400 shadow-md',
            'transition-transform',
            dragging ? 'scale-125' : 'group-hover:scale-110'
          )}
          style={{ left: `calc(${pct}% - 8px)` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
