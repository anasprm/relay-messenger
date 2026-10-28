'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  FileText,
  Ghost,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Send,
  ShieldCheck,
  Smile,
  Video,
  X,
} from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import { errorMessage } from '@/lib/AuthProvider';
import { mediaUrl, uploadAttachment } from '@/lib/api';
import { clearDraft, readDraft, writeDraft } from '@/lib/drafts';
import { formatBytes, formatDuration } from '@/lib/format';
import { useToast } from '@/lib/ToastProvider';
import { cn } from '@/lib/utils';
import type { Attachment, SendMessagePayload } from '@/lib/types';
import { VideoRecorder } from './VideoRecorder';
import { VoiceRecorder } from './VoiceRecorder';

const MAX_BYTES = 30 * 1024 * 1024;

interface ComposerProps {
  conversationId: string;
  draftOwnerId: string;
  disabled?: boolean;
  vanish: boolean;
  anonymity: boolean;
  onSend: (payload: SendMessagePayload) => Promise<boolean>;
  onTypingChange: (typing: boolean) => void;
  onDraftChange?: (conversationId: string, text: string) => void;
}

export function Composer({
  conversationId,
  draftOwnerId,
  disabled = false,
  vanish,
  anonymity,
  onSend,
  onTypingChange,
  onDraftChange,
}: ComposerProps) {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    setText(readDraft(draftOwnerId, conversationId));
    setAttachment(null);
    setSendError(null);
  }, [conversationId, draftOwnerId]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }, [text]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      writeDraft(draftOwnerId, conversationId, text);
      onDraftChange?.(conversationId, text);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [conversationId, draftOwnerId, onDraftChange, text]);

  useEffect(() => {
    if (!text.trim()) {
      onTypingChange(false);
      return;
    }
    onTypingChange(true);
    const timer = window.setTimeout(() => onTypingChange(false), 1800);
    return () => window.clearTimeout(timer);
  }, [onTypingChange, text]);

  useEffect(() => {
    return () => onTypingChange(false);
  }, [onTypingChange]);

  useEffect(() => {
    if (!emojiOpen && !attachOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) {
        setEmojiOpen(false);
        setAttachOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEmojiOpen(false);
        setAttachOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [attachOpen, emojiOpen]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast('Files are limited to 30 MB.', 'error');
      return;
    }

    setUploading(true);
    setProgress(0);
    setAttachment(null);
    setSendError(null);

    try {
      const uploaded = await uploadAttachment(file, { filename: file.name }, setProgress);
      setAttachment(uploaded);
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  async function dispatch(
    payload: SendMessagePayload,
    options: { clearComposer: boolean },
  ): Promise<boolean> {
    if (disabled || sendingRef.current) return false;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);

    try {
      const ok = await onSend(payload);
      if (ok) {
        if (options.clearComposer) {
          setText('');
          setAttachment(null);
          clearDraft(draftOwnerId, conversationId);
          onDraftChange?.(conversationId, '');
        }
        onTypingChange(false);
        textareaRef.current?.focus();
      } else {
        setSendError('Message was not sent. Check your connection and try again.');
      }
      return ok;
    } catch (caught) {
      setSendError(errorMessage(caught));
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function sendUploadedBlob(
    blob: Blob,
    filename: string,
    kind: 'audio' | 'video',
    duration: number,
    dimensions?: { width: number; height: number },
  ): Promise<boolean> {
    if (sendingRef.current) return false;
    setUploading(true);
    setProgress(0);
    setSendError(null);

    try {
      const uploaded = await uploadAttachment(
        blob,
        {
          filename,
          contentType: kind === 'audio' ? 'audio/webm' : 'video/webm',
          duration,
          width: dimensions?.width,
          height: dimensions?.height,
        },
        setProgress,
      );
      const ok = await dispatch({ kind, attachment: uploaded, text: '' }, { clearComposer: false });
      if (!ok) return false;
      if (kind === 'audio') setVoiceOpen(false);
      if (kind === 'video') setVideoOpen(false);
      return true;
    } catch (caught) {
      setSendError(errorMessage(caught));
      toast(errorMessage(caught), 'error');
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (disabled || uploading || sendingRef.current) return;
    const trimmed = text.trim();
    if (!trimmed && !attachment) return;

    await dispatch(
      {
        text: trimmed,
        kind: attachment?.kind || 'text',
        attachment: attachment || undefined,
      },
      { clearComposer: true },
    );
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  function updateText(next: string) {
    setText(next);
    writeDraft(draftOwnerId, conversationId, next);
    onDraftChange?.(conversationId, next);
  }

  function insertEmoji(emoji: string) {
    const element = textareaRef.current;
    const start = element?.selectionStart ?? text.length;
    const end = element?.selectionEnd ?? start;
    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    updateText(next);
    window.requestAnimationFrame(() => {
      const field = textareaRef.current;
      if (!field) return;
      field.focus();
      const caret = start + emoji.length;
      field.setSelectionRange(caret, caret);
    });
  }

  const canSend = !disabled && !uploading && !sending && (text.trim().length > 0 || !!attachment);
  const showSend = canSend || sending;

  if (voiceOpen) {
    return (
      <div className="shrink-0 border-t border-line bg-panel px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
        <div className="mx-auto max-w-5xl">
          <VoiceRecorder
            onCancel={() => setVoiceOpen(false)}
            onSend={(blob, duration) =>
              void sendUploadedBlob(blob, `voice-note-${Date.now()}.webm`, 'audio', duration)
            }
            busy={uploading || sending}
          />
          {uploading && (
            <div className="mb-1 mt-2 flex items-center gap-2 text-[10px] text-muted">
              <Loader2 size={11} className="animate-spin text-accent" />
              Uploading voice note · {progress}%
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-line bg-panel px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
      <VideoRecorder
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        onSend={(blob, duration, width, height) =>
          void sendUploadedBlob(blob, `video-note-${Date.now()}.webm`, 'video', duration, {
            width,
            height,
          })
        }
        busy={uploading || sending}
      />

      <div
        className="mx-auto max-w-5xl"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          void pickFile(file);
        }}
      >
        {sendError && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/5 px-3 py-2 text-[11px] text-danger">
            <AlertCircle size={14} className="shrink-0" />
            <span className="min-w-0 flex-1 leading-snug">{sendError}</span>
            <button
              type="button"
              onClick={() => void submit()}
              className="shrink-0 rounded-full border border-danger/30 px-2 py-0.5 text-[10px] font-semibold transition-colors hover:bg-danger/10"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => setSendError(null)}
              className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-danger/10"
              aria-label="Dismiss send error"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {(uploading || attachment) && (
          <div className="mb-2 space-y-2">
            {uploading && (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 px-3 py-2">
                <Loader2 size={14} className="animate-spin text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-[10px] font-medium text-muted">
                    <span>Uploading attachment…</span>
                    <span className="tabular-nums">{progress}%</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-200"
                      style={{ width: `${Math.max(4, progress)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {attachment && (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-2">
                {attachment.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl(attachment.url)}
                    alt={attachment.name}
                    className="h-11 w-11 rounded-lg border border-line object-cover"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    {attachment.kind === 'audio' ? (
                      <Mic size={16} />
                    ) : attachment.kind === 'video' ? (
                      <Video size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-medium text-ink">{attachment.name}</p>
                  <p className="text-[10px] text-faint">
                    {formatBytes(attachment.size)}
                    {attachment.duration ? ` · ${formatDuration(attachment.duration)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="rounded-full p-1.5 text-faint transition-colors hover:bg-panel hover:text-ink"
                  aria-label="Remove attachment"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-1.5 sm:gap-2">
          <div
            ref={toolsRef}
            className={cn(
              'relative flex min-w-0 flex-1 items-end rounded-[26px] border border-transparent bg-panel-2 px-1 py-1 transition-colors focus-within:border-accent/30 focus-within:bg-panel',
              dragging && 'border-accent bg-accent-soft/60',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => void pickFile(event.target.files?.[0])}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void pickFile(event.target.files?.[0])}
            />

            <button
              type="button"
              onClick={() => {
                setEmojiOpen((open) => !open);
                setAttachOpen(false);
              }}
              disabled={disabled}
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink disabled:opacity-40',
                emojiOpen && 'bg-panel text-accent',
              )}
              aria-label="Choose an emoji"
              aria-expanded={emojiOpen}
              title="Emoji"
            >
              <Smile size={19} />
            </button>

            {emojiOpen && (
              <EmojiPicker
                align="left"
                onSelect={insertEmoji}
                onClose={() => setEmojiOpen(false)}
              />
            )}

            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              disabled={disabled}
              onChange={(event) => {
                updateText(event.target.value);
                setSendError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                disabled
                  ? 'Select a conversation to start messaging'
                  : vanish
                    ? 'Vanish mode — this message disappears when you leave…'
                    : 'Type a message'
              }
              className="max-h-[140px] min-h-[36px] flex-1 resize-none bg-transparent px-1.5 py-2 text-[14px] leading-relaxed text-ink placeholder:text-faint focus:outline-none disabled:cursor-not-allowed"
            />

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setAttachOpen((open) => !open);
                  setEmojiOpen(false);
                }}
                disabled={disabled || uploading}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel hover:text-ink disabled:opacity-40',
                  attachOpen && 'bg-panel text-accent',
                )}
                aria-label="Attach a file"
                aria-expanded={attachOpen}
                title="Attach (max 30 MB)"
              >
                <Paperclip size={19} />
              </button>

              {attachOpen && (
                <div
                  role="menu"
                  aria-label="Attach"
                  className="absolute bottom-full right-0 z-50 mb-2 w-48 overflow-hidden rounded-xl border border-line bg-elevated p-1 shadow-[0_18px_50px_-18px_rgba(15,23,42,0.5)] animate-pop-in"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAttachOpen(false);
                      imageInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-ink transition-colors hover:bg-panel-2"
                  >
                    <ImageIcon size={16} className="text-accent" />
                    Photo
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAttachOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-ink transition-colors hover:bg-panel-2"
                  >
                    <FileText size={16} className="text-muted" />
                    Document
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAttachOpen(false);
                      setVideoOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-ink transition-colors hover:bg-panel-2"
                  >
                    <Video size={16} className="text-muted" />
                    Video note
                  </button>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (showSend) void submit();
              else setVoiceOpen(true);
            }}
            disabled={disabled || uploading || (showSend && !canSend)}
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all',
              showSend
                ? 'bg-accent text-accent-ink shadow-sm hover:bg-accent-hover'
                : 'bg-panel-2 text-muted hover:bg-accent hover:text-accent-ink',
              (disabled || uploading) && 'opacity-40',
            )}
            aria-label={showSend ? 'Send message' : 'Record a voice message'}
            title={showSend ? 'Send (Enter)' : 'Voice note'}
          >
            {sending || uploading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : showSend ? (
              <Send size={18} />
            ) : (
              <Mic size={19} />
            )}
          </button>
        </div>

        <div className="mt-1 flex min-h-[16px] items-center justify-between gap-3 px-1.5 text-[9.5px] text-faint">
          <div className="flex min-w-0 items-center gap-2">
            {anonymity && (
              <span className="flex items-center gap-1 font-medium text-accent">
                <ShieldCheck size={10} />
                Anonymous
              </span>
            )}
            {vanish && (
              <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                <Ghost size={10} />
                Vanish
              </span>
            )}
            {!anonymity && !vanish && (
              <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
            )}
          </div>
          <span className="hidden shrink-0 tabular-nums sm:inline">
            {text.trim().length > 0 ? `${text.trim().length} chars` : 'Relay'}
          </span>
        </div>
      </div>
    </div>
  );
}
