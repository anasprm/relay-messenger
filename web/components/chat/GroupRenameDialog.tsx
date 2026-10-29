'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface GroupRenameDialogProps {
  open: boolean;
  currentName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

/** Creator-only rename for a group chat. */
export function GroupRenameDialog({
  open,
  currentName,
  busy,
  error,
  onClose,
  onSubmit,
}: GroupRenameDialogProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(currentName);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
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
      title="Rename group"
      description="Everyone in the group sees the new name immediately."
      className="max-w-sm"
    >
      <form onSubmit={submit} className="p-4">
        <label htmlFor="group-rename" className="sr-only">
          Group name
        </label>
        <input
          id="group-rename"
          ref={inputRef}
          value={name}
          onChange={(event) => setName(event.target.value.slice(0, 40))}
          placeholder="Group name"
          maxLength={40}
          className="h-10 w-full rounded-xl border border-line bg-panel-2 px-3 text-[12.5px] text-ink placeholder:text-faint transition-colors focus:border-accent/60 focus:bg-panel focus:outline-none focus:ring-4 focus:ring-accent/10"
        />

        {error && (
          <p role="alert" className="mt-2 text-[11px] font-medium text-danger">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 rounded-xl px-3.5 text-[11.5px] font-semibold text-muted transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || name.trim().length < 2}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[11.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
