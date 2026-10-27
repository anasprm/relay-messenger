'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Copy,
  Download,
  FileText,
  Flame,
  MoreHorizontal,
  Shield,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { mediaUrl } from '@/lib/api';
import { formatBytes, formatDuration, formatTime } from '@/lib/format';
import { useToast } from '@/lib/ToastProvider';
import { cn } from '@/lib/utils';
import type { Attachment, Message } from '@/lib/types';
import { AudioMessage } from './AudioMessage';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

interface MessageBubbleProps {
  message: Message;
  meId: string;
  mine: boolean;
  groupStart: boolean;
  searchQuery?: string;
  activeMatch?: boolean;
  onReact: (messageId: string, emoji: string) => void;
  onOpenImage: (attachment: Attachment) => void;
}

function UnavailableAttachment({
  attachment,
  mine,
  label,
}: {
  attachment: Attachment;
  mine: boolean;
  label: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-[210px] items-center gap-3 rounded-lg border p-2.5',
        mine
          ? 'border-bubble-sent-ink/15 bg-bubble-sent-ink/[0.06]'
          : 'border-line bg-panel-2',
      )}
      role="status"
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          mine ? 'bg-bubble-sent-ink/10 text-bubble-sent-ink' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
        )}
      >
        <TriangleAlert size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium">{attachment.name}</span>
        <span className={cn('block text-[10px]', mine ? 'text-bubble-sent-ink/60' : 'text-faint')}>
          {label} · no longer on the server
        </span>
      </span>
    </div>
  );
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
  const [failed, setFailed] = useState(false);

  if (attachment.kind === 'image' || attachment.mime.startsWith('image/')) {
    if (failed) {
      return <UnavailableAttachment attachment={attachment} mine={mine} label="Image unavailable" />;
    }
    return (
      <button
        type="button"
        onClick={() => onOpenImage(attachment)}
        className="group/img block w-full overflow-hidden rounded-lg"
        aria-label={`Open image ${attachment.name}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(attachment.url)}
          alt={attachment.name}
          width={attachment.width || 960}
          height={attachment.height || 640}
          className="max-h-80 w-full min-w-[190px] object-cover transition-transform duration-300 group-hover/img:scale-[1.01]"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </button>
    );
  }

  if (attachment.kind === 'audio' || attachment.mime.startsWith('audio/')) {
    return <AudioMessage attachment={attachment} mine={mine} messageId={messageId} />;
  }

  if (attachment.kind === 'video' || attachment.mime.startsWith('video/')) {
    if (failed) {
      return <UnavailableAttachment attachment={attachment} mine={mine} label="Video unavailable" />;
    }
    return (
      <div className="overflow-hidden rounded-lg bg-black">
        <video
          src={mediaUrl(attachment.url)}
          controls
          playsInline
          preload="metadata"
          className="max-h-80 w-full min-w-[220px] object-contain"
          onError={() => setFailed(true)}
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
        'flex min-w-[210px] items-center gap-3 rounded-lg border p-2.5 transition-colors',
        mine
          ? 'border-bubble-sent-ink/15 bg-bubble-sent-ink/[0.06] hover:bg-bubble-sent-ink/10'
          : 'border-line bg-panel-2 hover:border-line-strong',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          mine ? 'bg-bubble-sent-ink/10 text-bubble-sent-ink' : 'bg-accent-soft text-accent',
        )}
      >
        <FileText size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium">{attachment.name}</span>
        <span className={cn('block text-[10px]', mine ? 'text-bubble-sent-ink/60' : 'text-faint')}>
          {formatBytes(attachment.size)}
        </span>
      </span>
      <Download size={14} className={mine ? 'text-bubble-sent-ink/60' : 'text-faint'} />
    </a>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text: string, query: string, active: boolean): ReactNode {
  const needle = query.trim();
  if (!needle) return text;

  const matcher = new RegExp(`(${escapeRegExp(needle)})`, 'gi');
  const parts = text.split(matcher);
  if (parts.length <= 1) return text;

  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={`${part}-${index}`}
        className={cn(
          'rounded-[3px] px-0.5 text-inherit',
          active
            ? 'bg-accent/40 text-ink dark:bg-accent/45 dark:text-ink'
            : 'bg-amber-200/80 dark:bg-amber-400/30',
        )}
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

export function MessageBubble({
  message,
  meId,
  mine,
  groupStart,
  searchQuery = '',
  activeMatch = false,
  onReact,
  onOpenImage,
}: MessageBubbleProps) {
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const reactionSummary = useMemo(() => {
    const counts = new Map<string, number>();
    Object.values(message.reactions || {}).forEach((emoji) => {
      counts.set(emoji, (counts.get(emoji) || 0) + 1);
    });
    return [...counts.entries()];
  }, [message.reactions]);

  const myReaction = message.reactions?.[meId];
  const anonymousOther = message.anonymous && !mine;

  async function copyMessage() {
    if (!message.text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = message.text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast('Message copied to clipboard.', 'success');
    } catch {
      toast('Could not copy this message.', 'error');
    }
    setMenuOpen(false);
  }

  return (
    <div
      className={cn(
        'group/msg flex w-full gap-2',
        mine ? 'justify-end' : 'justify-start',
        groupStart ? 'mt-3' : 'mt-[3px]',
      )}
    >
      {!mine &&
        (groupStart ? (
          <Avatar user={message.sender} size="sm" className="mt-auto" />
        ) : (
          <span className="w-8 shrink-0" aria-hidden="true" />
        ))}

      <div className={cn('flex max-w-[min(34rem,86%)] flex-col sm:max-w-[min(38rem,78%)]', mine && 'items-end')}>
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
          title="Double-click to react"
          className={cn(
            'relative max-w-full text-[14px] leading-[1.45] bubble-shadow',
            message.attachment ? 'p-1.5' : 'px-2.5 py-1.5',
            mine ? 'bg-bubble-sent text-bubble-sent-ink' : 'bg-bubble text-ink',
            groupStart
              ? mine
                ? 'rounded-[10px] rounded-tr-[2px] bubble-tail-out'
                : 'rounded-[10px] rounded-tl-[2px] bubble-tail-in'
              : 'rounded-[10px]',
            activeMatch && 'ring-2 ring-accent/50 ring-offset-1 ring-offset-transparent',
          )}
        >
          {message.anonymous && mine && (
            <p
              className={cn(
                'mb-1 flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.12em]',
                'text-bubble-sent-ink/60',
                message.attachment && 'px-1 pt-1',
              )}
            >
              <ShieldCheck size={9} />
              Sent anonymously
            </p>
          )}

          {message.attachment && (
            <div className={cn(message.text && 'mb-1.5')}>
              <AttachmentView
                attachment={message.attachment}
                mine={mine}
                messageId={message.id}
                onOpenImage={onOpenImage}
              />
            </div>
          )}

          {message.text && (
            <p
              className={cn(
                'whitespace-pre-wrap break-words [overflow-wrap:anywhere]',
                message.attachment && 'px-1',
              )}
            >
              {highlightText(message.text, searchQuery, activeMatch)}
            </p>
          )}

          <div
            className={cn(
              'mt-0.5 flex items-center justify-end gap-1 text-[9.5px] tabular-nums',
              mine ? 'text-bubble-sent-ink/55' : 'text-faint',
              message.attachment && 'px-1 pb-0.5',
            )}
          >
            {message.ephemeral && <Flame size={9} className="text-amber-600/80 dark:text-amber-400/80" />}
            {message.attachment?.duration && message.kind === 'video' ? (
              <span>{formatDuration(message.attachment.duration)}</span>
            ) : null}
            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          </div>
        </div>

        <div
          className={cn(
            'mt-0.5 flex min-h-[20px] flex-wrap items-center gap-1 px-0.5',
            mine ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          {reactionSummary.map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(message.id, emoji)}
              className={cn(
                'flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10px] leading-none transition-colors',
                myReaction === emoji
                  ? 'border-accent/40 bg-accent-soft text-accent'
                  : 'border-line bg-panel text-muted hover:border-line-strong hover:text-ink',
              )}
              aria-label={`React ${emoji}`}
            >
              <span>{emoji}</span>
              <span className="tabular-nums">{count}</span>
            </button>
          ))}

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-faint transition-all hover:bg-panel-2 hover:text-ink',
                'opacity-100 sm:opacity-0 sm:group-hover/msg:opacity-100 sm:focus-visible:opacity-100',
                menuOpen && 'bg-panel-2 text-ink opacity-100',
              )}
              aria-label="Message actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Message actions"
            >
              <MoreHorizontal size={13} />
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="Message actions"
                className={cn(
                  'absolute bottom-full z-30 mb-1.5 w-max overflow-hidden rounded-xl border border-line bg-elevated p-1 shadow-[0_18px_50px_-18px_rgba(15,23,42,0.5)] animate-pop-in',
                  mine ? 'right-0' : 'left-0',
                )}
              >
                <div className="flex items-center gap-0.5">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onReact(message.id, emoji);
                        setMenuOpen(false);
                      }}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg text-[17px] leading-none transition-colors hover:bg-panel-2',
                        myReaction === emoji && 'bg-accent-soft',
                      )}
                      aria-label={`React ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                {message.text && (
                  <>
                    <div className="my-1 h-px bg-line" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void copyMessage()}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] font-medium text-ink transition-colors hover:bg-panel-2"
                    >
                      <Copy size={13} className="text-muted" />
                      Copy text
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
