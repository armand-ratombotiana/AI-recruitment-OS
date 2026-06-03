'use client';

import { AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react';
import { Modal } from './modal';
import { Button } from './button';

type ConfirmVariant = 'danger' | 'warning' | 'info' | 'success';

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
}

const variantConfig: Record<
  ConfirmVariant,
  { icon: React.ReactNode; bgClass: string; iconClass: string; buttonVariant: 'primary' | 'danger' | 'success' }
> = {
  danger: {
    icon: <AlertTriangle className="h-6 w-6" aria-hidden="true" />,
    bgClass: 'bg-red-100',
    iconClass: 'text-red-600',
    buttonVariant: 'danger',
  },
  warning: {
    icon: <AlertTriangle className="h-6 w-6" aria-hidden="true" />,
    bgClass: 'bg-amber-100',
    iconClass: 'text-amber-600',
    buttonVariant: 'primary',
  },
  info: {
    icon: <Info className="h-6 w-6" aria-hidden="true" />,
    bgClass: 'bg-blue-100',
    iconClass: 'text-blue-600',
    buttonVariant: 'primary',
  },
  success: {
    icon: <CheckCircle2 className="h-6 w-6" aria-hidden="true" />,
    bgClass: 'bg-green-100',
    iconClass: 'text-green-600',
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
  variant = 'warning',
  loading = false,
  destructive = false,
}: ConfirmDialogProps) {
  const config = destructive ? variantConfig.danger : variantConfig[variant];
  const buttonVariant = destructive ? 'danger' : config.buttonVariant;

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      showCloseButton={false}
      size="sm"
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${config.bgClass} ${config.iconClass}`}
          aria-hidden="true"
        >
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {description && (
            <p className="mt-2 text-sm text-gray-600">{description}</p>
          )}
        </div>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={buttonVariant}
          onClick={handleConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
