import { cn } from '@/lib/utils';

type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'pink'
  | 'indigo'
  | 'teal'
  | 'orange'
  | 'outline';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  className,
  ...props
}: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    default: 'bg-gray-100 text-gray-800 dark:bg-surface-800 dark:text-gray-200',
    success: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-400',
    danger: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400',
    info: 'bg-blue-100 text-blue-800 dark:bg-brand-500/20 dark:text-brand-300',
    purple: 'bg-purple-100 text-purple-800 dark:bg-accent-500/20 dark:text-accent-300',
    pink: 'bg-pink-100 text-pink-800 dark:bg-pink-500/20 dark:text-pink-300',
    indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300',
    teal: 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300',
    orange: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300',
    outline: 'border border-gray-300 text-gray-700 bg-transparent dark:border-surface-600 dark:text-gray-300',
  };
  const dotColors: Record<BadgeVariant, string> = {
    default: 'bg-gray-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    danger: 'bg-red-500',
    info: 'bg-blue-500',
    purple: 'bg-purple-500',
    pink: 'bg-pink-500',
    indigo: 'bg-indigo-500',
    teal: 'bg-teal-500',
    orange: 'bg-orange-500',
    outline: 'bg-gray-500',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs',
        variants[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
