'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LogOut,
  MessageSquarePlus,
  MoreVertical,
  Search,
  Star,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/utils';
import type { Conversation, User } from '@/lib/types';
import { ConversationRow } from './ConversationRow';

export type ConversationFilter = 'all' | 'unread' | 'favorites';

interface SidebarProps {
  user: User;
  conversations: Conversation[];
  activeId: string | null;
  onlineIds: Set<string>;
  typing: Record<string, boolean>;
  drafts: Record<string, string>;
  favorites: Set<string>;
  pinned: Set<string>;
  loading: boolean;
  connected: boolean;
  filter: ConversationFilter;
  focusSearchSignal?: number;
  onFilterChange: (filter: ConversationFilter) => void;
  onSelect: (id: string) => void;
  onNewChat: (query?: string) => void;
  onProfile: () => void;
  onLogout: () => void;
  className?: string;
}

function activityTime(conversation: Conversation): number {
  return new Date(conversation.lastMessage?.createdAt || conversation.updatedAt).getTime();
}

export function Sidebar({
  user,
  conversations,
  activeId,
  onlineIds,
  typing,
  drafts,
  favorites,
  pinned,
  loading,
  connected,
  filter,
  focusSearchSignal = 0,
  onFilterChange,
  onSelect,
  onNewChat,
  onProfile,
  onLogout,
  className,
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusSearchSignal > 0) searchRef.current?.focus();
  }, [focusSearchSignal]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const unreadConversations = conversations.filter((conversation) => conversation.unreadCount > 0).length;
  const term = query.trim();

  const filtered = useMemo(() => {
    const needle = term.toLowerCase();
    let list = conversations.filter((conversation) => {
      if (!needle) return true;
      return (
        conversation.other.displayName.toLowerCase().includes(needle) ||
        conversation.other.username.toLowerCase().includes(needle) ||
        (conversation.lastMessage?.text || '').toLowerCase().includes(needle) ||
        (conversation.lastMessage?.attachment?.name || '').toLowerCase().includes(needle)
      );
    });

    if (filter === 'unread') list = list.filter((conversation) => conversation.unreadCount > 0);
    if (filter === 'favorites') list = list.filter((conversation) => favorites.has(conversation.id));

    return [...list].sort((first, second) => {
      const firstPinned = pinned.has(first.id) ? 1 : 0;
      const secondPinned = pinned.has(second.id) ? 1 : 0;
      if (firstPinned !== secondPinned) return secondPinned - firstPinned;
      return activityTime(second) - activityTime(first);
    });
  }, [conversations, favorites, filter, pinned, term]);

  const filterOptions: Array<{ value: ConversationFilter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: conversations.length },
    { value: 'unread', label: 'Unread', count: unreadConversations },
    { value: 'favorites', label: 'Favorites', count: favorites.size },
  ];

  return (
    <aside className={cn('flex h-full min-h-0 flex-col bg-panel', className)}>
      <header className="flex h-[64px] shrink-0 items-center gap-2.5 border-b border-line px-3">
        <button
          type="button"
          onClick={onProfile}
          className="shrink-0 rounded-full transition-opacity hover:opacity-90 focus-visible:opacity-90"
          aria-label="Open your profile"
          title="Your profile"
        >
          <Avatar user={user} size="md" online />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-ink">
            {user.displayName}
          </p>
          <p className="truncate text-[10px] leading-tight text-faint">@{user.username}</p>
        </div>

        <button
          type="button"
          onClick={() => onNewChat()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-accent"
          aria-label="New conversation"
          title="New conversation"
        >
          <MessageSquarePlus size={18} />
        </button>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-ink',
              menuOpen && 'bg-panel-2 text-ink',
            )}
            aria-label="Open menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Menu"
          >
            <MoreVertical size={18} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="Account menu"
              className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-line bg-elevated p-1 shadow-[0_18px_50px_-18px_rgba(15,23,42,0.45)] animate-pop-in"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onProfile();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-ink transition-colors hover:bg-panel-2"
              >
                <UserRound size={15} className="text-muted" />
                Your profile
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onNewChat();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-ink transition-colors hover:bg-panel-2"
              >
                <MessageSquarePlus size={15} className="text-muted" />
                New conversation
              </button>
              <div className="my-1 h-px bg-line" />
              <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5">
                <span className="text-[12px] font-medium text-ink">Appearance</span>
                <ThemeToggle compact />
              </div>
              <div className="my-1 h-px bg-line" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-danger transition-colors hover:bg-danger/10"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('');
                event.currentTarget.blur();
              }
            }}
            placeholder="Search chats"
            aria-label="Search conversations"
            className="h-9 w-full rounded-lg border border-transparent bg-panel-2 pl-9 pr-9 text-[12.5px] text-ink placeholder:text-faint transition-colors focus:border-accent/40 focus:bg-panel focus:outline-none focus:ring-2 focus:ring-accent/15"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-faint transition-colors hover:bg-panel hover:text-ink"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 px-3 pb-2" role="group" aria-label="Conversation filters">
        {filterOptions.map((option) => {
          const active = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onFilterChange(option.value)}
              aria-pressed={active}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted hover:bg-panel-2 hover:text-ink',
              )}
            >
              {option.value === 'favorites' && <Star size={10} />}
              {option.label}
              <span
                className={cn(
                  'tabular-nums',
                  active ? 'text-accent/70' : 'text-faint',
                )}
              >
                {option.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-2">
        {loading ? (
          <div className="space-y-0.5 px-3">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 py-2.5">
                <div className="skeleton h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-2.5 w-28 rounded-full" />
                  <div className="skeleton h-2 w-40 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-panel-2 text-faint">
              {filter === 'favorites' ? <Star size={18} /> : <Search size={18} />}
            </span>
            <p className="text-[12.5px] font-semibold text-ink">
              {term
                ? `No chats match “${term}”`
                : filter === 'unread'
                  ? 'You’re all caught up'
                  : filter === 'favorites'
                    ? 'No favorites yet'
                    : 'No conversations yet'}
            </p>
            <p className="max-w-[15rem] text-[11px] leading-relaxed text-muted">
              {term
                ? 'Start a direct thread with that exact username, or try a different search.'
                : filter === 'unread'
                  ? 'New unread conversations will appear here.'
                  : filter === 'favorites'
                    ? 'Open a conversation and add it to favorites from its contact details.'
                    : 'Start a direct thread by entering an exact username.'}
            </p>
            <button
              type="button"
              onClick={() => onNewChat(term || undefined)}
              className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-[11px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
            >
              <MessageSquarePlus size={12} />
              {term ? `Start chat with @${term}` : 'New conversation'}
            </button>
          </div>
        ) : (
          <div>
            {filtered.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                meId={user.id}
                active={conversation.id === activeId}
                online={onlineIds.has(conversation.other.id) || conversation.other.online}
                typing={!!typing[conversation.id]}
                draft={drafts[conversation.id]}
                favorite={favorites.has(conversation.id)}
                pinned={pinned.has(conversation.id)}
                onSelect={() => onSelect(conversation.id)}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-line px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <Logo compact />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold leading-tight text-ink">Relay</p>
            <p className="text-[9.5px] leading-tight text-faint">Direct messages</p>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium',
              connected
                ? 'bg-accent-soft text-accent'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
            )}
            title={connected ? 'Realtime relay connected' : 'Reconnecting to relay'}
          >
            {connected ? <Wifi size={9} /> : <WifiOff size={9} />}
            {connected ? 'Live' : 'Reconnecting'}
          </span>
        </div>
      </footer>
    </aside>
  );
}
