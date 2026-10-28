'use client';

import { useEffect, useState } from 'react';
import { Loader2, Pencil, RotateCcw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface ContactAliasDialogProps {
  open: boolean;
  otherName: string;
  username: string;
  currentName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

/** A private nickname for one contact. Only the signed-in account sees it. */
export function ContactAliasDialog({
  open,
  otherName,
  username,
  currentName,
  busy,
  error,
  onClose,
  onSubmit,
}: ContactAliasDialogProps) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(currentName);
  }, [open, currentName]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    onSubmit(name.trim());
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rename contact"
      description={`Choose the name you see for @${username}. This only changes your own view.`}
      className="max-w-sm"
    >
      <form onSubmit={submit} className="p-5 pt-0">
        <label
          htmlFor="contact-alias-name"
          className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted"
        >
          Name you see
        </label>
        <div className="relative">
          <Pencil
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            id="contact-alias-name"
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, 40))}
            autoComplete="off"
            autoFocus
            placeholder={otherName}
            className="h-10 w-full rounded-xl border border-line bg-panel-2 pl-10 pr-3 text-[13px] text-ink outline-none transition-colors focus:border-accent focus:bg-panel focus:ring-4 focus:ring-accent/10"
          />
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          For example, type <span className="font-medium text-ink">Dad</span> and this chat will
          show that name instead of {otherName}. {otherName} keeps their own name everywhere else.
        </p>

        {error && (
          <p role="alert" className="mt-2 text-[11px] font-medium text-danger">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onSubmit('')}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-60"
          >
            <RotateCcw size={12} />
            Use original name
          </button>
          <div className="flex items-center gap-2">
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
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[12.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
              Save name
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
