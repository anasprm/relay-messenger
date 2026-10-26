'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MicOff, Send, Square, X } from 'lucide-react';
import { AudioMessage } from './AudioMessage';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/lib/types';

interface VoiceRecorderProps {
  onCancel: () => void;
  onSend: (blob: Blob, duration: number) => void;
  busy?: boolean;
  maxSeconds?: number;
}

type Status = 'requesting' | 'recording' | 'stopped' | 'error';

export function VoiceRecorder({
  onCancel,
  onSend,
  busy = false,
  maxSeconds = 120,
}: VoiceRecorderProps) {
  const [status, setStatus] = useState<Status>('requesting');
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 28 }, () => 0.12));
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const blobUrlRef = useRef<string | null>(null);
  const stopRef = useRef<() => void>(() => undefined);

  const cleanupMedia = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    cleanupMedia();
  }, [cleanupMedia]);

  stopRef.current = stop;

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setError('Recording requires a secure context (https or localhost).');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
          if (cancelled) return;
          const recorded = new Blob(chunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          const elapsed = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
          const url = URL.createObjectURL(recorded);

          setBlob(recorded);
          setDuration(elapsed);
          setSeconds(elapsed);
          setBlobUrl((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            blobUrlRef.current = url;
            return url;
          });
          setStatus('stopped');
          cleanupMedia();
        };

        recorder.start(200);
        startedAtRef.current = Date.now();
        setStatus('recording');

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        timerRef.current = window.setInterval(() => {
          analyser.getByteFrequencyData(data);
          const bars = 28;
          const nextLevels = Array.from({ length: bars }, (_, index) => {
            const value = data[Math.floor((index / bars) * data.length)] / 255;
            return Math.max(0.1, Math.min(1, value * 1.8));
          });
          setLevels(nextLevels);

          const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
          setSeconds(elapsed);
          if (elapsed >= maxSeconds) stopRef.current();
        }, 90);
      } catch (caught) {
        if (cancelled) return;
        const name = caught instanceof DOMException ? caught.name : '';
        setStatus('error');
        setError(
          name === 'NotAllowedError'
            ? 'Microphone access was denied. Allow it in your browser to record voice notes.'
            : name === 'NotFoundError'
              ? 'No microphone was found on this device.'
              : 'Could not start the microphone.',
        );
      }
    }

    init();

    return () => {
      cancelled = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      cleanupMedia();
    };
  }, [cleanupMedia, maxSeconds]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const previewAttachment: Attachment | null = blob && blobUrl
    ? {
        url: blobUrl,
        name: 'voice-note.webm',
        mime: blob.type || 'audio/webm',
        size: blob.size,
        kind: 'audio',
        duration,
      }
    : null;

  return (
    <div className="flex min-h-[56px] items-center gap-3 py-1 animate-fade-up">
      {status === 'error' ? (
        <div className="flex flex-1 items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <MicOff size={15} />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 hover:bg-red-100 dark:hover:bg-red-900/40"
            aria-label="Close recorder"
          >
            <X size={14} />
          </button>
        </div>
      ) : status === 'requesting' ? (
        <div className="flex flex-1 items-center gap-2.5 text-xs text-muted">
          <Loader2 size={15} className="animate-spin text-accent" />
          Requesting microphone permission…
        </div>
      ) : status === 'recording' ? (
        <>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-muted transition-colors hover:text-ink"
            aria-label="Cancel recording"
            title="Cancel"
          >
            <X size={16} />
          </button>

          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            REC
          </span>

          <div className="flex h-9 flex-1 items-center gap-[3px] overflow-hidden rounded-lg border border-line bg-panel-2 px-2">
            {levels.map((level, index) => (
              <span
                key={index}
                style={{ height: `${Math.round(level * 100)}%` }}
                className="w-full rounded-full bg-accent/70 transition-[height] duration-75"
              />
            ))}
          </div>

          <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted">
            {formatDuration(seconds)}
          </span>

          <button
            type="button"
            onClick={stop}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-md shadow-red-500/20 transition-transform hover:scale-105"
            aria-label="Stop recording"
            title="Stop"
          >
            <Square size={13} fill="currentColor" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-muted transition-colors hover:text-ink"
            aria-label="Discard voice note"
            title="Discard"
          >
            <X size={16} />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-xl border border-line bg-panel-2 px-2.5 py-1.5">
            {previewAttachment && (
              <AudioMessage
                attachment={previewAttachment}
                mine={false}
                messageId="voice-note-preview"
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => blob && onSend(blob, duration)}
            disabled={!blob || busy}
            className={cn(
              'flex h-10 shrink-0 items-center gap-2 rounded-full bg-accent px-4 text-xs font-semibold text-white transition-colors hover:bg-accent-hover',
              (!blob || busy) && 'opacity-60',
            )}
            aria-label="Send voice note"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send
          </button>
        </>
      )}
    </div>
  );
}
