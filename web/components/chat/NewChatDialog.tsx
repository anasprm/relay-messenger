'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, Search, UserRound } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/AuthProvider';
import { presenceText } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

interface NewChatDialogProps {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onStart: (username: string) => Promise<void>;
}

export function NewChatDialog({ open, initialQuery, onClose, onStart }: NewChatDialogProps) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [startingName, setStartingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery || '');
    setError(null);
    setStartingName(null);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [initialQuery, open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = window.setTimeout(
      async () => {
        setSearching(true);
        try {
          const response = await api.get<{ users: User[] }>(
            `/api/users/search?q=${encodeURIComponent(query.trim())}`,
          );
          if (active) setUsers(response.users);
        } catch (caught) {
          if (active) setError(errorMessage(caught));
        } finally {
          if (active) setSearching(false);
        }
      },
      query.trim() ? 220 : 0,
    );

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  async function start(username: string) {
    const cleaned = username.trim().toLowerCase();
    if (!cleaned || startingName) return;

    setStartingName(cleaned);
    setError(null);
    try {
      await onStart(cleaned);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setStartingName(null);
    }
  }

  const term = query.trim().toLowerCase();
  const exact = users.find((user) => user.username === term);
  const showDirect = !!term && !exact;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New conversation"
      description="Search the workspace directory or enter an exact username to start instantly."
      className="max-w-md"
    >
      <div className="p-4">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (!term) return;
              void start(exact ? exact.username : term);
            }}
            placeholder="username"
            autoCapitalize="none"
            spellCheck={false}
            className="h-10 w-full rounded-xl border border-line bg-panel-2 pl-9 pr-9 text-[12.5px] text-ink placeholder:text-faint transition-colors focus:border-accent/60 focus:bg-panel focus:outline-none focus:ring-4 focus:ring-accent/10"
          />
          {searching && (
            <Loader2
              size={13}
              className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-accent"
            />
          )}
        </div>

        {error && (
          <p className="mt-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        <p className="mb-2 mt-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
          {term ? 'Matching people' : 'Workspace directory'}
        </p>

        <div className="scrollbar-thin -mx-1 max-h-[280px] overflow-y-auto px-1">
          {users.length === 0 && !searching ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <UserRound size={20} className="text-faint" />
              <p className="text-[11.5px] text-muted">
                {term ? `No directory match for “${term}”` : 'No other accounts yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => void start(user.username)}
                  disabled={!!startingName}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-panel-2 disabled:opacity-60"
                >
                  <Avatar user={user} size="sm" online={user.online} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-ink">
                      {user.displayName}
                    </span>
                    <span className="block truncate text-[10px] text-faint">
                      @{user.username} · {presenceText(user)}
                    </span>
                  </span>
                  {startingName === user.username ? (
                    <Loader2 size={13} className="animate-spin text-accent" />
                  ) : (
                    <ArrowRight size={13} className="text-faint" />
                  )}
                </button>
              ))}
            </div>
          )}

          {showDirect && (
            <button
              type="button"
              onClick={() => void start(term)}
              disabled={!!startingName}
              className="mt-2 flex w-full items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2.5 text-left transition-colors hover:border-accent/50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
                {startingName === term ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <UserRound size={14} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] font-medium text-accent">
                  Start a thread with @{term}
                </span>
                <span className="block text-[10px] text-accent/70">
                  Exact username lookup · press Enter
                </span>
              </span>
              <ArrowRight size={13} className="text-accent" />
            </button>
          )}
        </div>

        <p className="mt-4 border-t border-line pt-3 text-[10px] leading-relaxed text-faint">
          Usernames are unique across the workspace. Entering an exact username creates the direct
          thread immediately — no invitation required.
        </p>
      </div>
    </Modal>
  );
}
