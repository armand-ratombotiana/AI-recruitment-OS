'use client';

import { useMemo, useState, useEffect, useRef, useId } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  totalItems?: number;
  pageSizeOptions?: number[];
  showPageSize?: boolean;
  showJumpTo?: boolean;
  siblingCount?: number;
  className?: string;
  ariaLabel?: string;
}

const PAGE_BUTTON_BASE =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-surface-900 disabled:opacity-50 disabled:pointer-events-none';

const PAGE_BUTTON_DEFAULT =
  'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700';

const PAGE_BUTTON_ICON =
  'inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-surface-600 dark:bg-surface-800 dark:text-gray-300 dark:hover:bg-surface-700 dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-surface-900';

export function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalItems,
  pageSizeOptions = [10, 25, 50, 100],
  showPageSize = true,
  showJumpTo = false,
  siblingCount = 1,
  className,
  ariaLabel = 'Pagination',
}: PaginationProps) {
  const baseId = useId();
  const [jumpValue, setJumpValue] = useState(String(page));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setJumpValue(String(page));
  }, [page]);

  const pages = useMemo(() => {
    const totalNumbers = siblingCount * 2 + 5;
    if (totalPages <= totalNumbers) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const leftSibling = Math.max(page - siblingCount, 1);
    const rightSibling = Math.min(page + siblingCount, totalPages);
    const showLeftDots = leftSibling > 2;
    const showRightDots = rightSibling < totalPages - 1;
    const result: (number | 'dots')[] = [1];
    if (showLeftDots) result.push('dots');
    for (let i = leftSibling; i <= rightSibling; i++) {
      if (i !== 1 && i !== totalPages) result.push(i);
    }
    if (showRightDots) result.push('dots');
    if (totalPages > 1) result.push(totalPages);
    return result;
  }, [page, totalPages, siblingCount]);

  if (totalPages <= 0) totalPages = 1;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = pageSize ? (safePage - 1) * pageSize + 1 : safePage;
  const end =
    pageSize && totalItems !== undefined
      ? Math.min(safePage * pageSize, totalItems)
      : safePage;

  const commitJump = () => {
    const n = parseInt(jumpValue, 10);
    if (isNaN(n)) {
      setJumpValue(String(safePage));
      return;
    }
    const clamped = Math.min(Math.max(1, n), totalPages);
    setJumpValue(String(clamped));
    if (clamped !== safePage) onPageChange(clamped);
  };

  if (totalPages <= 1 && !showPageSize && !showJumpTo) return null;

  return (
    <nav
      role="navigation"
      aria-label={ariaLabel}
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
    >
      <div className="text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
        {totalItems !== undefined ? (
          <span>
            Showing{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{start}</span>–
            <span className="font-medium text-gray-900 dark:text-gray-100">{end}</span> of{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{totalItems}</span>
            {totalItems === 1 ? ' item' : ' items'}
          </span>
        ) : (
          <span>
            Page{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{safePage}</span> of{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{totalPages}</span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={safePage === 1}
            aria-label="First page"
            className={PAGE_BUTTON_ICON}
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage === 1}
            aria-label="Previous page"
            className={PAGE_BUTTON_ICON}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          {pages.map((p, i) =>
            p === 'dots' ? (
              <span
                key={`dots-${i}`}
                className="inline-flex h-9 w-9 items-center justify-center text-sm text-gray-400 dark:text-gray-500 select-none"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-label={`Go to page ${p}`}
                aria-current={p === safePage ? 'page' : undefined}
                className={cn(
                  PAGE_BUTTON_BASE,
                  p === safePage
                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 dark:border-brand-500 dark:bg-brand-500 dark:text-white dark:hover:bg-brand-400'
                    : PAGE_BUTTON_DEFAULT
                )}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage === totalPages}
            aria-label="Next page"
            className={PAGE_BUTTON_ICON}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={safePage === totalPages}
            aria-label="Last page"
            className={PAGE_BUTTON_ICON}
          >
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {showJumpTo && totalPages > 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitJump();
              inputRef.current?.blur();
            }}
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400"
          >
            <label htmlFor={`${baseId}-jump`} className="whitespace-nowrap">
              Go to
            </label>
            <input
              ref={inputRef}
              id={`${baseId}-jump`}
              type="number"
              min={1}
              max={totalPages}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              onBlur={commitJump}
              aria-label={`Jump to page, current page ${safePage} of ${totalPages}`}
              className="w-14 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-center text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </form>
        )}
        {showPageSize && pageSize !== undefined && onPageSizeChange && (
          <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
            <label htmlFor={`${baseId}-size`} className="whitespace-nowrap">
              Per page
            </label>
            <select
              id={`${baseId}-size`}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Items per page"
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-200 dark:focus:border-brand-400 dark:focus:ring-brand-400"
            >
              {pageSizeOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </nav>
  );
}
