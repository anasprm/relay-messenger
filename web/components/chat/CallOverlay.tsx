'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ShieldCheck,
  Video,
  VideoOff,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimer } from '@/lib/format';
import type { CallState } from '@/lib/useCall';
import { cn } from '@/lib/utils';

function StreamVideo({
  stream,
  muted = false,
  mirrored = false,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    if (stream) element.play().catch(() => undefined);
    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={cn(className, mirrored && 'scale-x-[-1]')}
    />
  );
}

function StreamAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    if (stream) element.play().catch(() => undefined);
    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  return <audio ref={ref} autoPlay playsInline />;
}

function CallTimer({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  if (!startedAt) return null;
  return <span className="tabular-nums">{formatTimer((now - startedAt) / 1000)}</span>;
}

interface CallOverlayProps {
  call: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
}

export function CallOverlay({
  call,
  localStream,
  remoteStream,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onToggleCamera,
}: CallOverlayProps) {
  if (call.status === 'idle' || !call.peer) return null;

  const incoming = call.status === 'incoming';
  const outgoing = call.status === 'outgoing';
  const active = call.status === 'active' || call.status === 'connecting';

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#070a12] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-[28rem] w-[28rem] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute -right-24 bottom-0 h-[30rem] w-[30rem] rounded-full bg-violet-600/15 blur-[130px]" />
        <div className="brand-grid absolute inset-0 opacity-[0.18]" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar user={call.peer} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{call.peer.displayName}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck size={11} className="text-emerald-400" />
              Peer-to-peer · encrypted media
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          {active && call.status === 'active' && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono">
              <CallTimer startedAt={call.startedAt} />
            </span>
          )}
          <span className="hidden rounded-full border border-white/10 bg-white/5 px-2.5 py-1 uppercase tracking-[0.14em] sm:inline">
            {call.kind === 'video' ? 'Video' : 'Audio'} call
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-5 pb-2">
        {active ? (
          <div className="relative h-full w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {call.kind === 'video' && remoteStream ? (
              <StreamVideo stream={remoteStream} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-5">
                <div className="relative">
                  <span className="absolute inset-0 rounded-full border border-indigo-400/30" />
                  <span
                    className="absolute inset-0 rounded-full border border-indigo-400/20"
                    style={{ animation: 'pulse-ring 2.6s ease-out infinite' }}
                  />
                  <Avatar user={call.peer} size="2xl" />
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold tracking-tight text-white">
                    {call.peer.displayName}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {call.status === 'connecting' ? 'Connecting…' : 'Audio connected'}
                  </p>
                </div>
                <StreamAudio stream={remoteStream} />
              </div>
            )}

            {call.kind === 'video' && (
              <div className="absolute bottom-4 right-4 h-32 w-24 overflow-hidden rounded-xl border border-white/15 bg-slate-900 shadow-2xl sm:h-40 sm:w-28">
                {localStream && call.cameraOn ? (
                  <StreamVideo
                    stream={localStream}
                    muted
                    mirrored
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-slate-900 text-[10px] text-slate-400">
                    <VideoOff size={16} />
                    Camera off
                  </div>
                )}
              </div>
            )}

            {call.status === 'connecting' && (
              <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-2 bg-slate-950/50 py-2 text-[11px] text-slate-300 backdrop-blur">
                <Loader2 size={12} className="animate-spin" />
                Establishing secure media…
              </div>
            )}
          </div>
        ) : incoming ? (
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl animate-pop-in">
            <div className="relative mx-auto w-fit">
              <span
                className="absolute inset-0 rounded-full border border-indigo-400/30"
                style={{ animation: 'pulse-ring 2s ease-out infinite' }}
              />
              <span
                className="absolute inset-0 rounded-full border border-indigo-400/20"
                style={{ animation: 'pulse-ring 2s ease-out 0.8s infinite' }}
              />
              <Avatar user={call.peer} size="2xl" />
            </div>
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-300">
              Incoming {call.kind} call
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {call.peer.displayName}
            </h2>
            <p className="mt-1 text-xs text-slate-400">@{call.peer.username} · Relay workspace</p>

            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={onDecline}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-950/40 transition-transform hover:scale-105"
                aria-label="Decline call"
                title="Decline"
              >
                <PhoneOff size={20} />
              </button>
              <button
                type="button"
                onClick={onAccept}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition-transform hover:scale-105"
                aria-label="Accept call"
                title="Accept"
              >
                {call.kind === 'video' ? <Video size={21} /> : <Phone size={20} />}
              </button>
            </div>
            <p className="mt-5 text-[10px] text-slate-500">
              Accepting will enable your {call.kind === 'video' ? 'camera and microphone' : 'microphone'}.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="relative">
              <span
                className="absolute inset-0 rounded-full border border-indigo-400/30"
                style={{ animation: 'pulse-ring 2.4s ease-out infinite' }}
              />
              <span
                className="absolute inset-0 rounded-full border border-indigo-400/20"
                style={{ animation: 'pulse-ring 2.4s ease-out 0.9s infinite' }}
              />
              <Avatar user={call.peer} size="2xl" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-300">
                {call.kind} call
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {call.peer.displayName}
              </h2>
              <p className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-400">
                <span className="flex gap-1">
                  <span className="h-1 w-1 animate-blink rounded-full bg-slate-300" />
                  <span
                    className="h-1 w-1 animate-blink rounded-full bg-slate-300"
                    style={{ animationDelay: '0.2s' }}
                  />
                  <span
                    className="h-1 w-1 animate-blink rounded-full bg-slate-300"
                    style={{ animationDelay: '0.4s' }}
                  />
                </span>
                {outgoing ? 'Calling' : 'Connecting'}
              </p>
            </div>

            {call.kind === 'video' && localStream && (
              <div className="h-36 w-28 overflow-hidden rounded-xl border border-white/15 bg-slate-900 shadow-2xl">
                <StreamVideo
                  stream={localStream}
                  muted
                  mirrored
                  className="h-full w-full object-cover"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <footer className="relative z-10 flex items-center justify-center pb-8 pt-6">
        {incoming ? (
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <ShieldCheck size={12} /> Incoming call is waiting for your response
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-2.5 shadow-2xl backdrop-blur-xl">
            <button
              type="button"
              onClick={onToggleMute}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl text-white transition-colors',
                call.muted ? 'bg-white/20' : 'bg-white/[0.06] hover:bg-white/15',
              )}
              aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'}
              title={call.muted ? 'Unmute' : 'Mute'}
            >
              {call.muted ? <MicOff size={19} /> : <Mic size={19} />}
            </button>

            {call.kind === 'video' && (
              <button
                type="button"
                onClick={onToggleCamera}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl text-white transition-colors',
                  !call.cameraOn ? 'bg-white/20' : 'bg-white/[0.06] hover:bg-white/15',
                )}
                aria-label={call.cameraOn ? 'Turn camera off' : 'Turn camera on'}
                title={call.cameraOn ? 'Camera off' : 'Camera on'}
              >
                {call.cameraOn ? <Video size={19} /> : <VideoOff size={19} />}
              </button>
            )}

            <button
              type="button"
              onClick={onEnd}
              className="flex h-12 items-center gap-2 rounded-xl bg-red-500 px-5 text-sm font-semibold text-white shadow-lg shadow-red-950/40 transition-colors hover:bg-red-600"
              aria-label="End call"
            >
              <PhoneOff size={18} />
              <span className="hidden sm:inline">End</span>
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
