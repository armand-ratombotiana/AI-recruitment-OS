import { cn } from '@/lib/utils';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  text?: string;
  fullscreen?: boolean;
  label?: string;
}

export function Loading({
  size = 'md',
  className,
  text,
  fullscreen = false,
  label = 'Loading',
}: LoadingProps) {
  const sizes = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-[3px]',
    xl: 'h-16 w-16 border-4',
  };

  const content = (
    <div
      className={cn('flex flex-col items-center justify-center gap-3', className)}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          'animate-spin rounded-full border-gray-200 border-t-blue-600',
          sizes[size]
        )}
        aria-hidden="true"
      />
      {text && <p className="text-sm text-gray-500">{text}</p>}
      <span className="sr-only">{label}</span>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
        {content}
      </div>
    );
  }
  return content;
}

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  className,
  style,
  ...props
}: SkeletonProps) {
  const variants = {
    text: 'rounded h-3 w-full',
    circular: 'rounded-full',
    rectangular: '',
    rounded: 'rounded-lg',
  };

  const baseStyle: React.CSSProperties = {
    ...style,
    width: width !== undefined ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height:
      height !== undefined
        ? typeof height === 'number'
          ? `${height}px`
          : height
        : undefined,
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div
        className={cn('space-y-2', className)}
        role="status"
        aria-label="Loading content"
        aria-live="polite"
        {...props}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'animate-pulse bg-gray-200',
              variants.text,
              i === lines - 1 && 'w-3/4'
            )}
            style={i === lines - 1 ? { width: '75%' } : undefined}
          />
        ))}
      </div>
    );
  }

  if (variant === 'circular' && !width && !height) {
    baseStyle.width = baseStyle.width || '40px';
    baseStyle.height = baseStyle.height || '40px';
  }

  return (
    <div
      className={cn('animate-pulse bg-gray-200', variants[variant], className)}
      style={baseStyle}
      role="status"
      aria-label="Loading"
      aria-live="polite"
      {...props}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-xl border border-gray-200 bg-white p-6 shadow-sm', className)}
      role="status"
      aria-label="Loading card"
    >
      <div className="flex items-center space-x-4">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" width="80%" />
      </div>
    </div>
  );
}
