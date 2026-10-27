'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CameraOff,
  Circle,
  Loader2,
  RotateCcw,
  Send,
  Square,
  Video,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

interface VideoRecorderProps {
  open: boolean;
  onClose: () => void;
  onSend: (blob: Blob, duration: number, width: number, height: number) => void;
  busy?: boolean;
}

type Status = 'requesting' | 'ready' | 'recording' | 'recorded' | 'error';

export function VideoRecorder({ open, onClose, onSend, busy = false }: VideoRecorderProps) {
  const [status, setStatus] = useState<Status>('requesting');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLVideoElement>(null);
  const recordedUrlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecordedBlob(null);
    setSeconds(0);
    setRecordedUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      recordedUrlRef.current = null;
      return null;
    });
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      return;
    }

    let cancelled = false;

    async function init() {
      setStatus('requesting');
      setError(null);
      setRecordedUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setError('Video recording requires a secure context (https or localhost).');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 960 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: { echoCancellation: true, noiseSuppression: true },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const settings = stream.getVideoTracks()[0]?.getSettings();
        setDimensions({
          width: settings?.width || 960,
          height: settings?.height || 720,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
        setStatus('ready');
      } catch (caught) {
        if (cancelled) return;
        const name = caught instanceof DOMException ? caught.name : '';
        setStatus('error');
        setError(
          name === 'NotAllowedError'
            ? 'Camera or microphone access is blocked. Allow it from your browser\'s site permissions, then reopen the recorder.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device.'
              : 'Could not start the camera.',
        );
      }
    }

    init();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [cleanup, open]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    if (recordedUrlRef.current) {
      URL.revokeObjectURL(recordedUrlRef.current);
      recordedUrlRef.current = null;
      setRecordedUrl(null);
    }
    setRecordedBlob(null);

    const mimeType =
      ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((candidate) =>
        MediaRecorder.isTypeSupported(candidate),
      ) || '';

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const url = URL.createObjectURL(blob);
      recordedUrlRef.current = url;

      setRecordedBlob(blob);
      setRecordedUrl(url);
      setSeconds(duration);
      setStatus('recorded');
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    recorder.start(250);
    startedAtRef.current = Date.now();
    setSeconds(0);
    setStatus('recording');

    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= 60) stopRecording();
    }, 250);
  }, [stopRecording]);

  function handleClose() {
    if (busy) return;
    cleanup();
    onClose();
  }

  const recorded = status === 'recorded' ? recordedBlob : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Record a video message"
      description="Up to 60 seconds. Recorded locally, then uploaded to the relay."
      className="max-w-2xl"
    >
      <div className="space-y-4 p-5">
        <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-slate-950">
          {status === 'error' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <CameraOff size={26} className="text-white/45" />
              <p className="text-xs leading-relaxed text-white/60">{error}</p>
            </div>
          ) : recorded ? (
            <video
              src={recordedUrl || undefined}
              controls
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full scale-x-[-1] object-cover"
              />
              {status === 'requesting' && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-950/60 text-xs text-white/70">
                  <Loader2 size={15} className="animate-spin" />
                  Starting camera…
                </div>
              )}
              {status === 'ready' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full border border-white/15 bg-slate-950/60 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur">
                    <Video size={11} className="mr-1.5 inline" />
                    Camera ready — press record
                  </span>
                </div>
              )}
              {status === 'recording' && (
                <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-slate-950/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-300 backdrop-blur">
                  <Circle size={8} fill="currentColor" className="animate-pulse" />
                  REC · {formatDuration(seconds)}
                </div>
              )}
            </>
          )}
        </div>

        {status === 'recording' && (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-2.5">
            <div className="flex h-7 flex-1 items-end gap-[3px]">
              {Array.from({ length: 48 }, (_, index) => (
                <span
                  key={index}
                  className="w-full rounded-full bg-red-400/70"
                  style={{
                    height: `${Math.max(
                      14,
                      24 + Math.sin((seconds + index) * 0.7) * 20 + Math.random() * 22,
                    )}%`,
                    animation: 'wave-pulse 0.9s ease-in-out infinite',
                    animationDelay: `${index * 15}ms`,
                  }}
                />
              ))}
            </div>
            <span className="w-10 text-right font-mono text-[11px] text-muted">
              {formatDuration(seconds)}
            </span>
          </div>
        )}

        {status === 'ready' && (
          <p className="text-center text-[11px] text-faint">
            Recordings are uploaded only when you press send.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line bg-panel-2/50 px-5 py-4">
        <button
          type="button"
          onClick={handleClose}
          disabled={busy}
          className="text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          Cancel
        </button>

        <div className="flex items-center gap-2">
          {recorded && (
            <button
              type="button"
              onClick={startRecording}
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-panel px-3.5 text-xs font-medium text-ink transition-colors hover:border-line-strong"
            >
              <RotateCcw size={13} />
              Re-record
            </button>
          )}

          {status === 'ready' && (
            <button
              type="button"
              onClick={startRecording}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-500 px-4 text-xs font-semibold text-white transition-colors hover:bg-red-600"
            >
              <Circle size={10} fill="currentColor" />
              Record
            </button>
          )}

          {status === 'recording' && (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-500 px-4 text-xs font-semibold text-white transition-colors hover:bg-red-600"
            >
              <Square size={11} fill="currentColor" />
              Stop
            </button>
          )}

          {recorded && (
            <button
              type="button"
              onClick={() => onSend(recorded, seconds, dimensions.width, dimensions.height)}
              disabled={busy}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover',
                busy && 'opacity-60',
              )}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
              Send video
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
