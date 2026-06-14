'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  clickable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-6',
  lg: 'p-6 sm:p-8',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { hover = false, clickable = false, padding = 'md', className, children, onClick, ...props },
  ref
) {
  const isInteractive = clickable || !!onClick;

  return (
    <div
      ref={ref}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        isInteractive
          ? (e: React.KeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
              }
            }
          : undefined
      }
      className={cn(
        'rounded-xl border bg-[var(--color-surface-0)] dark:bg-[var(--color-surface-800)]',
        'border-[var(--color-surface-200)] dark:border-[var(--color-surface-700)]',
        'shadow-elevation-1',
        'transition-shadow transition-colors',
        hover && 'hover:shadow-elevation-2 hover:border-[var(--color-surface-300)] dark:hover:border-[var(--color-surface-600)]',
        isInteractive && 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2',
        paddingStyles[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CardHeader({ className, children, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 pb-4 mb-4 border-b border-[var(--color-surface-200)] dark:border-[var(--color-surface-700)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CardBody({ className, children, ...props }: CardBodyProps) {
  return (
    <div className={cn('flex-1', className)} {...props}>
      {children}
    </div>
  );
}

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CardFooter({ className, children, ...props }: CardFooterProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 pt-4 mt-4 border-t border-[var(--color-surface-200)] dark:border-[var(--color-surface-700)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
