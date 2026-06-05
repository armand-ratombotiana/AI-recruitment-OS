'use client';

import { useId } from 'react';

import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

import { Modal } from './modal';

import { Button } from './button';

import { cn } from '@/lib/utils';

type ConfirmVariant = 'default' | 'danger' | 'warning' | 'info' | 'success';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  destructive?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
}

type ButtonVariant = 'primary' | 'danger' | 'success';

const variantConfig: Record<
  ConfirmVariant,
  { icon: React.ReactNode; bgClass: string; iconClass: string; buttonVariant: ButtonVariant }
> = {
  default: {
    icon: <Info className="h-6 w-6" aria-hidden="true" />,
    bgClass: 'bg-gray-100 dark:bg-surface-700',
    iconClass: 'text-gray-600 dark:text-gray-300',
    buttonVariant: 'primary',
  },
  danger: {
    icon: <AlertTriangle className="h-6 w-6" aria-hidden="true" />,
    bgClass: 'bg-red-100 dark:bg-danger-500/10',
    iconClass: 'text-red-600 dark:text-danger-500',
    buttonVariant: 'danger',
  },
  warning: {
    icon: <AlertTriangle className="h-6 w-6" aria-hidden="true" />,
    bgClass: 'bg-amber-100 dark:bg-warning-500/10',
    iconClass: 'text-amber-600 dark:text-warning-500',
    buttonVariant: 'primary',
  },
  info: {
    icon: <Info className="h-6 w-6" aria-hidden="true" />,
    bgClass: 'bg-blue-100 dark:bg-info-500/10',
    iconClass: 'text-blue-600 dark:text-info-500',
    buttonVariant: 'primary',
  },
  success: {
    icon: <CheckCircle2 className="h-6 w-6" aria-hidden="true" />,
    bgClass: 'bg-green-100 dark:bg-success-500/10',
    iconClass: 'text-green-600 dark:text-success-500',
    buttonVariant: 'success',
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  destructive = false,
  closeOnBackdropClick = false,
  closeOnEscape = !loading,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();

  const config = destructive ? variantConfig.danger : variantConfig[variant];
  const buttonVariant: ButtonVariant = destructive ? 'danger' : config.buttonVariant;

  const handleConfirm = async () => {
    try {
      await onConfirm();
    } catch {
      /* swallow; parent handles errors */
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? () => undefined : onClose}
      title=""
      showCloseButton={!loading}
      size="sm"
      closeOnBackdropClick={loading ? false : closeOnBackdropClick}
      closeOnEscape={closeOnEscape}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
            config.bgClass,
            config.iconClass
          )}
          aria-hidden="true"
        >
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3
            id={titleId}
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            {title}
          </h3>
          {description && (
            <p id={descId} className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={buttonVariant} onClick={handleConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
