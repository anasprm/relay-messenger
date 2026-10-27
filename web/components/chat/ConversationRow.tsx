'use client';

import { FileText, Flame, Image as ImageIcon, Mic, Pin, Star, Video } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { formatSnippetTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Conversation, Message } from '@/lib/types';

function messagePreview(message: Message): string {
  const anonymousPrefix = message.anonymous ? 'Anonymous: ' : '';
  if (message.kind === 'image') return `${anonymousPrefix}Photo`;
  if (message.kind === 'audio') return `${anonymousPrefix}Voice message`;
  if (message.kind === 'video') return `${anonymousPrefix}Video message`;
  if (message.kind === 'file') return `${anonymousPrefix}${message.attachment?.name || 'File'}`;
  return `${anonymousPrefix}${message.text}`;
}

function KindIcon({ kind }: { kind: Message['kind'] }) {
  const props = { size: 12, className: 'shrink-0 text-faint' };
  if (kind === 'image') return <ImageIcon {...props} />;
  if (kind === 'audio') return <Mic {...props} />;
  if (kind === 'video') return <Video {...props} />;
  if (kind === 'file') return <FileText {...props} />;
  return null;
}

interface ConversationRowProps {
  conversation: Conversation;
  meId: string;
  active: boolean;
  online: boolean;
  typing: boolean;
  draft?: string;
  favorite?: boolean;
  pinned?: boolean;
  onSelect: () => void;
}

export function ConversationRow({
  conversation,
  meId,
  active,
  online,
  typing,
  draft,
  favorite,
  pinned,
  onSelect,
}: ConversationRowProps) {
  const { other, lastMessage, unreadCount } = conversation;
  const unread = unreadCount > 0;
  const isMine = lastMessage?.senderId === meId;
  const preview = lastMessage ? messagePreview(lastMessage) : 'No messages yet';
  const draftText = draft?.trim();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
        active ? 'bg-panel-2' : 'hover:bg-panel-2/70',
      )}
      aria-current={active ? 'true' : undefined}
      aria-label={`Open conversation with ${other.displayName}${unread ? `, ${unreadCount} unread` : ''}`}
    >
      {active && (
        <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent" aria-hidden="true" />
      )}

      <Avatar user={other} size="lg" online={online} />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'truncate text-[13.5px] tracking-[-0.005em] text-ink',
              unread ? 'font-semibold' : 'font-medium',
            )}
          >
            {other.displayName}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] tabular-nums text-faint">
            {pinned && <Pin size={10} className="text-faint" aria-label="Pinned" />}
            {favorite && <Star size={10} className="fill-amber-400 text-amber-400" aria-label="Favorite" />}
            {lastMessage && <span>{formatSnippetTime(lastMessage.createdAt)}</span>}
          </span>
        </span>

        <span className="mt-0.5 flex min-h-[18px] items-center gap-1.5">
          {typing ? (
            <span className="truncate text-[12px] font-medium text-accent">typing…</span>
          ) : draftText ? (
            <span className="truncate text-[12px] text-accent">
              <span className="font-medium">Draft:</span> {draftText}
            </span>
          ) : (
            <>
              {lastMessage && lastMessage.kind !== 'text' && <KindIcon kind={lastMessage.kind} />}
              {lastMessage?.ephemeral && <Flame size={11} className="shrink-0 text-amber-500/90" />}
              <span
                className={cn(
                  'truncate text-[12px]',
                  unread ? 'font-medium text-ink/75' : 'text-muted',
                )}
              >
                {isMine && lastMessage ? 'You: ' : ''}
                {preview}
              </span>
            </>
          )}

          {unread && (
            <span className="ml-auto flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[9.5px] font-bold tabular-nums text-accent-ink">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
