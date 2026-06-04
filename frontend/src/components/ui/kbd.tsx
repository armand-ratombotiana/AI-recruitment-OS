import { cn } from '@/lib/utils';

interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  variant?: 'default' | 'brand' | 'subtle';
  size?: 'xs' | 'sm' | 'md';
}

export function Kbd({
  children,
  variant = 'default',
  size = 'sm',
  className,
  ...props
}: KbdProps) {
  const variants = {
    default:
      'bg-white text-gray-700 border border-gray-200 shadow-[0_1px_0_1px_rgba(0,0,0,0.06)] dark:bg-surface-800 dark:text-gray-200 dark:border-surface-600',
    brand:
      'bg-gradient-to-b from-blue-50 to-blue-100 text-blue-800 border border-blue-200 shadow-[0_1px_0_1px_rgba(37,99,235,0.15)] dark:from-brand-500/20 dark:to-brand-500/30 dark:text-brand-200 dark:border-brand-500/40',
    subtle:
      'bg-gray-100 text-gray-600 border border-transparent dark:bg-surface-800 dark:text-gray-400',
  };
  const sizes = {
    xs: 'h-4 min-w-4 px-1 text-[9px]',
    sm: 'h-5 min-w-5 px-1.5 text-[10px]',
    md: 'h-6 min-w-6 px-2 text-xs',
  };
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center font-mono font-semibold rounded select-none',
        'align-middle',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

interface KbdGroupProps {
  keys: string[];
  separator?: string;
  variant?: KbdProps['variant'];
  size?: KbdProps['size'];
  className?: string;
}

export function KbdGroup({ keys, separator = '+', variant, size, className }: KbdGroupProps) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {keys.map((k, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-gray-400 dark:text-gray-500">{separator}</span>}
          <Kbd variant={variant} size={size}>{k}</Kbd>
        </span>
      ))}
    </span>
  );
}
