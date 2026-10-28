'use client';

import { Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Small two-button confirmation used for unsend and clear-chat. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} description={description} className="max-w-sm">
      <div className="flex items-center justify-end gap-2 px-5 py-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex h-9 items-center rounded-full border border-line px-4 text-[12.5px] font-medium text-ink transition-colors hover:bg-panel-2 disabled:opacity-60"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold transition-colors disabled:opacity-70',
            destructive
              ? 'bg-danger text-white hover:bg-danger/90'
              : 'bg-accent text-accent-ink hover:bg-accent-hover',
          )}
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
