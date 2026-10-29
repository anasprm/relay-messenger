'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { playConnectedTone, startRingtone, stopRingtone } from './ringtones';
import type { Conversation, User } from './types';

export type CallKind = 'audio' | 'video';
export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active';

/** A call that is never answered is cancelled after this long. */
const CALL_RING_TIMEOUT_MS = 45_000;

export interface CallState {
  status: CallStatus;
  kind: CallKind;
  peer: User | null;
  conversationId: string | null;
  muted: boolean;
  cameraOn: boolean;
  startedAt: number | null;
  error: string | null;
}

interface IncomingCall {
  from: User;
  conversationId: string;
  kind: CallKind;
  sdp: RTCSessionDescriptionInit | null;
}

interface UseCallOptions {
  socket: Socket | null;
  onError?: (message: string) => void;
  onInfo?: (message: string) => void;
  /**
   * Set while a group call is running, so a one-to-one call cannot start on
   * top of it (and an incoming one is declined as busy).
   */
  busyRef?: { current: boolean };
}

const IDLE: CallState = {
  status: 'idle',
  kind: 'audio',
  peer: null,
  conversationId: null,
  muted: false,
  cameraOn: false,
  startedAt: null,
  error: null,
};

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * STUN alone cannot connect every network. When TURN credentials are provided
 * at build time, they are added as a relay fallback for restrictive NATs.
 */
function buildIceServers(): RTCIceServer[] {
  const urls = (process.env.NEXT_PUBLIC_TURN_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (urls.length === 0) return STUN_SERVERS;

  return [
    ...STUN_SERVERS,
    {
      urls,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME || undefined,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || undefined,
    },
  ];
}

export const ICE_SERVERS = buildIceServers();

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: 'user',
};

type PermissionNameState = 'granted' | 'denied' | 'prompt' | 'unknown';

/** Chromium exposes microphone state; other browsers may not, so never rely on it alone. */
async function microphonePermission(): Promise<PermissionNameState> {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    return status.state as PermissionNameState;
  } catch {
    return 'unknown';
  }
}

function blockedMessage(kind: CallKind): string {
  const target = kind === 'video' ? 'Camera and microphone access is' : 'Microphone access is';
  return `${target} blocked for this site. Open the site controls next to the address bar, allow ${
    kind === 'video' ? 'Camera and Microphone' : 'Microphone'
  }, then start the call again.`;
}

export function mediaErrorMessage(error: unknown, kind: CallKind): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return blockedMessage(kind);
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone or camera was found on this device.';
  }
  if (name === 'NotReadableError') {
    return 'Your camera or microphone is already in use by another app.';
  }
  return 'Could not start the call. Please try again.';
}

function cameraFallbackNotice(name: string): string {
  if (name === 'NotFoundError') {
    return 'No camera was found, so the call started with audio only.';
  }
  if (name === 'NotReadableError') {
    return 'Your camera is busy in another app, so the call started with audio only.';
  }
  return 'Camera access is unavailable, so the call started with audio only.';
}

/**
 * Requests media inside the click gesture. A separate camera request is only made
 * after a failed combined request, so a blocked camera never prevents an audio call.
 */
export async function acquireMedia(
  kind: CallKind,
  onNotice?: (message: string) => void,
): Promise<MediaStream> {
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) {
    throw new Error('Calls require a secure context (https or localhost).');
  }

  if (kind === 'audio') {
    return media.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false });
  }

  try {
    return await media.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: VIDEO_CONSTRAINTS });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    const cameraFailure =
      name === 'NotAllowedError' || name === 'NotFoundError' || name === 'NotReadableError';
    if (!cameraFailure) throw error;

    // If the microphone itself is blocked there is nothing to fall back to.
    if ((await microphonePermission()) === 'denied') throw error;

    const stream = await media.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false });
    onNotice?.(cameraFallbackNotice(name));
    return stream;
  }
}

