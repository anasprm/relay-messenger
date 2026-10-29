'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Download, Lock, MessagesSquare, RefreshCw, TriangleAlert } from 'lucide-react';
import { Avatar, GroupAvatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { mediaUrl } from '@/lib/api';
import { formatBytes, formatDayLabel, isSameDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Attachment, Message, MessageKind, User } from '@/lib/types';
import { MessageBubble } from './MessageBubble';

interface ViewOnceResult {
  url: string;
  name: string;
  mime: string;
  kind: MessageKind;
}

interface MessageListProps {
  conversationId: string | null;
  messages: Message[];
  me: User;
  other: User | null;
  isGroup?: boolean;
  loading: boolean;
  typing: boolean;
  error?: string | null;
  searchQuery?: string;
  activeMatchId?: string | null;
  onRetry?: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onViewOnce: (message: Message) => Promise<ViewOnceResult | null>;
  onUnsend: (message: Message) => void;
}

function MessageSkeleton({ mine }: { mine: boolean }) {
  return (
    <div className={cn('flex w-full gap-2.5', mine ? 'justify-end' : 'justify-start')}>
      {!mine && <div className="skeleton h-8 w-8 rounded-full" />}
      <div className={cn('flex flex-col gap-2', mine ? 'items-end' : 'items-start')}>
        <div className={cn('skeleton h-10 rounded-2xl', mine ? 'w-52' : 'w-64')} />
        <div className={cn('skeleton h-8 rounded-2xl', mine ? 'w-36' : 'w-44')} />
      </div>
    </div>
  );
}

export function MessageList({
  conversationId,
  messages,
  me,
  other,
  isGroup = false,
  loading,
  typing,
  error,
  searchQuery = '',
  activeMatchId,
  onRetry,
  onReact,
  onViewOnce,
  onUnsend,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const lastCountRef = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const [lightboxOnce, setLightboxOnce] = useState(false);

  async function openViewOnce(message: Message) {
    const opened = await onViewOnce(message);
    if (!opened) return;
    setLightbox({
      url: opened.url,
      name: opened.name,
      mime: opened.mime,
      size: 0,
      kind: opened.kind,
    });
    setLightboxOnce(true);
  }

  function openImage(attachment: Attachment) {
    setLightboxOnce(false);
    setLightbox(attachment);
  }

  useEffect(() => {
    stickRef.current = true;
    setAtBottom(true);
    setUnseen(0);
    lastCountRef.current = 0;
  }, [conversationId]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const grew = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;

    if (stickRef.current) {
      element.scrollTop = element.scrollHeight;
      setAtBottom(true);
      setUnseen(0);
    } else if (grew) {
      const latest = messages[messages.length - 1];
      if (latest && latest.senderId !== me.id) {
        setUnseen((count) => count + 1);
      }
    }
  }, [loading, me.id, messages, typing]);

  useEffect(() => {
    if (!activeMatchId) return;
    const element = scrollRef.current;
    if (!element) return;
    const target = element.querySelector<HTMLElement>(`[data-message-id="${activeMatchId}"]`);
    if (!target) return;
    stickRef.current = false;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeMatchId]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const nearBottom = distance < 120;
    stickRef.current = nearBottom;
    setAtBottom(nearBottom);
    if (nearBottom) setUnseen(0);
  }

  function jumpToLatest() {
    const element = scrollRef.current;
    if (!element) return;
    stickRef.current = true;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    setAtBottom(true);
    setUnseen(0);
  }

  const rendered = useMemo(
    () =>
      messages.map((message, index) => {
        const previous = messages[index - 1];
        const newDay = !previous || !isSameDay(previous.createdAt, message.createdAt);
        const senderKey = message.anonymous ? 'anonymous' : message.senderId || 'anonymous';
        const previousKey = previous
          ? previous.anonymous
            ? 'anonymous'
            : previous.senderId || 'anonymous'
          : null;
        const gapMinutes = previous
          ? (new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime()) / 60_000
          : Infinity;
        const groupStart = !previous || newDay || previousKey !== senderKey || gapMinutes > 5;

        return { message, newDay, groupStart };
      }),
    [messages],
  );

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Message history"
        className="chat-wallpaper scrollbar-thin h-full overflow-y-auto overflow-x-hidden"
      >
        {loading ? (
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center gap-6 px-4 py-8 sm:px-6">
            <MessageSkeleton mine={false} />
            <MessageSkeleton mine />
            <MessageSkeleton mine={false} />
            <MessageSkeleton mine />
          </div>
        ) : error ? (
          <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-panel text-danger shadow-sm">
              <TriangleAlert size={22} />
            </span>
            <h3 className="text-[13.5px] font-semibold text-ink">Could not load this conversation</h3>
            <p className="max-w-sm text-[11.5px] leading-relaxed text-muted">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-[11px] font-medium text-ink transition-colors hover:border-accent/40 hover:text-accent"
              >
                <RefreshCw size={12} />
                Try again
              </button>
            )}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center gap-3.5 px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-panel text-accent shadow-sm">
              <MessagesSquare size={24} />
            </span>
            <div>
              <h3 className="text-[14px] font-semibold text-ink">
                {other
                  ? `Say hello to ${other.displayName}`
                  : isGroup
                    ? 'Start the group conversation'
                    : 'No messages yet'}
              </h3>
              <p className="mx-auto mt-1.5 max-w-xs text-[11.5px] leading-relaxed text-muted">
                {isGroup
                  ? 'Everyone in this group sees these messages instantly over your workspace relay.'
                  : 'Messages, voice notes, and files are delivered instantly over your workspace relay.'}
              </p>
            </div>
            <p className="flex items-center gap-1.5 rounded-full border border-line bg-panel/80 px-3 py-1 text-[10px] text-faint backdrop-blur">
              <Lock size={10} />
              Private to the people in this thread
            </p>
          </div>
        ) : (
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-end px-2 pb-2 pt-4 sm:px-6">
            {rendered.map(({ message, newDay, groupStart }) => (
              <div key={message.id} data-message-id={message.id}>
                {newDay && (
                  <div className="sticky top-2 z-10 flex justify-center py-2">
                    <span className="rounded-md bg-panel/90 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted shadow-sm backdrop-blur">
                      {formatDayLabel(message.createdAt)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  meId={me.id}
                  mine={message.senderId === me.id}
                  groupStart={groupStart}
                  searchQuery={searchQuery}
                  activeMatch={message.id === activeMatchId}
                  onReact={onReact}
                  onOpenImage={openImage}
                  onViewOnce={(target) => void openViewOnce(target)}
                  onUnsend={onUnsend}
                />
              </div>
            ))}

            {typing && (other || isGroup) && (
              <div className="mt-3 flex items-end gap-2">
                {other ? <Avatar user={other} size="sm" /> : <GroupAvatar size="sm" />}
                <div className="flex h-9 items-center gap-1 rounded-[10px] rounded-tl-[2px] bg-bubble px-3.5 shadow-sm">
                  <span className="h-1 w-1 animate-blink rounded-full bg-faint" />
                  <span
                    className="h-1 w-1 animate-blink rounded-full bg-faint"
                    style={{ animationDelay: '0.18s' }}
                  />
                  <span
                    className="h-1 w-1 animate-blink rounded-full bg-faint"
                    style={{ animationDelay: '0.36s' }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!loading && !error && messages.length > 0 && !atBottom && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-4 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-panel text-muted shadow-[0_10px_30px_-10px_rgba(15,23,42,0.4)] transition-colors hover:text-ink sm:right-5"
          aria-label="Jump to latest messages"
          title="Jump to latest"
        >
          <ArrowDown size={17} />
          {unseen > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold tabular-nums text-accent-ink">
              {unseen > 9 ? '9+' : unseen}
            </span>
          )}
        </button>
      )}

      <Modal
        open={!!lightbox}
        onClose={() => {
          setLightbox(null);
          setLightboxOnce(false);
        }}
        title={lightbox?.name}
        description={
          lightbox
            ? lightboxOnce
              ? 'View once · this media is removed after you close it.'
              : `${formatBytes(lightbox.size)}${lightbox.width ? ` · ${lightbox.width}×${lightbox.height}` : ''}`
            : undefined
        }
        className="max-w-3xl"
      >
        {lightbox && (
          <div className="bg-black/5 p-3 dark:bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl(lightbox.url)}
              alt={lightbox.name}
              className="mx-auto max-h-[70dvh] w-auto rounded-lg object-contain"
            />
            <div className="flex items-center justify-between gap-3 px-1 pt-3">
              <span className="text-[10px] text-faint">
                {lightboxOnce
                  ? 'This is the only time this media can be opened.'
                  : 'Media stays available in this chat.'}
              </span>
              {lightboxOnce ? (
                <button
                  type="button"
                  onClick={() => {
                    setLightbox(null);
                    setLightboxOnce(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
                >
                  Close
                </button>
              ) : (
                <a
                  href={mediaUrl(lightbox.url)}
                  download={lightbox.name}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-[11px] font-medium text-ink transition-colors hover:border-line-strong"
                >
                  <Download size={12} />
                  Download original
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
