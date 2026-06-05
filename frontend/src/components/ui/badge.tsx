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
  | 'outline'
  | 'solid-primary'
  | 'solid-success'
  | 'solid-warning'
  | 'solid-danger';

type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  icon?: React.ReactNode;
  ariaLabel?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-800 dark:bg-surface-800 dark:text-gray-200',
  success: 'bg-green-100 text-green-800 dark:bg-success-500/20 dark:text-success-500',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-warning-500/20 dark:text-warning-500',
  danger: 'bg-red-100 text-red-800 dark:bg-danger-500/20 dark:text-danger-500',
  info: 'bg-blue-100 text-blue-800 dark:bg-info-500/20 dark:text-info-500',
  purple: 'bg-purple-100 text-purple-800 dark:bg-accent-500/20 dark:text-accent-300',
  pink: 'bg-pink-100 text-pink-800 dark:bg-pink-500/20 dark:text-pink-300',
  indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300',
  outline: 'border border-gray-300 text-gray-700 bg-transparent dark:border-surface-600 dark:text-gray-300',
  'solid-primary': 'bg-blue-600 text-white dark:bg-brand-500',
  'solid-success': 'bg-green-600 text-white dark:bg-success-500',
  'solid-warning': 'bg-yellow-500 text-white dark:bg-warning-500',
  'solid-danger': 'bg-red-600 text-white dark:bg-danger-500',
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
  'solid-primary': 'bg-white/80',
  'solid-success': 'bg-white/80',
  'solid-warning': 'bg-white/80',
  'solid-danger': 'bg-white/80',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  icon,
  className,
  ariaLabel,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      aria-label={ariaLabel}
      {...props}
    >
      {icon && <span className="inline-flex shrink-0" aria-hidden="true">{icon}</span>}
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
