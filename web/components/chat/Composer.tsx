'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Send,
  ShieldCheck,
  Video,
  X,
} from 'lucide-react';
import { errorMessage } from '@/lib/AuthProvider';
import { mediaUrl, uploadAttachment } from '@/lib/api';
import { formatBytes, formatDuration } from '@/lib/format';
import { useToast } from '@/lib/ToastProvider';
import { cn } from '@/lib/utils';
import type { Attachment, SendMessagePayload } from '@/lib/types';
import { VideoRecorder } from './VideoRecorder';
import { VoiceRecorder } from './VoiceRecorder';

const MAX_BYTES = 30 * 1024 * 1024;

interface ComposerProps {
  disabled?: boolean;
  vanish: boolean;
  anonymity: boolean;
  onSend: (payload: SendMessagePayload) => Promise<boolean>;
  onTypingChange: (typing: boolean) => void;
}

export function Composer({
  disabled = false,
  vanish,
  anonymity,
  onSend,
  onTypingChange,
}: ComposerProps) {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }, [text]);

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

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast('Files are limited to 30 MB.', 'error');
      return;
    }

    setUploading(true);
    setProgress(0);
    setAttachment(null);

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

  async function sendUploadedBlob(
    blob: Blob,
    filename: string,
    kind: 'audio' | 'video',
    duration: number,
    dimensions?: { width: number; height: number },
  ): Promise<boolean> {
    setUploading(true);
    setProgress(0);
    try {
      const uploaded = await uploadAttachment(
        blob,
        {
          filename,
          duration,
          width: dimensions?.width,
          height: dimensions?.height,
        },
        setProgress,
      );
      const ok = await onSend({ kind, attachment: uploaded, text: '' });
      if (!ok) return false;
      if (kind === 'audio') setVoiceOpen(false);
      if (kind === 'video') setVideoOpen(false);
      return true;
    } catch (caught) {
      toast(errorMessage(caught), 'error');
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (disabled || uploading) return;
    const trimmed = text.trim();
    if (!trimmed && !attachment) return;

    if (voiceOpen) return;
    const ok = await onSend({
      text: trimmed,
      kind: attachment?.kind || 'text',
      attachment: attachment || undefined,
    });

    if (ok) {
      setText('');
      setAttachment(null);
      onTypingChange(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  const canSend = !disabled && !uploading && (text.trim().length > 0 || !!attachment);

  if (voiceOpen) {
    return (
      <div className="border-t border-line bg-panel px-4 py-2.5 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <VoiceRecorder
            onCancel={() => setVoiceOpen(false)}
            onSend={(blob, duration) =>
              void sendUploadedBlob(blob, `voice-note-${Date.now()}.webm`, 'audio', duration)
            }
            busy={uploading}
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
    <div className="border-t border-line bg-panel px-3 py-3 sm:px-6">
      <VideoRecorder
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        onSend={(blob, duration, width, height) =>
          void sendUploadedBlob(blob, `video-note-${Date.now()}.webm`, 'video', duration, {
            width,
            height,
          })
        }
        busy={uploading}
      />

      <div
        className="mx-auto max-w-4xl"
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
                  className="rounded-lg p-1.5 text-faint transition-colors hover:bg-panel hover:text-ink"
                  aria-label="Remove attachment"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        <div
          className={cn(
            'rounded-2xl border bg-panel-2 transition-colors focus-within:border-accent/60 focus-within:bg-panel focus-within:ring-4 focus-within:ring-accent/10',
            dragging ? 'border-accent bg-accent-soft/50' : 'border-line',
          )}
        >
          <div className="flex items-end gap-1.5 px-2 py-2 sm:px-3">
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

            <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || uploading}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel hover:text-ink disabled:opacity-40"
                aria-label="Attach a file"
                title="Attach file (max 30 MB)"
              >
                <Paperclip size={17} />
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={disabled || uploading}
                className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel hover:text-ink disabled:opacity-40 sm:flex"
                aria-label="Attach an image"
                title="Attach image"
              >
                <ImageIcon size={17} />
              </button>
            </div>

            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              disabled={disabled}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                disabled
                  ? 'Select a conversation to start messaging'
                  : vanish
                    ? 'Vanish mode — this message disappears when you leave…'
                    : 'Write a message…'
              }
              className="max-h-[140px] min-h-[36px] flex-1 resize-none bg-transparent px-1.5 py-2 text-[13.5px] leading-relaxed text-ink placeholder:text-faint focus:outline-none disabled:cursor-not-allowed"
            />

            <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
              <button
                type="button"
                onClick={() => setVoiceOpen(true)}
                disabled={disabled || uploading}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel hover:text-ink disabled:opacity-40"
                aria-label="Record a voice message"
                title="Voice note"
              >
                <Mic size={17} />
              </button>
              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                disabled={disabled || uploading}
                className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel hover:text-ink disabled:opacity-40 sm:flex"
                aria-label="Record a video message"
                title="Video note"
              >
                <Video size={17} />
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canSend}
                className={cn(
                  'ml-1 flex h-8 w-8 items-center justify-center rounded-lg transition-all',
                  canSend
                    ? 'bg-accent text-white shadow-sm hover:bg-accent-hover'
                    : 'bg-line text-faint',
                )}
                aria-label="Send message"
                title="Send (Enter)"
              >
                {uploading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line/70 px-3 py-1.5">
            <div className="flex min-w-0 items-center gap-2 text-[9.5px] text-faint">
              {anonymity ? (
                <span className="flex items-center gap-1 font-medium text-accent">
                  <ShieldCheck size={10} />
                  Sending anonymously
                </span>
              ) : (
                <span className="hidden sm:inline">
                  Enter to send · Shift + Enter for a new line
                </span>
              )}
              {anonymity && (
                <span className="hidden truncate sm:inline">· identity masked on delivery</span>
              )}
            </div>
            <span className="shrink-0 text-[9.5px] text-faint">
              {text.trim().length > 0 ? `${text.trim().length} chars` : 'Relay'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
