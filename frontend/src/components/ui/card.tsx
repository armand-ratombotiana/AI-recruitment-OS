import React from 'react';
import { cn } from '@/lib/utils';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padding?: CardPadding;
}

const cardPadding: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export const Card = React.memo(function Card({
  children,
  className,
  interactive = false,
  padding = 'none',
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white shadow-sm',
        'dark:border-surface-700 dark:bg-surface-900 dark:shadow-none',
        interactive &&
          'transition-all hover:shadow-md hover:border-gray-300 cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 focus-within:ring-offset-white dark:hover:border-surface-600 dark:focus-within:ring-brand-400 dark:focus-within:ring-offset-surface-900',
        cardPadding[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

interface CardSectionProps {
  children: React.ReactNode;
  className?: string;
  padding?: CardPadding;
}

export const CardHeader = React.memo(function CardHeader({ children, className, padding = 'lg' }: CardSectionProps) {
  return <div className={cn(cardPadding[padding], 'pb-3', className)}>{children}</div>;
});

export const CardTitle = React.memo(function CardTitle({
  children,
  className,
  as: As = 'h3',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}) {
  return (
    <As className={cn('text-lg font-semibold text-gray-900 dark:text-gray-100', className)}>
      {children}
    </As>
  );
});

export const CardDescription = React.memo(function CardDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn('mt-1 text-sm text-gray-500 dark:text-gray-400', className)}>{children}</p>;
});

export const CardContent = React.memo(function CardContent({ children, className, padding = 'lg' }: CardSectionProps) {
  return <div className={cn(cardPadding[padding], 'pt-0', className)}>{children}</div>;
});

export const CardFooter = React.memo(function CardFooter({
  children,
  className,
  padding = 'lg',
}: CardSectionProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-t border-gray-100 pt-4',
        'dark:border-surface-700',
        cardPadding[padding],
        className
      )}
    >
      {children}
    </div>
  );
});

export const CardAction = React.memo(function CardAction({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1', className)} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
});
