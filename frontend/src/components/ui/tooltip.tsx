'use client';

import { useState, useRef, useEffect, useId, cloneElement, isValidElement, ReactElement } from 'react';
import { cn } from '@/lib/utils';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: React.ReactNode;
  children: ReactElement;
  position?: TooltipPosition;
  delay?: number;
  theme?: 'dark' | 'light';
  arrow?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
  theme = 'dark',
  arrow = true,
  disabled = false,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const show = () => {
    if (disabled) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setCoords({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        setVisible(true);
      }
    }, delay);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!isValidElement(children)) {
    return children;
  }

  const childProps = (children.props ?? {}) as Record<string, any>;
  const childRef = (children as any).ref;

  const trigger = cloneElement(children as ReactElement<any>, {
    ref: (node: HTMLElement) => {
      triggerRef.current = node;
      if (typeof childRef === 'function') childRef(node);
      else if (childRef && typeof childRef === 'object') childRef.current = node;
    },
    onMouseEnter: (e: React.MouseEvent) => {
      show();
      childProps.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      childProps.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      show();
      childProps.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hide();
      childProps.onBlur?.(e);
    },
    'aria-describedby': visible ? id : undefined,
  });

  const positions: Record<TooltipPosition, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowPositions: Record<TooltipPosition, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent',
    bottom:
      'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent',
    right:
      'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent',
  };

  const themeClasses = {
    dark: 'bg-gray-900 text-white',
    light: 'bg-white text-gray-900 border border-gray-200',
  };

  const arrowColor =
    theme === 'dark'
      ? 'border-t-gray-900 border-b-gray-900'
      : 'border-t-white border-b-white';

  return (
    <>
      {trigger}
      {visible && coords && (
        <div
          ref={tooltipRef}
          id={id}
          role="tooltip"
          className={cn(
            'fixed z-50 max-w-xs rounded-md px-3 py-1.5 text-xs font-medium shadow-lg',
            'animate-in fade-in zoom-in-95',
            themeClasses[theme],
            positions[position],
            className
          )}
          style={{
            left: `${coords.x}px`,
            top: `${coords.y}px`,
            transform:
              position === 'top' || position === 'bottom'
                ? 'translateX(-50%)'
                : position === 'left'
                  ? 'translateY(-50%)'
                  : 'translateY(-50%)',
          }}
        >
          {content}
          {arrow && (
            <span
              className={cn(
                'absolute h-0 w-0 border-4',
                arrowPositions[position],
                theme === 'dark' ? 'border-t-gray-900' : 'border-t-white'
              )}
              aria-hidden="true"
            />
          )}
        </div>
      )}
    </>
  );
}
