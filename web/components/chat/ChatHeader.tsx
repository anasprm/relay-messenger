'use client';

import {
  ChevronLeft,
  Ghost,
  Phone,
  ShieldCheck,
  Video,
  WifiOff,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { presenceText } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Conversation, User } from '@/lib/types';

interface ChatHeaderProps {
  conversation: Conversation;
  me: User;
  online: boolean;
  typing: boolean;
  connected: boolean;
  onToggleAnonymity: () => void;
  onToggleVanish: () => void;
  onStartAudio: () => void;
  onStartVideo: () => void;
  onBack: () => void;
}

export function ChatHeader({
  conversation,
  me,
  online,
  typing,
  connected,
  onToggleAnonymity,
  onToggleVanish,
  onStartAudio,
  onStartVideo,
  onBack,
}: ChatHeaderProps) {
  const { other, modes } = conversation;
  const peer = { ...other, online };

  return (
    <header className="shrink-0 border-b border-line bg-panel/85 backdrop-blur supports-[backdrop-filter]:bg-panel/70">
      <div className="flex h-[68px] items-center gap-3 px-3 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel-2 hover:text-ink md:hidden"
          aria-label="Back to conversations"
        >
          <ChevronLeft size={18} />
        </button>

        <Avatar user={peer} size="md" online={online} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
              {other.displayName}
            </h1>
            {modes.anonymity && (
              <span className="hidden items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-1.5 py-[1px] text-[8.5px] font-semibold uppercase tracking-[0.08em] text-accent sm:inline-flex">
                <ShieldCheck size={8} />
                Anonymous
              </span>
            )}
            {modes.vanish && (
              <span className="hidden items-center gap-1 rounded-full border border-violet-300/60 bg-violet-50 px-1.5 py-[1px] text-[8.5px] font-semibold uppercase tracking-[0.08em] text-violet-600 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 sm:inline-flex">
                <Ghost size={8} />
                Vanish
              </span>
            )}
          </div>
          <p
            className={cn(
              'mt-0.5 truncate text-[11px]',
              typing ? 'text-accent' : online ? 'text-emerald-600 dark:text-emerald-400' : 'text-faint',
            )}
          >
            {typing ? 'typing…' : connected ? presenceText(peer) : 'Reconnecting to relay…'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleAnonymity}
            aria-pressed={modes.anonymity}
            title="Anonymity mode — mask your identity on delivery"
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors',
              modes.anonymity
                ? 'border-accent/40 bg-accent-soft text-accent'
                : 'border-line bg-panel text-muted hover:border-line-strong hover:text-ink',
            )}
          >
            <ShieldCheck size={14} />
            <span className="hidden lg:inline">Anonymity</span>
          </button>

          <button
            type="button"
            onClick={onToggleVanish}
            aria-pressed={modes.vanish}
            title="Vanish mode — messages are destroyed when you leave this thread"
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors',
              modes.vanish
                ? 'border-violet-400/50 bg-violet-50 text-violet-600 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
                : 'border-line bg-panel text-muted hover:border-line-strong hover:text-ink',
            )}
          >
            <Ghost size={14} />
            <span className="hidden lg:inline">Vanish</span>
          </button>

          <span className="mx-0.5 hidden h-5 w-px bg-line sm:block" />

          <button
            type="button"
            onClick={onStartAudio}
            title="Start audio call"
            aria-label="Start audio call"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel text-muted transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
          >
            <Phone size={14} />
          </button>
          <button
            type="button"
            onClick={onStartVideo}
            title="Start video call"
            aria-label="Start video call"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel text-muted transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
          >
            <Video size={15} />
          </button>
        </div>
      </div>

      {(modes.anonymity || modes.vanish || !connected) && (
        <div className="space-y-px">
          {!connected && (
            <div className="flex items-center gap-2 border-t border-amber-200/60 bg-amber-50 px-5 py-1.5 text-[10.5px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              <WifiOff size={11} />
              Connection lost — messages will send once the relay reconnects.
            </div>
          )}
          {modes.anonymity && (
            <div className="flex items-center gap-2 border-t border-accent/20 bg-accent-soft px-5 py-1.5 text-[10.5px] text-accent">
              <ShieldCheck size={11} />
              Anonymity is on — your name and profile are replaced with “Anonymous Operator” on
              delivery.
            </div>
          )}
          {modes.vanish && (
            <div className="flex items-center gap-2 border-t border-violet-200/60 bg-violet-50 px-5 py-1.5 text-[10.5px] text-violet-600 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300">
              <Ghost size={11} />
              Vanish mode is on — messages sent now are wiped from both sides when you leave this
              thread.
            </div>
          )}
        </div>
      )}
    </header>
  );
}
