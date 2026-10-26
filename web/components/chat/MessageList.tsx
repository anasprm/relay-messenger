'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Lock, MessagesSquare } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { mediaUrl } from '@/lib/api';
import {
  formatBytes,
  formatDayLabel,
  isSameDay,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Attachment, Message, User } from '@/lib/types';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  conversationId: string | null;
  messages: Message[];
  me: User;
  other: User | null;
  loading: boolean;
  typing: boolean;
  onReact: (messageId: string, emoji: string) => void;
}

function MessageSkeleton({ mine }: { mine: boolean }) {
  return (
    <div className={cn('flex w-full gap-2.5', mine ? 'justify-end' : 'justify-start')}>
      {!mine && <div className="skeleton h-8 w-8 rounded-full" />}
      <div className={cn('flex flex-col gap-2', mine ? 'items-end' : 'items-start')}>
        <div className={cn('skeleton h-11 rounded-2xl', mine ? 'w-56' : 'w-64')} />
        <div className={cn('skeleton h-9 rounded-2xl', mine ? 'w-40' : 'w-48')} />
      </div>
    </div>
  );
}

export function MessageList({
  conversationId,
  messages,
  me,
  other,
  loading,
  typing,
  onReact,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  useEffect(() => {
    stickRef.current = true;
  }, [conversationId]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (!stickRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [loading, messages.length, typing]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickRef.current = distance < 160;
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
        const groupStart =
          !previous || newDay || previousKey !== senderKey || gapMinutes > 5;

        return { message, newDay, groupStart };
      }),
    [messages],
  );

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="scrollbar-thin relative flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-7"
    >
      {loading ? (
        <div className="mx-auto flex max-w-4xl flex-col gap-6 py-4">
          <MessageSkeleton mine={false} />
          <MessageSkeleton mine />
          <MessageSkeleton mine={false} />
          <MessageSkeleton mine />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-panel text-accent shadow-sm">
            <MessagesSquare size={24} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-ink">
              Start the conversation{other ? ` with ${other.displayName}` : ''}
            </h3>
            <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted">
              Messages, voice notes, and files are delivered instantly over your workspace relay.
            </p>
          </div>
          <p className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[10px] text-faint">
            <Lock size={10} />
            End-to-end session channel
          </p>
        </div>
      ) : (
        <div className="mx-auto flex max-w-4xl flex-col pb-2">
          {rendered.map(({ message, newDay, groupStart }) => (
            <div key={message.id}>
              {newDay && (
                <div className="sticky top-0 z-10 flex justify-center py-3">
                  <span className="rounded-full border border-line bg-panel/90 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint shadow-sm backdrop-blur">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}
              <MessageBubble
                message={message}
                meId={me.id}
                mine={message.senderId === me.id}
                groupStart={groupStart}
                onReact={onReact}
                onOpenImage={setLightbox}
              />
            </div>
          ))}

          {typing && other && (
            <div className="mt-3 flex items-end gap-2.5">
              <Avatar user={other} size="sm" />
              <div className="flex h-9 items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-bubble px-3.5 shadow-sm">
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

      <Modal
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        title={lightbox?.name}
        description={
          lightbox
            ? `${formatBytes(lightbox.size)}${lightbox.width ? ` · ${lightbox.width}×${lightbox.height}` : ''}`
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
              className="mx-auto max-h-[70vh] w-auto rounded-lg object-contain"
            />
            <div className="flex justify-end px-1 pt-3">
              <a
                href={mediaUrl(lightbox.url)}
                download={lightbox.name}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[11px] font-medium text-ink transition-colors hover:border-line-strong"
              >
                <Download size={12} />
                Download original
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
