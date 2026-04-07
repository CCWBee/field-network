'use client';

import { ReactNode } from 'react';
import { Modal, ModalFooter } from './Modal';

export type ConfirmVariant = 'default' | 'danger';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
}: ConfirmDialogProps) {
  const confirmClass =
    variant === 'danger'
      ? 'bg-signal-red text-white hover:bg-signal-red/90'
      : 'bg-field-500 text-white hover:bg-field-600';

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isLoading) onClose();
      }}
      title={title}
      size="md"
      closeOnBackdropClick={!isLoading}
      closeOnEscape={!isLoading}
      showCloseButton={!isLoading}
    >
      <div className="text-sm text-ink-700 whitespace-pre-wrap">{message}</div>
      <ModalFooter className="-mx-4 -mb-4 mt-4">
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="px-4 py-2 border border-ink-200 rounded-sm text-ink-700 hover:bg-ink-50 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={() => onConfirm()}
          disabled={isLoading}
          className={`px-4 py-2 rounded-sm disabled:opacity-50 ${confirmClass}`}
        >
          {isLoading ? 'Working...' : confirmLabel}
        </button>
      </ModalFooter>
    </Modal>
  );
}

export default ConfirmDialog;
