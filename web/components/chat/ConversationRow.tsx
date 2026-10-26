'use client';

import { Flame, FileText, Image as ImageIcon, Mic, Video } from 'lucide-react';
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
  const props = { size: 11, className: 'shrink-0 text-faint' };
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
  onSelect: () => void;
}

export function ConversationRow({
  conversation,
  meId,
  active,
  online,
  typing,
  onSelect,
}: ConversationRowProps) {
  const { other, lastMessage, unreadCount } = conversation;
  const preview = lastMessage ? messagePreview(lastMessage) : 'No messages yet';
  const isMine = lastMessage?.senderId === meId;
  const unread = unreadCount > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors',
        active ? 'bg-accent-soft' : 'hover:bg-panel-2',
      )}
      aria-current={active ? 'true' : undefined}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-[2.5px] -translate-y-1/2 rounded-full bg-accent" />
      )}

      <Avatar user={other} size="md" online={online} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'truncate text-[12.5px] tracking-[-0.005em]',
              unread ? 'font-semibold text-ink' : 'font-medium text-ink',
            )}
          >
            {other.displayName}
          </span>
          {lastMessage && (
            <span className="ml-auto shrink-0 text-[9.5px] tabular-nums text-faint">
              {formatSnippetTime(lastMessage.createdAt)}
            </span>
          )}
        </div>

        <div className="mt-0.5 flex items-center gap-1.5">
          {typing ? (
            <span className="truncate text-[11px] font-medium text-accent">typing…</span>
          ) : (
            <>
              {lastMessage && lastMessage.kind !== 'text' && (
                <KindIcon kind={lastMessage.kind} />
              )}
              {lastMessage?.ephemeral && (
                <Flame size={10} className="shrink-0 text-amber-500/80" />
              )}
              <span
                className={cn(
                  'truncate text-[11px]',
                  unread ? 'font-medium text-ink/75' : 'text-muted',
                )}
              >
                {isMine && lastMessage?.kind === 'text' ? 'You: ' : ''}
                {preview}
              </span>
            </>
          )}

          {unread && (
            <span className="ml-auto flex h-[17px] min-w-[17px] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold tabular-nums text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
