'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileText,
  Ghost,
  Image as ImageIcon,
  LogOut,
  Mic,
  Phone,
  Pin,
  ShieldCheck,
  Star,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { Avatar, GroupAvatar } from '@/components/ui/Avatar';
import { mediaUrl } from '@/lib/api';
import { conversationName, isGroupConversation, onlineMemberCount } from '@/lib/conversations';
import { formatBytes, formatDuration, presenceText } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Attachment, Conversation, Message } from '@/lib/types';

interface ContactPanelProps {
  conversation: Conversation;
  messages: Message[];
  meId: string;
  online: boolean;
  onlineIds: Set<string>;
  typing: boolean;
  favorite: boolean;
  pinned: boolean;
  className?: string;
  onClose: () => void;
  onStartAudio: () => void;
  onStartVideo: () => void;
  onToggleAnonymity: () => void;
  onToggleVanish: () => void;
  onToggleFavorite: () => void;
  onTogglePin: () => void;
  onAddMember: (username: string) => Promise<string | null>;
  onRemoveMember: (userId: string) => Promise<void>;
  onLeaveGroup: () => Promise<void>;
}

function ToggleRow({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
  tone = 'accent',
}: {
  icon: typeof ShieldCheck;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  tone?: 'accent' | 'amber';
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-panel-2"
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          tone === 'amber'
            ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300'
            : 'bg-accent-soft text-accent',
        )}
      >
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted">{description}</span>
      </span>
      <span
        className={cn(
          'mt-1 flex h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors',
          checked ? (tone === 'amber' ? 'bg-amber-500' : 'bg-accent') : 'bg-line-strong',
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            'block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </button>
  );
}

function attachmentIcon(attachment: Attachment) {
  if (attachment.kind === 'image' || attachment.mime.startsWith('image/')) return ImageIcon;
  if (attachment.kind === 'audio' || attachment.mime.startsWith('audio/')) return Mic;
  if (attachment.kind === 'video' || attachment.mime.startsWith('video/')) return Video;
  return FileText;
}