export function useCall({ socket, onError, onInfo, busyRef }: UseCallOptions) {
  const [call, setCall] = useState<CallState>(IDLE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const callRef = useRef<CallState>(IDLE);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const incomingRef = useRef<IncomingCall | null>(null);
  /** Guards against applying the same answer twice (call:answer and the legacy signal). */
  const applyingAnswerRef = useRef(false);
  const onErrorRef = useRef(onError);
  const onInfoRef = useRef(onInfo);

  useEffect(() => {
    onErrorRef.current = onError;
    onInfoRef.current = onInfo;
  }, [onError, onInfo]);

  // Compute from the ref instead of inside setState: guards such as "already on
  // a call" must see the new state immediately, before React re-renders.
  const updateCall = useCallback((updater: (previous: CallState) => CallState) => {
    const next = updater(callRef.current);
    callRef.current = next;
    setCall(next);
  }, []);

  const cleanup = useCallback(() => {
    stopRingtone();
    pcRef.current?.getSenders().forEach((sender) => {
      try {
        sender.track?.stop();
      } catch {
        /* ignore */
      }
    });
    pcRef.current?.close();
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pendingIceRef.current = [];
    incomingRef.current = null;
    applyingAnswerRef.current = false;

    setLocalStream(null);
    setRemoteStream(null);
    callRef.current = IDLE;
    setCall(IDLE);
  }, []);

  const buildPeer = useCallback(
    (targetId: string, conversationId: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 10 });
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket?.emit('call:signal', {
          to: targetId,
          conversationId,
          data: { type: 'ice', candidate: event.candidate.toJSON() },
        });
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) setRemoteStream(stream);
      };

      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        if (pc.connectionState === 'failed') {
          onErrorRef.current?.('The call connection was lost.');
          cleanup();
        }
      };

      return pc;
    },
    [cleanup, socket],
  );

  /**
   * Applies the callee's answer exactly once. The answer arrives on both
   * `call:answer` and (for compatibility with older relays) `call:signal`; a
   * second `setRemoteDescription` while the first is still running throws and
   * would tear down a call that is actually connecting.
   */
  const applyRemoteAnswer = useCallback(
    async (sdp: RTCSessionDescriptionInit | null) => {
      const pc = pcRef.current;
      if (!pc || !sdp) return;
      if (applyingAnswerRef.current || pc.remoteDescription) return;
      if (pc.signalingState !== 'have-local-offer') return;

      applyingAnswerRef.current = true;
      try {
        await pc.setRemoteDescription(sdp);
        for (const candidate of pendingIceRef.current) {
          await pc.addIceCandidate(candidate).catch(() => undefined);
        }
        pendingIceRef.current = [];
        updateCall((previous) => ({
          ...previous,
          status: 'active',
          startedAt: previous.startedAt || Date.now(),
        }));
      } catch {
        if (pcRef.current === pc) {
          onErrorRef.current?.('The call could not be connected.');
          cleanup();
        }
      } finally {
        applyingAnswerRef.current = false;
      }
    },
    [cleanup, updateCall],
  );

  /** Caller: ring the peer and send the SDP offer. */
  const start = useCallback(
    async (conversation: Conversation, kind: CallKind) => {
      if (!socket) {
        onErrorRef.current?.('You are not connected to the relay yet.');
        return;
      }
      if (callRef.current.status !== 'idle') {
        onErrorRef.current?.('You are already on a call.');
        return;
      }
      if (busyRef?.current) {
        onErrorRef.current?.('You are already on a group call.');
        return;
      }
      if (!conversation.other) return;

      updateCall(() => ({
        status: 'outgoing',
        kind,
        peer: conversation.other,
        conversationId: conversation.id,
        muted: false,
        cameraOn: kind === 'video',
        startedAt: null,
        error: null,
      }));

      try {
        const stream = await acquireMedia(kind, (message) => onInfoRef.current?.(message));
        const latest = callRef.current;
        if (latest.status !== 'outgoing' || latest.conversationId !== conversation.id) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        updateCall((previous) => ({
          ...previous,
          cameraOn: stream.getVideoTracks().length > 0,
        }));

        const pc = buildPeer(conversation.other.id, conversation.id);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('call:invite', {
          to: conversation.other.id,
          conversationId: conversation.id,
          kind,
          sdp: pc.localDescription,
        });
      } catch (error) {
        onErrorRef.current?.(
          error instanceof DOMException
            ? mediaErrorMessage(error, kind)
            : error instanceof Error
              ? error.message
              : mediaErrorMessage(error, kind),
        );
        cleanup();
      }
    },
    [buildPeer, cleanup, socket, updateCall, busyRef],
  );

  const accept = useCallback(async () => {
    const incoming = incomingRef.current;
    if (!incoming || !socket) return;

    updateCall((previous) => ({ ...previous, status: 'connecting', error: null }));

    try {
      const stream = await acquireMedia(incoming.kind, (message) => onInfoRef.current?.(message));
      if (callRef.current.status !== 'connecting' || incomingRef.current !== incoming) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = buildPeer(incoming.from.id, incoming.conversationId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      if (!incoming.sdp) throw new Error('The call offer was incomplete. Please ask them to call again.');
      await pc.setRemoteDescription(incoming.sdp);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      for (const candidate of pendingIceRef.current) {
        await pc.addIceCandidate(candidate).catch(() => undefined);
      }
      pendingIceRef.current = [];

      socket.emit('call:accept', {
        to: incoming.from.id,
        conversationId: incoming.conversationId,
      });
      socket.emit('call:answer', {
        to: incoming.from.id,
        conversationId: incoming.conversationId,
        sdp: pc.localDescription,
      });

      // Also send the answer through the generic signal channel, so calls keep
      // working against an API build that predates the call:answer relay.
      socket.emit('call:signal', {
        to: incoming.from.id,
        conversationId: incoming.conversationId,
        data: { type: 'sdp', sdp: pc.localDescription },
      });

      updateCall((previous) => ({
        ...previous,
        status: 'active',
        startedAt: Date.now(),
        cameraOn: stream.getVideoTracks().length > 0,
      }));
    } catch (error) {
      socket.emit('call:decline', {
        to: incoming.from.id,
        conversationId: incoming.conversationId,
        reason: 'unavailable',
      });
      onErrorRef.current?.(
        error instanceof DOMException
          ? mediaErrorMessage(error, incoming.kind)
          : error instanceof Error
            ? error.message
            : mediaErrorMessage(error, incoming.kind),
      );
      cleanup();
    }
  }, [buildPeer, cleanup, socket, updateCall]);

  const decline = useCallback(() => {
    const incoming = incomingRef.current;
    if (incoming && socket) {
      socket.emit('call:decline', {
        to: incoming.from.id,
        conversationId: incoming.conversationId,
        reason: 'declined',
      });
    }
    cleanup();
  }, [cleanup, socket]);

  const end = useCallback(() => {
    const current = callRef.current;
    if (current.status === 'incoming') {
      const incoming = incomingRef.current;
      if (incoming && socket) {
        socket.emit('call:decline', {
          to: incoming.from.id,
          conversationId: incoming.conversationId,
          reason: 'declined',
        });
      }
      cleanup();
      return;
    }
    if (current.peer && current.conversationId && socket) {
      socket.emit('call:end', {
        to: current.peer.id,
        conversationId: current.conversationId,
      });
    }
    cleanup();
  }, [cleanup, socket]);

  const toggleMute = useCallback(() => {
    const nextMuted = !callRef.current.muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    updateCall((previous) => ({ ...previous, muted: nextMuted }));
  }, [updateCall]);

  const toggleCamera = useCallback(() => {
    const nextCamera = !callRef.current.cameraOn;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = nextCamera;
    });
    updateCall((previous) => ({ ...previous, cameraOn: nextCamera }));
  }, [updateCall]);

  const hangUpWithNotice = useCallback(
    (message: string) => {
      onInfoRef.current?.(message);
      cleanup();
    },
    [cleanup],
  );

  /* Ringtone lifecycle: ring while calling or being called, stop the moment the
   * call is answered, and play a short confirmation once media connects. */
  useEffect(() => {
    if (call.status === 'incoming') {
      startRingtone('incoming');
    } else if (call.status === 'outgoing') {
      startRingtone('outgoing');
    } else if (call.status === 'active') {
      playConnectedTone();
    } else {
      stopRingtone();
    }
  }, [call.status]);

  /* Missed-call handling: nobody should be left ringing forever. */
  useEffect(() => {
    const { status } = call;
    if (status !== 'outgoing' && status !== 'incoming' && status !== 'connecting') return;

    const timer = window.setTimeout(() => {
      const current = callRef.current;
      if (current.status === 'idle') return;

      if (current.status === 'incoming') {
        const incoming = incomingRef.current;
        if (incoming && socket) {
          socket.emit('call:decline', {
            to: incoming.from.id,
            conversationId: incoming.conversationId,
            reason: 'missed',
          });
        }
        onInfoRef.current?.(
          current.peer?.displayName
            ? `Missed call from ${current.peer.displayName}.`
            : 'Missed call.',
        );
        cleanup();
        return;
      }

      if (current.peer && current.conversationId && socket) {
        socket.emit('call:end', {
          to: current.peer.id,
          conversationId: current.conversationId,
          reason: current.status === 'connecting' ? 'failed' : 'missed',
        });
      }
      onInfoRef.current?.(
        current.status === 'connecting'
          ? 'The call could not be connected.'
          : 'No answer. The call was cancelled.',
      );
      cleanup();
    }, CALL_RING_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [call.status, cleanup, socket]);

  useEffect(() => {
    if (!socket) return;

    const onIncoming = (payload: IncomingCall) => {
      if (!payload?.from) return;

      if (callRef.current.status !== 'idle' || busyRef?.current) {
        socket.emit('call:decline', {
          to: payload.from.id,
          conversationId: payload.conversationId,
          reason: 'busy',
        });
        return;
      }

      incomingRef.current = payload;
      updateCall(() => ({
        status: 'incoming',
        kind: payload.kind === 'video' ? 'video' : 'audio',
        peer: payload.from,
        conversationId: payload.conversationId,
        muted: false,
        cameraOn: payload.kind === 'video',
        startedAt: null,
        error: null,
      }));
    };

    const onAccepted = (payload: { from?: User }) => {
      if (callRef.current.status !== 'outgoing') return;
      if (payload?.from?.id && payload.from.id !== callRef.current.peer?.id) return;
      updateCall((previous) => ({ ...previous, status: 'connecting' }));
    };

    const onAnswer = async (payload: {
      from: string;
      conversationId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      if (!payload?.sdp) return;
      if (payload.conversationId !== callRef.current.conversationId) return;
      if (payload.from !== callRef.current.peer?.id) return;
      await applyRemoteAnswer(payload.sdp);
    };

    const onSignal = async (payload: {
      from: string;
      conversationId: string;
      data:
        | { type?: string; candidate?: RTCIceCandidateInit; sdp?: RTCSessionDescriptionInit }
        | null;
    }) => {
      if (!payload?.data) return;
      if (payload.conversationId !== callRef.current.conversationId) return;
      if (payload.from !== callRef.current.peer?.id) return;

      const pc = pcRef.current;

      if (payload.data.type === 'sdp') {
        await applyRemoteAnswer(payload.data.sdp || null);
        return;
      }

      if (payload.data.type !== 'ice' || !payload.data.candidate) return;

      const candidate = payload.data.candidate;
      if (!pc) {
        if (callRef.current.status === 'incoming') {
          pendingIceRef.current.push(candidate);
        }
        return;
      }

      if (!pc.remoteDescription) {
        pendingIceRef.current.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* ignore late candidates */
      }
    };

    const onDeclined = (payload: { reason?: string }) => {
      if (callRef.current.status === 'idle') return;
      if (payload?.reason === 'busy') {
        hangUpWithNotice('That person is already on another call.');
      } else if (payload?.reason === 'missed') {
        hangUpWithNotice('No answer.');
      } else if (payload?.reason === 'unavailable') {
        hangUpWithNotice('The call could not be answered.');
      } else {
        hangUpWithNotice('The call was declined.');
      }
    };

    const onUnavailable = (payload: { reason?: string }) => {
      hangUpWithNotice(payload?.reason || 'This person is offline right now.');
    };

    const onEnded = (payload: { reason?: string }) => {
      if (callRef.current.status === 'idle') return;
      if (payload?.reason === 'missed') {
        hangUpWithNotice('Missed call.');
      } else if (payload?.reason === 'offline' || payload?.reason === 'disconnected') {
        hangUpWithNotice('The call ended because they went offline.');
      } else {
        hangUpWithNotice('The call ended.');
      }
    };

    const onDisconnect = (reason: string) => {
      if (reason === 'io client disconnect') return;
      if (callRef.current.status === 'idle') return;
      hangUpWithNotice('The call ended because the connection dropped.');
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:answer', onAnswer);
    socket.on('call:signal', onSignal);
    socket.on('call:declined', onDeclined);
    socket.on('call:unavailable', onUnavailable);
    socket.on('call:ended', onEnded);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:answer', onAnswer);
      socket.off('call:signal', onSignal);
      socket.off('call:declined', onDeclined);
      socket.off('call:unavailable', onUnavailable);
      socket.off('call:ended', onEnded);
      socket.off('disconnect', onDisconnect);
    };
  }, [applyRemoteAnswer, cleanup, hangUpWithNotice, socket, updateCall, busyRef]);

  useEffect(() => {
    return () => {
      stopRingtone();
      pcRef.current?.close();
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, []);

  return {
    call,
    localStream,
    remoteStream,
    start,
    accept,
    decline,
    end,
    toggleMute,
    toggleCamera,
    isBusy: call.status !== 'idle',
  };
}
