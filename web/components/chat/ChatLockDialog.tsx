'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Loader2, Lock, LockOpen } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface ChatLockDialogProps {
  open: boolean;
  mode: 'set' | 'remove';
  otherName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (pin: string) => void;
}

/** Set or remove the optional PIN lock for a single conversation. */
export function ChatLockDialog({
  open,
  mode,
  otherName,
  busy,
  error,
  onClose,
  onSubmit,
}: ChatLockDialogProps) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPin('');
    setConfirm('');
    setLocalError(null);
  }, [open, mode]);

  const setting = mode === 'set';

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (pin.length < 4) {
      setLocalError('Use at least 4 digits.');
      return;
    }
    if (setting && pin !== confirm) {
      setLocalError('The PINs do not match.');
      return;
    }
    setLocalError(null);
    onSubmit(pin);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={setting ? 'Lock this chat' : 'Remove chat lock'}
      description={
        setting
          ? `Require a PIN before opening your conversation with ${otherName}. This only affects your account.`
          : `Enter the PIN to remove the lock from your conversation with ${otherName}.`
      }
      className="max-w-sm"
    >
      <form onSubmit={submit} className="p-5 pt-0">
        <label
          htmlFor="chat-lock-new-pin"
          className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted"
        >
          {setting ? 'New PIN' : 'Current PIN'}
        </label>
        <div className="relative">
          <KeyRound
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            id="chat-lock-new-pin"
            value={pin}
            onChange={(event) => {
              setPin(event.target.value.replace(/\D/g, '').slice(0, 8));
              setLocalError(null);
            }}
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="4–8 digits"
            className="h-10 w-full rounded-xl border border-line bg-panel-2 pl-10 pr-3 text-[13px] tracking-[0.2em] text-ink outline-none transition-colors focus:border-accent focus:bg-panel focus:ring-4 focus:ring-accent/10"
          />
        </div>

        {setting && (
          <>
            <label
              htmlFor="chat-lock-confirm-pin"
              className="mb-1.5 mt-3 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted"
            >
              Confirm PIN
            </label>
            <div className="relative">
              <KeyRound
                size={14}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                id="chat-lock-confirm-pin"
                value={confirm}
                onChange={(event) => {
                  setConfirm(event.target.value.replace(/\D/g, '').slice(0, 8));
                  setLocalError(null);
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Repeat PIN"
                className="h-10 w-full rounded-xl border border-line bg-panel-2 pl-10 pr-3 text-[13px] tracking-[0.2em] text-ink outline-none transition-colors focus:border-accent focus:bg-panel focus:ring-4 focus:ring-accent/10"
              />
            </div>
          </>
        )}

        {(localError || error) && (
          <p role="alert" className="mt-2 text-[11px] font-medium text-danger">
            {localError || error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-full border border-line px-4 text-[12.5px] font-medium text-ink transition-colors hover:bg-panel-2 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || pin.length < 4}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[12.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : setting ? (
              <Lock size={13} />
            ) : (
              <LockOpen size={13} />
            )}
            {setting ? 'Lock chat' : 'Remove lock'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
