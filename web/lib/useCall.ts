'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { Conversation, User } from './types';

export type CallKind = 'audio' | 'video';
export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active';

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

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function mediaErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera and microphone permission was denied.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone or camera was found on this device.';
  }
  if (name === 'NotReadableError') {
    return 'Your camera or microphone is already in use by another app.';
  }
  return 'Could not start the call. Please try again.';
}

async function acquireMedia(kind: CallKind): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Calls require a secure context (https or localhost).');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video:
      kind === 'video'
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        : false,
  });
}

export function useCall({ socket, onError, onInfo }: UseCallOptions) {
  const [call, setCall] = useState<CallState>(IDLE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const callRef = useRef<CallState>(IDLE);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const incomingRef = useRef<IncomingCall | null>(null);
  const onErrorRef = useRef(onError);
  const onInfoRef = useRef(onInfo);

  useEffect(() => {
    onErrorRef.current = onError;
    onInfoRef.current = onInfo;
  }, [onError, onInfo]);

  const updateCall = useCallback((updater: (previous: CallState) => CallState) => {
    setCall((previous) => {
      const next = updater(previous);
      callRef.current = next;
      return next;
    });
  }, []);

  const cleanup = useCallback(() => {
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
        const stream = await acquireMedia(kind);
        localStreamRef.current = stream;
        setLocalStream(stream);

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
            ? mediaErrorMessage(error)
            : error instanceof Error
              ? error.message
              : mediaErrorMessage(error),
        );
        cleanup();
      }
    },
    [buildPeer, cleanup, socket, updateCall],
  );

  const accept = useCallback(async () => {
    const incoming = incomingRef.current;
    if (!incoming || !socket) return;

    updateCall((previous) => ({ ...previous, status: 'connecting', error: null }));

    try {
      const stream = await acquireMedia(incoming.kind);
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

      updateCall((previous) => ({
        ...previous,
        status: 'active',
        startedAt: Date.now(),
        cameraOn: incoming.kind === 'video',
      }));
    } catch (error) {
      socket.emit('call:decline', {
        to: incoming.from.id,
        conversationId: incoming.conversationId,
        reason: 'unavailable',
      });
      onErrorRef.current?.(
        error instanceof DOMException
          ? mediaErrorMessage(error)
          : error instanceof Error
            ? error.message
            : mediaErrorMessage(error),
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

  useEffect(() => {
    if (!socket) return;

    const onIncoming = (payload: IncomingCall) => {
      if (!payload?.from) return;

      if (callRef.current.status !== 'idle') {
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

    const onAccepted = () => {
      if (callRef.current.status !== 'outgoing') return;
      updateCall((previous) => ({ ...previous, status: 'connecting' }));
    };

    const onAnswer = async (payload: {
      from: string;
      conversationId: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const pc = pcRef.current;
      if (!pc || !payload?.sdp) return;
      if (payload.conversationId !== callRef.current.conversationId) return;

      try {
        await pc.setRemoteDescription(payload.sdp);
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
        onErrorRef.current?.('The call could not be connected.');
        cleanup();
      }
    };

    const onSignal = async (payload: {
      from: string;
      conversationId: string;
      data: { type?: string; candidate?: RTCIceCandidateInit } | null;
    }) => {
      if (!payload?.data || payload.data.type !== 'ice' || !payload.data.candidate) return;
      if (payload.conversationId !== callRef.current.conversationId) return;

      const pc = pcRef.current;
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
      if (typeof payload?.reason === 'string' && payload.reason === 'busy') {
        hangUpWithNotice('That person is already on another call.');
      } else {
        hangUpWithNotice('The call was declined.');
      }
    };

    const onUnavailable = (payload: { reason?: string }) => {
      hangUpWithNotice(payload?.reason || 'This person is offline right now.');
    };

    const onEnded = () => {
      if (callRef.current.status === 'idle') return;
      hangUpWithNotice('The call ended.');
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:answer', onAnswer);
    socket.on('call:signal', onSignal);
    socket.on('call:declined', onDeclined);
    socket.on('call:unavailable', onUnavailable);
    socket.on('call:ended', onEnded);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:answer', onAnswer);
      socket.off('call:signal', onSignal);
      socket.off('call:declined', onDeclined);
      socket.off('call:unavailable', onUnavailable);
      socket.off('call:ended', onEnded);
    };
  }, [cleanup, hangUpWithNotice, socket, updateCall]);

  useEffect(() => {
    return () => {
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
