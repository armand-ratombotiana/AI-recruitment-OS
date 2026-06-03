'use client';

import { useMemo } from 'react';
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
  siblingCount?: number;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalItems,
  pageSizeOptions = [10, 25, 50, 100],
  showPageSize = true,
  siblingCount = 1,
  className,
}: PaginationProps) {
  const pages = useMemo(() => {
    const totalNumbers = siblingCount * 2 + 5;
    if (totalPages <= totalNumbers) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const leftSibling = Math.max(page - siblingCount, 1);
    const rightSibling = Math.min(page + siblingCount, totalPages);
    const showLeftDots = leftSibling > 2;
    const showRightDots = rightSibling < totalPages - 1;
    const pages: (number | 'dots')[] = [1];
    if (showLeftDots) pages.push('dots');
    for (let i = leftSibling; i <= rightSibling; i++) {
      if (i !== 1 && i !== totalPages) pages.push(i);
    }
    if (showRightDots) pages.push('dots');
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  }, [page, totalPages, siblingCount]);

  if (totalPages <= 1 && !showPageSize) return null;

  const safePage = Math.min(Math.max(1, page), Math.max(1, totalPages));

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
    >
      <div className="text-sm text-gray-600" aria-live="polite">
        {totalItems !== undefined && (
          <span>
            Showing {pageSize ? (safePage - 1) * pageSize + 1 : safePage}-
            {pageSize ? Math.min(safePage * pageSize, totalItems) : safePage} of {totalItems}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safePage === 1}
          aria-label="First page"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage === 1}
          aria-label="Previous page"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        {pages.map((p, i) =>
          p === 'dots' ? (
            <span
              key={`dots-${i}`}
              className="inline-flex h-9 w-9 items-center justify-center text-sm text-gray-400"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === safePage ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                p === safePage
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
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
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={safePage === totalPages}
          aria-label="Last page"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ChevronsRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {showPageSize && pageSize !== undefined && onPageSizeChange && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <label htmlFor="page-size" className="whitespace-nowrap">
            Per page
          </label>
          <select
            id="page-size"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
    </nav>
  );
}
