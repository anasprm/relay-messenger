'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { Conversation, User } from './types';
import { acquireMedia, ICE_SERVERS, mediaErrorMessage, type CallKind } from './useCall';

export type GroupCallStatus = 'idle' | 'ringing' | 'joining' | 'active';

export interface GroupCallPeer extends User {
  muted: boolean;
  cameraOn: boolean;
}

export interface GroupCallState {
  status: GroupCallStatus;
  conversationId: string | null;
  callId: string | null;
  title: string | null;
  kind: CallKind;
  startedAt: number | null;
  muted: boolean;
  cameraOn: boolean;
  /** Everyone else currently in the room. */
  peers: GroupCallPeer[];
  /** Who started the ringing call, while this account has not answered yet. */
  from: User | null;
}

interface RingingPayload {
  callId: string;
  conversationId: string;
  title: string;
  kind: CallKind;
  from: User;
  participantCount: number;
}

interface RoomPayload {
  callId: string;
  conversationId: string;
  kind: CallKind;
  startedBy: string;
  createdAt: string;
  participants: GroupCallPeer[];
  existing?: string[];
  joined?: User;
}

interface SignalPayload {
  conversationId: string;
  callId: string;
  from: string;
  data:
    | { type?: string; candidate?: RTCIceCandidateInit; sdp?: RTCSessionDescriptionInit }
    | null;
}

interface UseGroupCallOptions {
  socket: Socket | null;
  me: User | null;
  onError?: (message: string) => void;
  onInfo?: (message: string) => void;
  /** Opens the group thread when a ringing call is accepted. */
  onOpenConversation?: (conversationId: string) => void;
  /** True while a one-to-one call is running, so both kinds never overlap. */
  oneToOneBusyRef?: { current: boolean };
}

const IDLE: GroupCallState = {
  status: 'idle',
  conversationId: null,
  callId: null,
  title: null,
  kind: 'audio',
  startedAt: null,
  muted: false,
  cameraOn: false,
  peers: [],
  from: null,
};

function toPeer(participant: GroupCallPeer): GroupCallPeer {
  return {
    ...participant,
    muted: !!participant.muted,
    cameraOn: !!participant.cameraOn,
  };
}

/**
 * Full-mesh group calls: one RTCPeerConnection per remote member, signalled
 * through the existing Socket.IO relay. The server only relays SDP/ICE and
 * keeps the room roster; media never leaves the participants' browsers.
 */
