'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Ghost,
  Info,
  Lock,
  LockOpen,
  Maximize2,
  Minimize2,
  MoreVertical,
  Pencil,
  Phone,
  Search,
  ShieldCheck,
  Trash2,
  Video,
  WifiOff,
  X,
} from 'lucide-react';
import { Avatar, GroupAvatar } from '@/components/ui/Avatar';
import { conversationName, isGroupConversation } from '@/lib/conversations';
import { presenceText } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/lib/types';

interface ChatHeaderProps {
  conversation: Conversation;
  meId: string;
  online: boolean;
  onlineMembers: number;
  typing: boolean;
  connected: boolean;
  focusMode: boolean;
  searchOpen: boolean;
  searchQuery: string;
  matchCount: number;
  matchIndex: number;
  onToggleSearch: () => void;
  onSearchQueryChange: (value: string) => void;
  onCloseSearch: () => void;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  onStartAudio: () => void;
  onStartVideo: () => void;
  onOpenInfo: () => void;
  onToggleFocus: () => void;
  onBack: () => void;
  onClearChat: () => void;
  onRenameContact: () => void;
  onRenameGroup: () => void;
  locked: boolean;
  onLockChat: () => void;
  onRemoveLock: () => void;
}

export function ChatHeader({
  conversation,
  meId,
  online,
  onlineMembers,
  typing,
  connected,
  focusMode,
  searchOpen,
  searchQuery,
  matchCount,
  matchIndex,
  onToggleSearch,
  onSearchQueryChange,
  onCloseSearch,
  onPrevMatch,
  onNextMatch,
  onStartAudio,
  onStartVideo,
  onOpenInfo,
  onToggleFocus,
  onBack,
  onClearChat,
  onRenameContact,
  onRenameGroup,
  locked,
  onLockChat,
  onRemoveLock,
}: ChatHeaderProps) {
  const { other, modes } = conversation;
  const group = isGroupConversation(conversation);
  const name = conversationName(conversation);
  const canRename = group && conversation.createdBy === meId;
  const peer = other ? { ...other, online } : null;
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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

  useEffect(() => {
    if (!searchOpen) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  const status = typing
    ? 'typing…'
    : group
      ? connected
        ? `${conversation.memberCount} members${onlineMembers > 0 ? ` · ${onlineMembers} online` : ''}`
        : 'Reconnecting to relay…'
      : !connected
        ? 'Reconnecting to relay…'
        : peer
          ? presenceText(peer)
          : 'Offline';

  return (
    <header className="shrink-0 border-b border-line bg-panel">
      <div className="flex h-[60px] items-center gap-1.5 px-2 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-ink md:hidden"
          aria-label="Back to conversations"
        >
          <ChevronLeft size={20} />
        </button>

        {group || !peer ? (
          <GroupAvatar size="md" label={name} />
        ) : (
          <Avatar user={peer} size="md" online={online} />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink sm:text-[14.5px]">
              {name}
            </h1>
            {modes.anonymity && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-1.5 py-[1px] text-[8.5px] font-semibold uppercase tracking-[0.06em] text-accent"
                title="Anonymity is on for this thread"
              >
                <ShieldCheck size={9} />
                <span className="hidden lg:inline">Anonymity</span>
              </span>
            )}
            {modes.vanish && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-[1px] text-[8.5px] font-semibold uppercase tracking-[0.06em] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                title="Vanish mode is on for this thread"
              >
                <Ghost size={9} />
                <span className="hidden lg:inline">Vanish</span>
              </span>
            )}
          </div>
          <p
            className={cn(
              'mt-0.5 truncate text-[10.5px] leading-tight sm:text-[11px]',
              typing
                ? 'text-accent'
                : online && connected
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-faint',
            )}
          >
            {status}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={onToggleSearch}
            aria-pressed={searchOpen}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-colors sm:h-9 sm:w-9',
              searchOpen
                ? 'bg-accent-soft text-accent'
                : 'text-muted hover:bg-panel-2 hover:text-ink',
            )}
            aria-label={searchOpen ? 'Close conversation search' : 'Search in conversation'}
            title="Search in conversation"
          >
            <Search size={17} />
          </button>

          <button
            type="button"
            onClick={onStartAudio}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-accent sm:h-9 sm:w-9"
            aria-label={group ? 'Start group audio call' : 'Start audio call'}
            title={group ? 'Group audio call' : 'Audio call'}
          >
            <Phone size={17} />
          </button>
          <button
            type="button"
            onClick={onStartVideo}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-accent sm:h-9 sm:w-9"
            aria-label={group ? 'Start group video call' : 'Start video call'}
            title={group ? 'Group video call' : 'Video call'}
          >
            <Video size={18} />
          </button>

          <button
            type="button"
            onClick={onToggleFocus}
            aria-pressed={focusMode}
            className={cn(
              'hidden h-9 w-9 items-center justify-center rounded-full transition-colors md:flex',
              focusMode
                ? 'bg-accent-soft text-accent'
                : 'text-muted hover:bg-panel-2 hover:text-ink',
            )}
            aria-label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
            title={focusMode ? 'Exit focus mode' : 'Focus mode'}
          >
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          <button
            type="button"
            onClick={onOpenInfo}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-ink sm:h-9 sm:w-9"
            aria-label="Conversation details"
            title="Conversation details"
          >
            <Info size={18} />
          </button>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="More conversation actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="More"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full transition-colors sm:h-9 sm:w-9',
                menuOpen ? 'bg-panel-2 text-ink' : 'text-muted hover:bg-panel-2 hover:text-ink',
              )}
            >
              <MoreVertical size={18} />
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="Conversation actions"
                className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-line bg-elevated p-1 shadow-[0_18px_50px_-18px_rgba(15,23,42,0.5)] animate-pop-in"
              >
                {!group && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onRenameContact();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-ink transition-colors hover:bg-panel-2"
                  >
                    <Pencil size={14} className="text-muted" />
                    Rename contact
                  </button>
                )}
                {canRename && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onRenameGroup();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-ink transition-colors hover:bg-panel-2"
                  >
                    <Pencil size={14} className="text-muted" />
                    Rename group
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    if (locked) onRemoveLock();
                    else onLockChat();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-ink transition-colors hover:bg-panel-2"
                >
                  {locked ? <LockOpen size={14} className="text-muted" /> : <Lock size={14} className="text-muted" />}
                  {locked ? 'Remove chat lock' : 'Lock chat'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onClearChat();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-danger transition-colors hover:bg-danger/10"
                >
                  <Trash2 size={14} />
                  Clear chat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {searchOpen && (
        <div className="flex items-center gap-1.5 border-t border-line px-2 py-1.5 sm:px-4">
          <Search size={14} className="ml-1 shrink-0 text-faint" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onCloseSearch();
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                if (event.shiftKey) onPrevMatch();
                else onNextMatch();
              }
            }}
            placeholder="Search loaded messages"
            aria-label="Search loaded messages in this conversation"
            className="h-8 min-w-0 flex-1 bg-transparent text-[12.5px] text-ink placeholder:text-faint focus:outline-none"
          />
          <span
            className="shrink-0 px-1 text-[10px] tabular-nums text-faint"
            aria-live="polite"
          >
            {searchQuery.trim()
              ? matchCount > 0
                ? `${matchIndex + 1} of ${matchCount}`
                : 'No matches'
              : 'Loaded messages'}
          </span>
          <button
            type="button"
            onClick={onPrevMatch}
            disabled={matchCount === 0}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-35"
            aria-label="Previous match"
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            onClick={onNextMatch}
            disabled={matchCount === 0}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-35"
            aria-label="Next match"
          >
            <ChevronDown size={15} />
          </button>
          <button
            type="button"
            onClick={onCloseSearch}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-ink"
            aria-label="Close search"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {!connected && (
        <div className="flex items-center gap-2 border-t border-amber-200/60 bg-amber-50 px-4 py-1.5 text-[10.5px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <WifiOff size={11} />
          Connection lost — messages will send once the relay reconnects.
        </div>
      )}
    </header>
  );
}
