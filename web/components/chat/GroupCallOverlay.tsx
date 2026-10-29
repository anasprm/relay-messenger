'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ShieldCheck,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import { Avatar, GroupAvatar } from '@/components/ui/Avatar';
import { formatTimer } from '@/lib/format';
import type { GroupCallPeer, GroupCallState } from '@/lib/useGroupCall';
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

interface PeerTileProps {
  peer: GroupCallPeer;
  stream: MediaStream | null;
  kind: GroupCallState['kind'];
}

function PeerTile({ peer, stream, kind }: PeerTileProps) {
  const showVideo = kind === 'video' && peer.cameraOn && !!stream;

  return (
    <div className="relative min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
      {showVideo ? (
        <StreamVideo stream={stream} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3">
          <Avatar user={peer} size="2xl" />
          <p className="max-w-[85%] truncate text-sm font-semibold text-white">
            {peer.displayName}
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8">
        <span className="truncate text-[11.5px] font-medium text-white/90">{peer.displayName}</span>
        {peer.muted && (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/85 text-white"
            title={`${peer.displayName} is muted`}
          >
            <MicOff size={12} />
          </span>
        )}
      </div>
    </div>
  );
}

interface GroupCallOverlayProps {
  call: GroupCallState;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  me: { displayName: string; accent: GroupCallPeer['accent']; avatarUrl?: string | null };
  onAccept: () => void;
  onDecline: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
}

export function GroupCallOverlay({
  call,
  localStream,
  remoteStreams,
  me,
  onAccept,
  onDecline,
  onLeave,
  onToggleMute,
  onToggleCamera,
}: GroupCallOverlayProps) {
  if (call.status === 'idle') return null;

  const ringing = call.status === 'ringing';
  const joining = call.status === 'joining';
  const active = call.status === 'active';
  const totalPeople = call.peers.length + 1;
  const video = call.kind === 'video';

  const tileCount = totalPeople;
  const gridClass =
    tileCount <= 1
      ? 'grid-cols-1'
      : tileCount === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : tileCount <= 4
          ? 'grid-cols-1 sm:grid-cols-2'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#06110e] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-[28rem] w-[28rem] rounded-full bg-emerald-500/20 blur-[120px]" />
        <div className="absolute -right-24 bottom-0 h-[30rem] w-[30rem] rounded-full bg-teal-500/15 blur-[130px]" />
        <div className="brand-grid absolute inset-0 opacity-[0.18]" />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <GroupAvatar size="sm" label={call.title || 'Group call'} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {call.title || 'Group call'}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-white/55">
              <ShieldCheck size={11} className="text-emerald-400" />
              {active
                ? `${totalPeople} on the call`
                : ringing
                  ? 'Group call ringing'
                  : 'Joining the call'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-white/55">
          {active && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono">
              <CallTimer startedAt={call.startedAt} />
            </span>
          )}
          <span className="hidden rounded-full border border-white/10 bg-white/5 px-2.5 py-1 uppercase tracking-[0.14em] sm:inline">
            {video ? 'Video' : 'Audio'} call
          </span>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-4 pb-2 sm:px-6">
        {ringing ? (
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl animate-pop-in">
            <div className="relative mx-auto w-fit">
              <span
                className="absolute inset-0 rounded-full border border-emerald-400/30"
                style={{ animation: 'pulse-ring 2s ease-out infinite' }}
              />
              <span
                className="absolute inset-0 rounded-full border border-emerald-400/20"
                style={{ animation: 'pulse-ring 2s ease-out 0.8s infinite' }}
              />
              <GroupAvatar size="2xl" label={call.title || 'Group call'} />
            </div>
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Incoming group {call.kind} call
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {call.title || 'Group call'}
            </h2>
            <p className="mt-1 text-xs text-white/55">
              {call.from ? `${call.from.displayName} started the call` : 'Your group is calling'}
            </p>

            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={onDecline}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-950/40 transition-transform hover:scale-105"
                aria-label="Decline group call"
                title="Decline"
              >
                <PhoneOff size={20} />
              </button>
              <button
                type="button"
                onClick={onAccept}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg shadow-emerald-950/40 transition-transform hover:scale-105"
                aria-label="Join group call"
                title="Join"
              >
                {video ? <Video size={21} /> : <Phone size={20} />}
              </button>
            </div>
            <p className="mt-5 text-[10px] text-white/40">
              Joining will enable your {video ? 'camera and microphone' : 'microphone'}.
            </p>
          </div>
        ) : joining ? (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="relative">
              <span
                className="absolute inset-0 rounded-full border border-emerald-400/30"
                style={{ animation: 'pulse-ring 2.4s ease-out infinite' }}
              />
              <GroupAvatar size="2xl" label={call.title || 'Group call'} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                {call.title || 'Group call'}
              </h2>
              <p className="mt-2 flex items-center justify-center gap-2 text-xs text-white/55">
                <Loader2 size={13} className="animate-spin" />
                Joining the group call…
              </p>
            </div>
          </div>
        ) : (
          <div className={cn('grid h-full w-full max-w-6xl auto-rows-fr gap-3 overflow-y-auto', gridClass)}>
            {call.peers.map((peer) => (
              <PeerTile
                key={peer.id}
                peer={peer}
                stream={remoteStreams[peer.id] || null}
                kind={call.kind}
              />
            ))}

            <div className="relative min-h-0 overflow-hidden rounded-2xl border border-emerald-400/30 bg-white/[0.04]">
              {video && localStream && call.cameraOn ? (
                <StreamVideo
                  stream={localStream}
                  muted
                  mirrored
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                  <Avatar user={me} size="2xl" />
                  <p className="max-w-[85%] truncate text-sm font-semibold text-white">
                    {me.displayName}
                  </p>
                </div>
              )}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8">
                <span className="truncate text-[11.5px] font-medium text-white/90">
                  You
                </span>
                <span className="flex items-center gap-1.5">
                  {call.muted && (
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/85 text-white"
                      title="Your microphone is muted"
                    >
                      <MicOff size={12} />
                    </span>
                  )}
                  {video && !call.cameraOn && (
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white"
                      title="Your camera is off"
                    >
                      <VideoOff size={12} />
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="relative z-10 flex flex-col items-center gap-3 pb-8 pt-6">
        {active && call.peers.length === 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Users size={12} /> Waiting for other members to join
          </p>
        )}

        {ringing ? (
          <div className="flex items-center gap-3 text-[11px] text-white/40">
            <ShieldCheck size={12} /> The group call is waiting for your response
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-2.5 shadow-2xl backdrop-blur-xl">
            <button
              type="button"
              onClick={onToggleMute}
              disabled={joining}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl text-white transition-colors disabled:opacity-40',
                call.muted ? 'bg-white/20' : 'bg-white/[0.06] hover:bg-white/15',
              )}
              aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'}
              title={call.muted ? 'Unmute' : 'Mute'}
            >
              {call.muted ? <MicOff size={19} /> : <Mic size={19} />}
            </button>

            {video && (
              <button
                type="button"
                onClick={onToggleCamera}
                disabled={joining}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl text-white transition-colors disabled:opacity-40',
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
              onClick={onLeave}
              className="flex h-12 items-center gap-2 rounded-xl bg-red-500 px-5 text-sm font-semibold text-white shadow-lg shadow-red-950/40 transition-colors hover:bg-red-600"
              aria-label="Leave group call"
            >
              <PhoneOff size={18} />
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