export function useGroupCall({
  socket,
  me,
  onError,
  onInfo,
  onOpenConversation,
  oneToOneBusyRef,
}: UseGroupCallOptions) {
  const [call, setCall] = useState<GroupCallState>(IDLE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  const stateRef = useRef<GroupCallState>(IDLE);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const roomRef = useRef<{ conversationId: string; callId: string | null } | null>(null);
  const ringingRef = useRef<RingingPayload | null>(null);
  const meRef = useRef<User | null>(me);
  const onErrorRef = useRef(onError);
  const onInfoRef = useRef(onInfo);
  const onOpenRef = useRef(onOpenConversation);

  useEffect(() => {
    meRef.current = me;
    onErrorRef.current = onError;
    onInfoRef.current = onInfo;
    onOpenRef.current = onOpenConversation;
  }, [me, onError, onInfo, onOpenConversation]);

  const updateCall = useCallback((updater: (previous: GroupCallState) => GroupCallState) => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setCall(next);
  }, []);

  const closePeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      peersRef.current.delete(peerId);
    }
    pendingIceRef.current.delete(peerId);
    setRemoteStreams((previous) => {
      if (!(peerId in previous)) return previous;
      const next = { ...previous };
      delete next[peerId];
      return next;
    });
  }, []);

  const cleanup = useCallback(
    (notice?: string) => {
      for (const peerId of [...peersRef.current.keys()]) closePeer(peerId);
      peersRef.current.clear();
      pendingIceRef.current.clear();

      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setRemoteStreams({});

      ringingRef.current = null;
      roomRef.current = null;
      stateRef.current = IDLE;
      setCall(IDLE);

      if (notice) onInfoRef.current?.(notice);
    },
    [closePeer],
  );

  const drainIce = useCallback(async (pc: RTCPeerConnection, peerId: string) => {
    const pending = pendingIceRef.current.get(peerId) || [];
    pendingIceRef.current.delete(peerId);
    for (const candidate of pending) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }, []);

  const ensurePeer = useCallback(
    (peerId: string) => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(peerId, pc);

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) pc.addTrack(track, stream);
      }

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const conversationId = roomRef.current?.conversationId;
        if (!conversationId) return;
        socket?.emit('group:call:signal', {
          conversationId,
          to: peerId,
          data: { type: 'ice', candidate: event.candidate.toJSON() },
        });
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        setRemoteStreams((previous) => ({ ...previous, [peerId]: stream }));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') closePeer(peerId);
      };

      return pc;
    },
    [closePeer, socket],
  );

  /** Newcomer side of the mesh: offer to every member already in the room. */
  const createOffer = useCallback(
    async (peerId: string) => {
      const conversationId = roomRef.current?.conversationId;
      if (!conversationId || !socket) return;

      const pc = ensurePeer(peerId);
      if (pc.signalingState !== 'stable') return;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('group:call:signal', {
        conversationId,
        to: peerId,
        data: { type: 'sdp', sdp: pc.localDescription },
      });
    },
    [ensurePeer, socket],
  );

  const start = useCallback(
    async (conversation: Conversation, kind: CallKind) => {
      if (!socket) {
        onErrorRef.current?.('You are not connected to the relay yet.');
        return;
      }
      if (conversation.kind !== 'group') return;
      if (stateRef.current.status !== 'idle') {
        onErrorRef.current?.('You are already on a call.');
        return;
      }
      if (oneToOneBusyRef?.current) {
        onErrorRef.current?.('Finish your one-to-one call first.');
        return;
      }

      const next: GroupCallState = {
        ...IDLE,
        status: 'joining',
        conversationId: conversation.id,
        title: conversation.title || 'Group call',
        kind,
        cameraOn: kind === 'video',
      };
      updateCall(() => next);
      roomRef.current = { conversationId: conversation.id, callId: null };

      try {
        const stream = await acquireMedia(kind, (message) => onInfoRef.current?.(message));
        if (stateRef.current !== next) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);
        updateCall((previous) => ({
          ...previous,
          cameraOn: stream.getVideoTracks().length > 0,
        }));

        socket.emit('group:call:start', { conversationId: conversation.id, kind });
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
    [cleanup, oneToOneBusyRef, socket, updateCall],
  );

  const accept = useCallback(async () => {
    const ringing = ringingRef.current;
    if (!ringing || !socket) return;
    if (oneToOneBusyRef?.current) {
      socket.emit('group:call:decline', { conversationId: ringing.conversationId });
      cleanup();
      return;
    }

    const kind = ringing.kind === 'video' ? 'video' : 'audio';
    const next: GroupCallState = {
      ...IDLE,
      status: 'joining',
      conversationId: ringing.conversationId,
      callId: ringing.callId,
      title: ringing.title,
      kind,
      cameraOn: kind === 'video',
    };
    updateCall(() => next);
    roomRef.current = { conversationId: ringing.conversationId, callId: ringing.callId };
    onOpenRef.current?.(ringing.conversationId);

    try {
      const stream = await acquireMedia(kind, (message) => onInfoRef.current?.(message));
      if (stateRef.current !== next) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      updateCall((previous) => ({
        ...previous,
        cameraOn: stream.getVideoTracks().length > 0,
      }));

      socket.emit('group:call:join', { conversationId: ringing.conversationId });
    } catch (error) {
      socket.emit('group:call:decline', { conversationId: ringing.conversationId });
      onErrorRef.current?.(
        error instanceof DOMException
          ? mediaErrorMessage(error, kind)
          : error instanceof Error
            ? error.message
            : mediaErrorMessage(error, kind),
      );
      cleanup();
    }
  }, [cleanup, oneToOneBusyRef, socket, updateCall]);

  const decline = useCallback(() => {
    const ringing = ringingRef.current;
    if (ringing && socket) {
      socket.emit('group:call:decline', { conversationId: ringing.conversationId });
    }
    cleanup();
  }, [cleanup, socket]);

  const leave = useCallback(() => {
    const room = roomRef.current;
    if (room && socket) {
      socket.emit('group:call:leave', { conversationId: room.conversationId });
    }
    cleanup();
  }, [cleanup, socket]);

  const toggleMute = useCallback(() => {
    const current = stateRef.current;
    const muted = !current.muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    updateCall((previous) => ({ ...previous, muted }));

    const room = roomRef.current;
    if (room && socket) {
      socket.emit('group:call:state', {
        conversationId: room.conversationId,
        muted,
        cameraOn: current.cameraOn,
      });
    }
  }, [socket, updateCall]);

  const toggleCamera = useCallback(() => {
    const current = stateRef.current;
    if (current.kind !== 'video') return;
    const cameraOn = !current.cameraOn;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = cameraOn;
    });
    updateCall((previous) => ({ ...previous, cameraOn }));

    const room = roomRef.current;
    if (room && socket) {
      socket.emit('group:call:state', {
        conversationId: room.conversationId,
        muted: current.muted,
        cameraOn,
      });
    }
  }, [socket, updateCall]);

  useEffect(() => {
    if (!socket) return;

    const onRinging = (payload: RingingPayload) => {
      if (!payload?.conversationId || !payload.from) return;

      if (stateRef.current.status !== 'idle' || oneToOneBusyRef?.current) {
        socket.emit('group:call:decline', { conversationId: payload.conversationId });
        return;
      }

      ringingRef.current = payload;
      const next: GroupCallState = {
        ...IDLE,
        status: 'ringing',
        conversationId: payload.conversationId,
        callId: payload.callId,
        title: payload.title,
        kind: payload.kind === 'video' ? 'video' : 'audio',
        from: payload.from,
      };
      updateCall(() => next);
    };

    const onJoined = (payload: RoomPayload) => {
      const current = stateRef.current;
      if (current.status === 'idle' || current.conversationId !== payload.conversationId) return;

      roomRef.current = { conversationId: payload.conversationId, callId: payload.callId };
      const myId = meRef.current?.id;
      const peers = (payload.participants || [])
        .filter((participant) => participant.id !== myId)
        .map(toPeer);

      updateCall((previous) => ({
        ...previous,
        status: 'active',
        callId: payload.callId,
        kind: payload.kind === 'video' ? 'video' : 'audio',
        startedAt: previous.startedAt || Date.now(),
        peers,
      }));

      // The person joining offers to everyone who was already there; existing
      // members wait for that offer, which keeps the mesh free of glare.
      for (const peerId of payload.existing || []) {
        if (peerId === myId) continue;
        void createOffer(peerId).catch(() => undefined);
      }
    };

    const onPeerJoined = (payload: RoomPayload) => {
      const current = stateRef.current;
      if (current.status !== 'active' || current.conversationId !== payload.conversationId) return;

      const myId = meRef.current?.id;
      const peers = (payload.participants || [])
        .filter((participant) => participant.id !== myId)
        .map(toPeer);
      updateCall((previous) => ({ ...previous, peers }));
    };

    const onSignal = async (payload: SignalPayload) => {
      const current = stateRef.current;
      if (current.status !== 'active' || current.conversationId !== payload.conversationId) return;
      if (!payload.from || payload.from === meRef.current?.id) return;

      const data = payload.data;
      if (!data) return;

      if (data.type === 'sdp' && data.sdp) {
        if (data.sdp.type === 'offer') {
          const pc = ensurePeer(payload.from);
          try {
            await pc.setRemoteDescription(data.sdp);
            await drainIce(pc, payload.from);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('group:call:signal', {
              conversationId: payload.conversationId,
              to: payload.from,
              data: { type: 'sdp', sdp: pc.localDescription },
            });
          } catch {
            closePeer(payload.from);
          }
          return;
        }

        if (data.sdp.type === 'answer') {
          const pc = peersRef.current.get(payload.from);
          if (!pc || pc.remoteDescription) return;
          try {
            await pc.setRemoteDescription(data.sdp);
            await drainIce(pc, payload.from);
          } catch {
            closePeer(payload.from);
          }
        }
        return;
      }

      if (data.type !== 'ice' || !data.candidate) return;

      const candidate = data.candidate;
      const pc = peersRef.current.get(payload.from);
      if (!pc || !pc.remoteDescription) {
        const pending = pendingIceRef.current.get(payload.from) || [];
        pending.push(candidate);
        pendingIceRef.current.set(payload.from, pending);
        return;
      }
      await pc.addIceCandidate(candidate).catch(() => undefined);
    };

    const onState = (payload: {
      conversationId: string;
      userId: string;
      muted: boolean;
      cameraOn: boolean;
    }) => {
      const current = stateRef.current;
      if (current.status !== 'active' || current.conversationId !== payload.conversationId) return;
      if (!payload.userId || payload.userId === meRef.current?.id) return;

      updateCall((previous) => ({
        ...previous,
        peers: previous.peers.map((peer) =>
          peer.id === payload.userId
            ? { ...peer, muted: !!payload.muted, cameraOn: !!payload.cameraOn }
            : peer,
        ),
      }));
    };

    const onLeft = (payload: {
      conversationId: string;
      userId: string;
      participants: GroupCallPeer[];
    }) => {
      const current = stateRef.current;
      if (current.conversationId !== payload.conversationId) return;

      if (payload.userId) closePeer(payload.userId);

      const myId = meRef.current?.id;
      const peers = (payload.participants || [])
        .filter((participant) => participant.id !== myId)
        .map(toPeer);
      updateCall((previous) => ({ ...previous, peers }));
    };

    const onDeclined = (payload: { conversationId: string; from?: User }) => {
      const current = stateRef.current;
      if (current.status !== 'active' || current.conversationId !== payload.conversationId) return;
      if (!payload.from?.displayName) return;
      onInfoRef.current?.(`${payload.from.displayName} can't join right now.`);
    };

    const onUnavailable = (payload: { conversationId: string; reason?: string }) => {
      const current = stateRef.current;
      if (current.status === 'idle' || current.conversationId !== payload.conversationId) return;
      cleanup(payload?.reason || 'That group call is not available.');
    };

    const onEnded = (payload: { conversationId: string }) => {
      const current = stateRef.current;
      if (current.status === 'idle' || current.conversationId !== payload.conversationId) return;
      cleanup('The group call ended.');
    };

    const onDisconnect = () => {
      if (stateRef.current.status === 'idle') return;
      cleanup('The group call ended because the connection dropped.');
    };

    socket.on('group:call:ringing', onRinging);
    socket.on('group:call:joined', onJoined);
    socket.on('group:call:peer-joined', onPeerJoined);
    socket.on('group:call:signal', onSignal);
    socket.on('group:call:state', onState);
    socket.on('group:call:left', onLeft);
    socket.on('group:call:declined', onDeclined);
    socket.on('group:call:unavailable', onUnavailable);
    socket.on('group:call:ended', onEnded);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('group:call:ringing', onRinging);
      socket.off('group:call:joined', onJoined);
      socket.off('group:call:peer-joined', onPeerJoined);
      socket.off('group:call:signal', onSignal);
      socket.off('group:call:state', onState);
      socket.off('group:call:left', onLeft);
      socket.off('group:call:declined', onDeclined);
      socket.off('group:call:unavailable', onUnavailable);
      socket.off('group:call:ended', onEnded);
      socket.off('disconnect', onDisconnect);
    };
  }, [
    cleanup,
    closePeer,
    createOffer,
    drainIce,
    ensurePeer,
    oneToOneBusyRef,
    socket,
    updateCall,
  ]);

  useEffect(() => {
    return () => {
      for (const pc of peersRef.current.values()) {
        try {
          pc.close();
        } catch {
          /* ignore */
        }
      }
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, []);

  return {
    call,
    localStream,
    remoteStreams,
    start,
    accept,
    decline,
    leave,
    toggleMute,
    toggleCamera,
    isBusy: call.status !== 'idle',
  };
}
