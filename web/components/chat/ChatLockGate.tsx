'use client';

import { useState } from 'react';
import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { Avatar, GroupAvatar } from '@/components/ui/Avatar';
import type { User } from '@/lib/types';

interface ChatLockGateProps {
  /** Contact name, or the group title. */
  title: string;
  /** The contact for a direct thread; null for a group. */
  user?: User | null;
  online: boolean;
  onUnlock: (pin: string) => Promise<string | null>;
}

/** Inline gate shown in place of a locked conversation's messages. */
export function ChatLockGate({ title, user, online, onUnlock }: ChatLockGateProps) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || pin.length < 4) return;
    setBusy(true);
    setError(null);
    const message = await onUnlock(pin);
    if (message) {
      setError(message);
      setPin('');
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-chat px-6 py-10">
      <form
        onSubmit={(event) => void submit(event)}
        className="w-full max-w-sm rounded-2xl border border-line bg-elevated p-6 text-center shadow-[0_24px_60px_-30px_rgba(15,23,42,0.45)]"
      >
        <div className="relative mx-auto w-fit">
          {user ? (
            <Avatar user={user} size="xl" online={online} />
          ) : (
            <GroupAvatar size="xl" label={title} />
          )}
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-elevated bg-accent text-accent-ink">
            <Lock size={13} />
          </span>
        </div>

        <h2 className="mt-4 text-[16px] font-semibold tracking-[-0.01em] text-ink">
          This chat is locked
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          {user ? `Enter your PIN to open your chat with ${title}.` : `Enter your PIN to open ${title}.`}
        </p>

        <label htmlFor="chat-lock-pin" className="sr-only">
          Chat PIN
        </label>
        <input
          id="chat-lock-pin"
          value={pin}
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, '').slice(0, 8));
            setError(null);
          }}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="••••"
          className="mt-4 h-11 w-full rounded-xl border border-line bg-panel-2 text-center text-lg font-semibold tracking-[0.35em] text-ink outline-none transition-colors focus:border-accent focus:bg-panel focus:ring-4 focus:ring-accent/10"
        />

        {error && (
          <p role="alert" className="mt-2 text-[11px] font-medium text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || pin.length < 4}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[12px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
          Unlock chat
        </button>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-faint">
          <ShieldCheck size={11} />
          The lock is optional and only applies to your account.
        </p>
      </form>
    </div>
  );
}