export function ContactPanel({
  conversation,
  messages,
  meId,
  online,
  onlineIds,
  typing,
  favorite,
  pinned,
  className,
  onClose,
  onStartAudio,
  onStartVideo,
  onToggleAnonymity,
  onToggleVanish,
  onToggleFavorite,
  onTogglePin,
  onAddMember,
  onRemoveMember,
  onLeaveGroup,
}: ContactPanelProps) {
  const { other, modes } = conversation;
  const group = isGroupConversation(conversation);
  const name = conversationName(conversation);
  const peer = other ? { ...other, online } : null;
  const isCreator = group && conversation.createdBy === meId;
  const onlineCount = group ? onlineMemberCount(conversation, onlineIds) : 0;
  const closeRef = useRef<HTMLButtonElement>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    const username = memberQuery.trim().toLowerCase();
    if (!username || memberBusy) return;

    setMemberBusy(true);
    setMemberError(null);
    const error = await onAddMember(username);
    if (error) setMemberError(error);
    else setMemberQuery('');
    setMemberBusy(false);
  }

  async function leaveGroup() {
    if (leaveBusy) return;
    setLeaveBusy(true);
    await onLeaveGroup();
    setLeaveBusy(false);
  }

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const isDesktop = window.matchMedia('(min-width: 1280px)').matches;
    const previous = document.body.style.overflow;
    if (!isDesktop) document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const attachments = useMemo(
    () =>
      messages
        .filter((message): message is Message & { attachment: Attachment } => !!message.attachment)
        .map((message) => message.attachment),
    [messages],
  );

  const images = attachments.filter(
    (attachment) => attachment.kind === 'image' || attachment.mime.startsWith('image/'),
  );
  const documents = attachments.filter(
    (attachment) =>
      !images.includes(attachment) &&
      !(attachment.kind === 'audio' || attachment.mime.startsWith('audio/')) &&
      !(attachment.kind === 'video' || attachment.mime.startsWith('video/')),
  );
  const audioVideo = attachments.filter(
    (attachment) =>
      attachment.kind === 'audio' ||
      attachment.mime.startsWith('audio/') ||
      attachment.kind === 'video' ||
      attachment.mime.startsWith('video/'),
  );

  return (
    <aside
      aria-label="Conversation details"
      className={cn(
        'flex h-full min-h-0 flex-col border-l border-line bg-panel drawer-in',
        className,
      )}
    >
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="text-[14px] font-semibold text-ink">
          {group ? 'Group info' : 'Contact info'}
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-ink"
          aria-label="Close conversation details"
        >
          <X size={18} />
        </button>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center px-5 pb-5 pt-7 text-center">
          {group || !peer ? (
            <GroupAvatar size="2xl" label={name} />
          ) : (
            <Avatar user={peer} size="2xl" online={online} />
          )}
          <h3 className="mt-3 max-w-full truncate text-[17px] font-semibold tracking-[-0.02em] text-ink">
            {name}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-faint">
            {group ? `${conversation.memberCount} members` : `@${peer?.username || ''}`}
          </p>
          <p
            className={cn(
              'mt-1.5 text-[11.5px]',
              typing ? 'text-accent' : online ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted',
            )}
          >
            {typing
              ? 'typing…'
              : group
                ? `${onlineCount} online now`
                : peer
                  ? presenceText(peer)
                  : 'Offline'}
          </p>

          {!group && (
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={onStartAudio}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-[11.5px] font-semibold text-accent transition-colors hover:bg-accent/15"
              >
                <Phone size={14} />
                Audio
              </button>
              <button
                type="button"
                onClick={onStartVideo}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-[11.5px] font-semibold text-accent transition-colors hover:bg-accent/15"
              >
                <Video size={15} />
                Video
              </button>
            </div>
          )}
        </div>

        {group && (
          <section className="border-t border-line px-2 py-3" aria-labelledby="members-heading">
            <h4
              id="members-heading"
              className="px-2.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint"
            >
              Members · {conversation.memberCount}
            </h4>

            <div className="space-y-0.5">
              {conversation.participants.map((member) => {
                const isMe = member.id === meId;
                const removable = isCreator && !isMe;
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-panel-2"
                  >
                    <Avatar
                      user={member}
                      size="sm"
                      online={onlineIds.has(member.id) || member.online}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-ink">
                        {member.displayName}
                        {isMe && <span className="ml-1 text-[10px] font-normal text-faint">(you)</span>}
                      </span>
                      <span className="block truncate text-[10px] text-faint">
                        @{member.username}
                        {member.id === conversation.createdBy ? ' · creator' : ''}
                      </span>
                    </span>
                    {removable && (
                      <button
                        type="button"
                        onClick={() => void onRemoveMember(member.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                        aria-label={`Remove ${member.displayName} from the group`}
                        title="Remove from group"
                      >
                        <UserMinus size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {isCreator && (
              <form onSubmit={(event) => void addMember(event)} className="mt-2 px-2.5">
                <label htmlFor="group-add-member" className="sr-only">
                  Add a member by username
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="relative min-w-0 flex-1">
                    <UserPlus
                      size={13}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
                    />
                    <input
                      id="group-add-member"
                      value={memberQuery}
                      onChange={(event) => {
                        setMemberQuery(event.target.value);
                        setMemberError(null);
                      }}
                      placeholder="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="h-8 w-full rounded-lg border border-line bg-panel-2 pl-8 pr-2 text-[11.5px] text-ink placeholder:text-faint transition-colors focus:border-accent/60 focus:bg-panel focus:outline-none focus:ring-2 focus:ring-accent/10"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={memberBusy || !memberQuery.trim()}
                    className="h-8 shrink-0 rounded-lg bg-accent px-3 text-[11px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                {memberError && (
                  <p role="alert" className="mt-1.5 text-[10.5px] font-medium text-danger">
                    {memberError}
                  </p>
                )}
              </form>
            )}
          </section>
        )}

        <section className="border-t border-line px-2 py-3" aria-labelledby="privacy-heading">
          <h4
            id="privacy-heading"
            className="px-2.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint"
          >
            Privacy for this thread
          </h4>
          <ToggleRow
            icon={ShieldCheck}
            label="Anonymity"
            description="Replace your name and profile with “Anonymous Operator” on delivery."
            checked={modes.anonymity}
            onChange={onToggleAnonymity}
          />
          <ToggleRow
            icon={Ghost}
            label="Vanish mode"
            description="Messages sent now are permanently wiped when you leave this thread."
            checked={modes.vanish}
            onChange={onToggleVanish}
            tone="amber"
          />
        </section>

        <section className="border-t border-line px-2 py-3" aria-labelledby="personal-heading">
          <h4
            id="personal-heading"
            className="px-2.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint"
          >
            Saved on this device
          </h4>
          <button
            type="button"
            role="switch"
            aria-checked={favorite}
            onClick={onToggleFavorite}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-panel-2"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel-2 text-muted">
              <Star
                size={15}
                className={favorite ? 'fill-amber-400 text-amber-400' : undefined}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-ink">Favorite</span>
              <span className="mt-0.5 block text-[10.5px] text-muted">
                Keep this conversation in the Favorites filter.
              </span>
            </span>
            <span
              className={cn(
                'flex h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors',
                favorite ? 'bg-accent' : 'bg-line-strong',
              )}
              aria-hidden="true"
            >
              <span
                className={cn(
                  'block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  favorite && 'translate-x-4',
                )}
              />
            </span>
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={pinned}
            onClick={onTogglePin}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-panel-2"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel-2 text-muted">
              <Pin size={15} className={pinned ? 'text-accent' : undefined} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-ink">Pin to top</span>
              <span className="mt-0.5 block text-[10.5px] text-muted">
                Keep this conversation above recent activity.
              </span>
            </span>
            <span
              className={cn(
                'flex h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors',
                pinned ? 'bg-accent' : 'bg-line-strong',
              )}
              aria-hidden="true"
            >
              <span
                className={cn(
                  'block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  pinned && 'translate-x-4',
                )}
              />
            </span>
          </button>
        </section>

        <section className="border-t border-line px-4 py-4" aria-labelledby="media-heading">
          <div className="flex items-center justify-between">
            <h4
              id="media-heading"
              className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint"
            >
              Shared media
            </h4>
            <span className="text-[9.5px] tabular-nums text-faint">{attachments.length}</span>
          </div>

          {attachments.length === 0 ? (
            <p className="mt-3 rounded-xl bg-panel-2 px-3 py-4 text-center text-[11px] leading-relaxed text-muted">
              No photos, files, or voice notes in the messages loaded for this thread yet.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-1">
                  {images.slice(0, 9).map((attachment, index) => (
                    <a
                      key={`${attachment.url}-${index}`}
                      href={mediaUrl(attachment.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="group/media relative aspect-square overflow-hidden rounded-lg bg-panel-2"
                      aria-label={`Open ${attachment.name}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mediaUrl(attachment.url)}
                        alt={attachment.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover/media:scale-105"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              )}

              {audioVideo.length > 0 && (
                <div className="space-y-1">
                  {audioVideo.slice(0, 6).map((attachment, index) => {
                    const Icon = attachmentIcon(attachment);
                    return (
                      <a
                        key={`${attachment.url}-${index}`}
                        href={mediaUrl(attachment.url)}
                        target="_blank"
                        rel="noreferrer"
                        download={attachment.name}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-panel-2"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                          <Icon size={13} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-medium text-ink">
                            {attachment.name}
                          </span>
                          <span className="block text-[9.5px] text-faint">
                            {formatBytes(attachment.size)}
                            {attachment.duration ? ` · ${formatDuration(attachment.duration)}` : ''}
                          </span>
                        </span>
                        <Download size={12} className="shrink-0 text-faint" />
                      </a>
                    );
                  })}
                </div>
              )}

              {documents.length > 0 && (
                <div className="space-y-1">
                  {documents.slice(0, 6).map((attachment, index) => (
                    <a
                      key={`${attachment.url}-${index}`}
                      href={mediaUrl(attachment.url)}
                      target="_blank"
                      rel="noreferrer"
                      download={attachment.name}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-panel-2"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-panel-2 text-muted">
                        <FileText size={13} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium text-ink">
                          {attachment.name}
                        </span>
                        <span className="block text-[9.5px] text-faint">
                          {formatBytes(attachment.size)}
                        </span>
                      </span>
                      <Download size={12} className="shrink-0 text-faint" />
                    </a>
                  ))}
                </div>
              )}

              <p className="text-[9.5px] leading-relaxed text-faint">
                Shows attachments from messages loaded in this session.
              </p>
            </div>
          )}
        </section>

        {group && (
          <section className="border-t border-line px-4 py-4">
            <button
              type="button"
              onClick={() => void leaveGroup()}
              disabled={leaveBusy}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-danger/30 text-[11.5px] font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
            >
              <LogOut size={14} />
              {leaveBusy ? 'Leaving…' : 'Leave group'}
            </button>
            <p className="mt-2 text-center text-[9.5px] leading-relaxed text-faint">
              {isCreator && conversation.memberCount > 1
                ? 'Leaving hands the group to the next member.'
                : 'You will stop receiving messages from this group.'}
            </p>
          </section>
        )}
      </div>
    </aside>
  );
}
