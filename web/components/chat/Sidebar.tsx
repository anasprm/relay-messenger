'use client';

import { useMemo, useState } from 'react';
import { LogOut, MessageSquarePlus, Search, Wifi, WifiOff, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { UiStyleToggle } from '@/components/ui/UiStyleToggle';
import { cn } from '@/lib/utils';
import type { Conversation, User } from '@/lib/types';
import { ConversationRow } from './ConversationRow';

interface SidebarProps {
  user: User;
  conversations: Conversation[];
  activeId: string | null;
  onlineIds: Set<string>;
  typing: Record<string, boolean>;
  loading: boolean;
  connected: boolean;
  onSelect: (id: string) => void;
  onNewChat: (query?: string) => void;
  onLogout: () => void;
  className?: string;
}

export function Sidebar({
  user,
  conversations,
  activeId,
  onlineIds,
  typing,
  loading,
  connected,
  onSelect,
  onNewChat,
  onLogout,
  className,
}: SidebarProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((conversation) => {
      const name = conversation.other.displayName.toLowerCase();
      const username = conversation.other.username.toLowerCase();
      const snippet = conversation.lastMessage?.text?.toLowerCase() || '';
      return name.includes(needle) || username.includes(needle) || snippet.includes(needle);
    });
  }, [conversations, query]);

  const term = query.trim();

  return (
    <aside className={cn('flex h-full min-h-0 flex-col bg-panel', className)}>
      <div className="flex h-[68px] shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <Logo />
        <div className="flex items-center gap-1.5">
          <UiStyleToggle compact />
          <button
            type="button"
            onClick={() => onNewChat()}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-panel text-accent transition-colors hover:border-accent/40 hover:bg-accent-soft"
            aria-label="New conversation"
            title="New conversation"
          >
            <MessageSquarePlus size={17} />
          </button>
        </div>
      </div>

      <div className="shrink-0 space-y-3 px-4 pb-3 pt-4">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            className="h-9 w-full rounded-xl border border-line bg-panel-2 pl-9 pr-8 text-[12px] text-ink placeholder:text-faint transition-colors focus:border-accent/60 focus:bg-panel focus:outline-none focus:ring-4 focus:ring-accent/10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint transition-colors hover:text-ink"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">
            Direct messages
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[9px] font-medium',
              connected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-400',
            )}
            title={connected ? 'Realtime relay connected' : 'Reconnecting to relay'}
          >
            {connected ? <Wifi size={9} /> : <WifiOff size={9} />}
            {connected ? 'Live' : 'Connecting'}
          </span>
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="space-y-1 px-1">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 py-2.5">
                <div className="skeleton h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-2.5 w-28 rounded-full" />
                  <div className="skeleton h-2 w-40 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-panel-2 text-faint">
              <Search size={18} />
            </span>
            <p className="text-xs font-medium text-ink">
              {term ? `No conversations match “${term}”` : 'No conversations yet'}
            </p>
            <p className="text-[11px] leading-relaxed text-muted">
              {term
                ? 'Search the directory to start a new direct thread by username.'
                : 'Start a direct thread by entering an exact username.'}
            </p>
            <button
              type="button"
              onClick={() => onNewChat(term || undefined)}
              className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-[11px] font-medium text-ink transition-colors hover:border-accent/40 hover:text-accent"
            >
              <MessageSquarePlus size={12} />
              {term ? `Start chat with @${term}` : 'New conversation'}
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                meId={user.id}
                active={conversation.id === activeId}
                online={onlineIds.has(conversation.other.id) || conversation.other.online}
                typing={!!typing[conversation.id]}
                onSelect={() => onSelect(conversation.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl bg-panel-2 px-2.5 py-2">
          <Avatar user={user} size="sm" online />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-semibold text-ink">{user.displayName}</p>
            <p className="truncate text-[10px] text-faint">@{user.username}</p>
          </div>
          <ThemeToggle compact />
          <button
            type="button"
            onClick={onLogout}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-panel hover:text-red-500"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[9px] text-faint">
          <span className="h-1 w-1 rounded-full bg-emerald-500" />
          Relay v1.0 · stateless session
        </p>
      </div>
    </aside>
  );
}
