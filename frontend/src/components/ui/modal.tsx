'use client';

import { useEffect, useRef, useCallback, useId } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnEscape?: boolean;
  closeOnBackdropClick?: boolean;
  showCloseButton?: boolean;
  footer?: React.ReactNode;
  initialFocus?: 'first' | 'dialog';
}

const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable]';

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  full: 'sm:max-w-[95vw] sm:h-[95vh]',
} as const;

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  closeOnEscape = true,
  closeOnBackdropClick = true,
  showCloseButton = true,
  footer,
  initialFocus = 'first',
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) {
          e.preventDefault();
          modalRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || active === modalRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [isOpen, closeOnEscape, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const t = setTimeout(() => {
      if (!modalRef.current) return;
      if (initialFocus === 'dialog') {
        modalRef.current.focus();
        return;
      }
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const target = focusable[0] ?? modalRef.current;
      target.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      clearTimeout(t);
      const prev = previousActiveElement.current;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus();
      }
    };
  }, [isOpen, handleKeyDown, initialFocus]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4"
      role="presentation"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={closeOnBackdropClick ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full bg-white dark:bg-surface-900 flex flex-col outline-none animate-scale-in',
          'h-full sm:h-auto sm:max-h-[90vh] sm:rounded-xl',
          'shadow-2xl dark:shadow-black/40',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-surface-900',
          SIZES[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 p-4 sm:p-6 border-b border-gray-100 dark:border-surface-700">
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {description}
              </p>
            )}
          </div>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-surface-900"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
        {footer && (
          <div className="border-t border-gray-100 dark:border-surface-700 p-4 bg-gray-50 dark:bg-surface-800 sm:rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
