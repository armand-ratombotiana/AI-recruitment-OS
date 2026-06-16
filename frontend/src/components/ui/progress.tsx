import React from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export const Progress = React.memo(function Progress({ value, max = 100, size = 'md', showLabel = false, variant = 'default' }: ProgressProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const heights = { sm: 'h-1', md: 'h-2', lg: 'h-3' };
  const variants = {
    default: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-500',
    danger: 'bg-red-600',
  };

  return (
    <div className="w-full">
      <div className={cn('w-full rounded-full bg-gray-200', heights[size])}>
        <div
          className={cn('rounded-full transition-all', heights[size], variants[variant])}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-sm text-gray-500 mt-1">{Math.round(percentage)}%</p>
      )}
    </div>
  );
});
