'use client';

import { useMemo } from 'react';
import {
  Download,
  FileText,
  Flame,
  Heart,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { mediaUrl } from '@/lib/api';
import { formatBytes, formatDuration, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Attachment, Message } from '@/lib/types';
import { AudioMessage } from './AudioMessage';

interface MessageBubbleProps {
  message: Message;
  meId: string;
  mine: boolean;
  groupStart: boolean;
  onReact: (messageId: string, emoji: string) => void;
  onOpenImage: (attachment: Attachment) => void;
}

function AttachmentView({
  attachment,
  mine,
  messageId,
  onOpenImage,
}: {
  attachment: Attachment;
  mine: boolean;
  messageId: string;
  onOpenImage: (attachment: Attachment) => void;
}) {
  if (attachment.kind === 'image' || attachment.mime.startsWith('image/')) {
    return (
      <button
        type="button"
        onClick={() => onOpenImage(attachment)}
        className="group/img block overflow-hidden rounded-xl"
        aria-label={`Open image ${attachment.name}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(attachment.url)}
          alt={attachment.name}
          width={attachment.width || 960}
          height={attachment.height || 640}
          className={cn(
            'max-h-72 w-full min-w-[220px] object-cover transition-transform duration-300 group-hover/img:scale-[1.01]',
            mine ? 'border border-white/15' : 'border border-line',
          )}
          loading="lazy"
        />
      </button>
    );
  }

  if (attachment.kind === 'audio' || attachment.mime.startsWith('audio/')) {
    return <AudioMessage attachment={attachment} mine={mine} messageId={messageId} />;
  }

  if (attachment.kind === 'video' || attachment.mime.startsWith('video/')) {
    return (
      <div className="overflow-hidden rounded-xl bg-black">
        <video
          src={mediaUrl(attachment.url)}
          controls
          playsInline
          preload="metadata"
          className="max-h-72 w-full min-w-[240px] object-cover"
        />
      </div>
    );
  }

  return (
    <a
      href={mediaUrl(attachment.url)}
      download={attachment.name}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'flex min-w-[220px] items-center gap-3 rounded-xl border p-2.5 transition-colors',
        mine
          ? 'border-white/15 bg-white/10 hover:bg-white/15'
          : 'border-line bg-panel-2 hover:border-line-strong',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          mine ? 'bg-white/15 text-white' : 'bg-accent-soft text-accent',
        )}
      >
        <FileText size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[12px] font-medium',
            mine ? 'text-white' : 'text-ink',
          )}
        >
          {attachment.name}
        </span>
        <span className={cn('block text-[10px]', mine ? 'text-white/60' : 'text-faint')}>
          {formatBytes(attachment.size)}
        </span>
      </span>
      <Download size={14} className={mine ? 'text-white/70' : 'text-faint'} />
    </a>
  );
}

export function MessageBubble({
  message,
  meId,
  mine,
  groupStart,
  onReact,
  onOpenImage,
}: MessageBubbleProps) {
  const reactionSummary = useMemo(() => {
    const counts = new Map<string, number>();
    Object.values(message.reactions || {}).forEach((emoji) => {
      counts.set(emoji, (counts.get(emoji) || 0) + 1);
    });
    return [...counts.entries()];
  }, [message.reactions]);

  const myReaction = message.reactions?.[meId];
  const anonymousOther = message.anonymous && !mine;

  return (
    <div
      className={cn(
        'group/msg flex w-full gap-2.5',
        mine ? 'justify-end' : 'justify-start',
        groupStart ? 'mt-4' : 'mt-0.5',
      )}
    >
      {!mine &&
        (groupStart ? (
          <Avatar user={message.sender} size="sm" className="mt-auto" />
        ) : (
          <span className="w-8 shrink-0" />
        ))}

      <div className={cn('relative flex max-w-[min(34rem,84%)] flex-col', mine && 'items-end')}>
        {groupStart && !mine && (
          <div className="mb-1 flex items-center gap-1.5 px-1">
            <span className="text-[11px] font-semibold text-ink">
              {anonymousOther ? 'Anonymous Operator' : message.sender.displayName}
            </span>
            {message.anonymous && (
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-1.5 py-[1px] text-[8.5px] font-medium uppercase tracking-[0.1em] text-faint">
                <Shield size={8} />
                Anonymous
              </span>
            )}
          </div>
        )}

        <div
          onDoubleClick={() => onReact(message.id, '❤️')}
          title="Double-click to like"
          className={cn(
            'relative rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-sm',
            mine
              ? 'rounded-br-md bg-accent text-white'
              : 'rounded-bl-md border border-line bg-bubble text-ink',
          )}
        >
          {message.anonymous && mine && (
            <p className="mb-1.5 flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.12em] text-white/60">
              <ShieldCheck size={9} />
              Sent anonymously
            </p>
          )}

          {message.attachment && (
            <div className={cn(message.text && 'mb-2')}>
              <AttachmentView
                attachment={message.attachment}
                mine={mine}
                messageId={message.id}
                onOpenImage={onOpenImage}
              />
            </div>
          )}

          {message.text && (
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>
          )}
        </div>

        <div
          className={cn(
            'mt-1 flex min-h-[18px] flex-wrap items-center gap-1 px-0.5',
            mine ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          <span
            className={cn(
              'flex items-center gap-1 px-1 text-[9.5px] tabular-nums',
              mine ? 'text-faint' : 'text-faint',
            )}
          >
            {message.ephemeral && <Flame size={9} className="text-amber-500/80" />}
            {message.attachment?.duration && message.kind === 'video' ? (
              <span>{formatDuration(message.attachment.duration)}</span>
            ) : null}
            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          </span>

          {reactionSummary.map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(message.id, emoji)}
              className={cn(
                'flex h-[20px] items-center gap-1 rounded-full border px-1.5 text-[10px] leading-none transition-colors',
                myReaction === emoji
                  ? 'border-accent/50 bg-accent-soft text-accent'
                  : 'border-line bg-panel text-muted hover:border-line-strong',
              )}
              aria-label={`React ${emoji}`}
            >
              <span>{emoji}</span>
              <span className="tabular-nums">{count}</span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => onReact(message.id, '❤️')}
            className={cn(
              'flex h-[20px] w-[20px] items-center justify-center rounded-full border border-line bg-panel text-faint transition-all hover:border-accent/40 hover:text-accent',
              'opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100',
              myReaction === '❤️' && 'text-rose-500 opacity-100',
            )}
            aria-label="Like message"
            title="Like"
          >
            <Heart size={10} fill={myReaction === '❤️' ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </div>
  );
}
