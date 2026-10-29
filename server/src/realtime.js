import crypto from 'node:crypto';
import { findConversation, findUserById, isGroupConversation, persistUser } from './db.js';
import { verifyToken } from './auth.js';
import * as presence from './presence.js';
import { publicUser, serializeMessage } from './serializers.js';
import {
  conversationScope,
  isScope,
  scopeFromOrigin,
  userScope,
} from './site.js';

function conversationBetween(conversationId, a, b, scope) {
  const conversation = findConversation(conversationId);
  if (!conversation) return null;
  if (scope && conversationScope(conversation) !== scope) return null;
  if (!conversation.participantIds.includes(a) || !conversation.participantIds.includes(b)) return null;
  return conversation;
}

export function broadcastMessage(io, message) {
  const conversation = findConversation(message.conversationId);
  if (!conversation) return;

  for (const participantId of conversation.participantIds) {
    io.to(`user:${participantId}`).emit(
      'message:new',
      serializeMessage(message, participantId),
    );
  }
}

export function broadcastMessageUpdate(io, message) {
  const conversation = findConversation(message.conversationId);
  if (!conversation) return;

  for (const participantId of conversation.participantIds) {
    io.to(`user:${participantId}`).emit(
      'message:update',
      serializeMessage(message, participantId),
    );
  }
}

export function broadcastModes(io, conversation) {
  for (const participantId of conversation.participantIds) {
    io.to(`user:${participantId}`).emit('conversation:modes', {
      conversationId: conversation.id,
      modes: conversation.modes?.[participantId] || { anonymity: false, vanish: false },
    });
  }
}

export function broadcastPurge(io, conversationId, ids) {
  const conversation = findConversation(conversationId);
  if (!conversation || ids.length === 0) return;

  for (const participantId of conversation.participantIds) {
    io.to(`user:${participantId}`).emit('messages:purged', { conversationId, ids });
  }
}

export function broadcastConversationRefresh(io, conversation) {
  for (const participantId of conversation.participantIds) {
    io.to(`user:${participantId}`).emit('conversation:refresh', {
      conversationId: conversation.id,
    });
  }
}

/** Tells one person that a group disappeared from their list (removed or left). */
export function broadcastConversationRemoved(io, conversation, userId) {
  io.to(`user:${userId}`).emit('conversation:removed', {
    conversationId: conversation.id,
  });
}

/* ------------------------------------------------------------------ *
 * Group calls — an ephemeral full-mesh WebRTC room per group.
 *
 * The server never touches media. It keeps who is in the room, rings the
 * online members when a call starts, and relays SDP/ICE between every pair.
 * Rooms live in memory and disappear when the last person leaves.
 * ------------------------------------------------------------------ */

const groupCallRooms = new Map();

/** One-to-one calls, keyed by conversation, with the socket that owns each end. */
const directCalls = new Map();
const DIRECT_CALL_TTL_MS = 2 * 60 * 1000;

function directCallForUser(userId) {
  for (const [conversationId, entry] of directCalls) {
    if (entry.callerId === userId || entry.calleeId === userId) {
      return { conversationId, entry };
    }
  }
  return null;
}

function groupCallForUser(userId) {
  for (const room of groupCallRooms.values()) {
    if (room.participants.has(userId)) return room;
  }
  return null;
}

/** Explains why a person cannot start or receive another call right now. */
function directCallBusyReason(userId) {
  const found = directCallForUser(userId);
  if (!found) return null;
  const { entry } = found;
  if (entry.callerId === userId) return 'You are already on a call.';
  return entry.accepted
    ? 'You are already on a call.'
    : 'You have an incoming call. Answer or decline it first.';
}

/** Drops rings that were never answered, e.g. after a client crash. */
function clearStaleDirectCalls() {
  const now = Date.now();
  for (const [conversationId, entry] of [...directCalls]) {
    if (!entry.accepted && now - entry.createdAt > DIRECT_CALL_TTL_MS) {
      directCalls.delete(conversationId);
    }
  }
}

function groupRoomSummary(room) {
  return {
    callId: room.id,
    conversationId: room.conversationId,
    kind: room.kind,
    startedBy: room.startedBy,
    createdAt: room.createdAt,
    participants: [...room.participants.entries()]
      .map(([userId, state]) => {
        const member = findUserById(userId);
        if (!member) return null;
        return {
          ...publicUser(member),
          muted: !!state.muted,
          cameraOn: !!state.cameraOn,
        };
      })
      .filter(Boolean),
  };
}

function emitToRoom(io, room, event, payload, exceptUserId = null) {
  for (const userId of room.participants.keys()) {
    if (userId === exceptUserId) continue;
    io.to(`user:${userId}`).emit(event, payload);
  }
}

/** Resolves a socket's group conversation, or null when access is not allowed. */
function groupConversationFor(conversationId, userId, scope) {
  const conversation = findConversation(conversationId);
  if (!isGroupConversation(conversation)) return null;
  if (conversationScope(conversation) !== scope) return null;
  if (!conversation.participantIds.includes(userId)) return null;
  return conversation;
}

/**
 * Adds a person to a group room, or moves their participation to a newer tab.
 * The old tab is told to close its overlay; the remaining members rebuild the
 * peer connection when the new tab offers again.
 */
function addGroupParticipant(io, room, user, socket) {
  const existing = room.participants.get(user.id);

  if (existing) {
    if (existing.socketId === socket.id) {
      socket.emit('group:call:joined', { ...groupRoomSummary(room), existing: [] });
      return;
    }

    io.to(existing.socketId).emit('group:call:ended', {
      conversationId: room.conversationId,
      callId: room.id,
      reason: 'elsewhere',
    });

    existing.socketId = socket.id;
    existing.muted = false;
    existing.cameraOn = room.kind === 'video';

    const existingIds = [...room.participants.keys()].filter((id) => id !== user.id);
    socket.emit('group:call:joined', { ...groupRoomSummary(room), existing: existingIds });
    emitToRoom(
      io,
      room,
      'group:call:peer-joined',
      { ...groupRoomSummary(room), joined: publicUser(user) },
      user.id,
    );
    return;
  }

  const existingIds = [...room.participants.keys()];
  room.participants.set(user.id, {
    socketId: socket.id,
    muted: false,
    cameraOn: room.kind === 'video',
  });

  socket.emit('group:call:joined', { ...groupRoomSummary(room), existing: existingIds });
  emitToRoom(
    io,
    room,
    'group:call:peer-joined',
    { ...groupRoomSummary(room), joined: publicUser(user) },
    user.id,
  );
}

function removeFromGroupCall(io, room, userId, reason) {
  if (!room.participants.delete(userId)) return false;

  emitToRoom(io, room, 'group:call:left', {
    conversationId: room.conversationId,
    callId: room.id,
    userId,
    reason,
    participants: groupRoomSummary(room).participants,
  });

  if (room.participants.size === 0) {
    groupCallRooms.delete(room.conversationId);
    const conversation = findConversation(room.conversationId);
    for (const participantId of conversation?.participantIds || []) {
      io.to(`user:${participantId}`).emit('group:call:ended', {
        conversationId: room.conversationId,
        callId: room.id,
        reason: 'empty',
      });
    }
  }

  return true;
}

/** Ends a person's group-call presence, e.g. when the creator removes them. */
export function removeUserFromGroupCall(io, conversationId, userId, reason = 'removed') {
  const room = groupCallRooms.get(conversationId);
  if (!room) return;
  const removed = removeFromGroupCall(io, room, userId, reason);
  if (!removed) return;

  // Tell the person who left or was removed, so their overlay closes immediately.
  io.to(`user:${userId}`).emit('group:call:ended', {
    conversationId,
    callId: room.id,
    reason,
  });
}

/** Unsend: tells both participants to drop the message immediately. */
export function broadcastMessageDeleted(io, conversation, messageId) {
  for (const participantId of conversation.participantIds) {
    io.to(`user:${participantId}`).emit('message:deleted', {
      conversationId: conversation.id,
      id: messageId,
    });
  }
}

export function registerRealtime(io) {
  io.use((socket, next) => {
    const claims = verifyToken(socket.handshake.auth?.token);
    const user = claims ? findUserById(claims.sub) : null;
    if (!user) return next(new Error('unauthorized'));

    const requested = socket.handshake.auth?.site;
    const scope = isScope(requested)
      ? requested
      : scopeFromOrigin(socket.handshake.headers?.origin) || 'public';

    if (userScope(user) !== scope) return next(new Error('wrong-workspace'));

    socket.data.user = user;
    socket.data.scope = scope;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const scope = socket.data.scope;
    const becameOnline = presence.addSocket(user.id, socket.id);
    socket.join(`user:${user.id}`);
    socket.join(`site:${scope}`);

    const onlineInScope = presence
      .onlineUserIds()
      .filter((id) => userScope(findUserById(id)) === scope);

    socket.emit('presence:snapshot', { online: onlineInScope });

    // The focused tab claims calls; background tabs stay quiet.
    socket.on('presence:active', () => {
      presence.markActiveSocket(user.id, socket.id);
    });

    if (becameOnline) {
      user.lastSeen = new Date().toISOString();
      persistUser(user).catch((error) => {
        console.warn(`[realtime] Could not persist presence: ${error.message}`);
      });
      io.to(`site:${scope}`).emit('presence:update', {
        userId: user.id,
        online: true,
        lastSeen: user.lastSeen,
      });
    }

    socket.on('typing', (payload = {}) => {
      const conversation = findConversation(payload.conversationId);
      if (!conversation) return;
      if (conversationScope(conversation) !== scope) return;
      if (!conversation.participantIds.includes(user.id)) return;

      // A group has no single recipient: every other member sees the indicator.
      for (const participantId of conversation.participantIds) {
        if (participantId === user.id) continue;
        io.to(`user:${participantId}`).emit('typing:update', {
          conversationId: conversation.id,
          userId: user.id,
          typing: !!payload.typing,
        });
      }
    });

    socket.on('call:invite', (payload = {}) => {
      const conversation = conversationBetween(payload.conversationId, user.id, payload.to, scope);
      if (!conversation) return;

      // WebRTC calls are one-to-one; a group must not ring a single member.
      if (isGroupConversation(conversation)) {
        socket.emit('call:unavailable', {
          conversationId: conversation.id,
          reason: 'Use the group call buttons to call everyone in this group.',
        });
        return;
      }

      const calleeSocketId = presence.activeSocketFor(payload.to);
      if (!calleeSocketId) {
        socket.emit('call:unavailable', {
          conversationId: conversation.id,
          reason: 'This person is offline right now.',
        });
        return;
      }

      clearStaleDirectCalls();

      const existing = directCalls.get(conversation.id);
      if (existing && existing.callerSocketId !== socket.id) {
        socket.emit('call:unavailable', {
          conversationId: conversation.id,
          reason: 'There is already a call in this chat.',
        });
        return;
      }
      if (existing) directCalls.delete(conversation.id);

      const callerBusy = directCallBusyReason(user.id);
      if (callerBusy) {
        socket.emit('call:unavailable', { conversationId: conversation.id, reason: callerBusy });
        return;
      }
      if (groupCallForUser(user.id)) {
        socket.emit('call:unavailable', {
          conversationId: conversation.id,
          reason: 'Finish your group call first.',
        });
        return;
      }

      const calleeBusy = directCallBusyReason(payload.to);
      if (calleeBusy) {
        socket.emit('call:unavailable', {
          conversationId: conversation.id,
          reason:
            calleeBusy === 'You have an incoming call. Answer or decline it first.'
              ? 'That person already has an incoming call.'
              : 'That person is already on another call.',
        });
        return;
      }
      if (groupCallForUser(payload.to)) {
        socket.emit('call:unavailable', {
          conversationId: conversation.id,
          reason: 'That person is already on a group call.',
        });
        return;
      }

      const kind = payload.kind === 'video' ? 'video' : 'audio';
      directCalls.set(conversation.id, {
        conversationId: conversation.id,
        callerId: user.id,
        callerSocketId: socket.id,
        calleeId: payload.to,
        calleeSocketId,
        kind,
        accepted: false,
        createdAt: Date.now(),
      });

      io.to(calleeSocketId).emit('call:incoming', {
        from: publicUser(user, findUserById(payload.to)),
        conversationId: conversation.id,
        kind,
        sdp: payload.sdp || null,
      });
    });

    socket.on('call:accept', (payload = {}) => {
      if (!conversationBetween(payload.conversationId, user.id, payload.to, scope)) return;

      const entry = directCalls.get(payload.conversationId);
      if (!entry) return;
      if (entry.callerId !== payload.to || entry.calleeId !== user.id) return;
      if (entry.calleeSocketId !== socket.id) return;

      entry.accepted = true;
      io.to(entry.callerSocketId).emit('call:accepted', {
        from: publicUser(user, findUserById(payload.to)),
        conversationId: payload.conversationId,
      });
    });

    socket.on('call:answer', (payload = {}) => {
      if (!conversationBetween(payload.conversationId, user.id, payload.to, scope)) return;
      if (!payload.sdp) return;

      const entry = directCalls.get(payload.conversationId);
      if (!entry) return;
      if (entry.callerId !== payload.to || entry.calleeId !== user.id) return;
      if (entry.calleeSocketId !== socket.id) return;

      io.to(entry.callerSocketId).emit('call:answer', {
        from: user.id,
        conversationId: payload.conversationId,
        sdp: payload.sdp,
      });
    });

    socket.on('call:decline', (payload = {}) => {
      if (!conversationBetween(payload.conversationId, user.id, payload.to, scope)) return;

      const entry = directCalls.get(payload.conversationId);
      if (!entry) return;
      if (entry.callerId !== payload.to || entry.calleeId !== user.id) return;
      if (entry.calleeSocketId !== socket.id) return;

      directCalls.delete(payload.conversationId);
      io.to(entry.callerSocketId).emit('call:declined', {
        from: publicUser(user, findUserById(payload.to)),
        conversationId: payload.conversationId,
        reason: payload.reason || 'declined',
      });
    });

    socket.on('call:signal', (payload = {}) => {
      if (!conversationBetween(payload.conversationId, user.id, payload.to, scope)) return;

      const entry = directCalls.get(payload.conversationId);
      if (entry) {
        let target = null;
        if (
          entry.callerId === user.id &&
          entry.callerSocketId === socket.id &&
          entry.calleeId === payload.to
        ) {
          target = entry.calleeSocketId;
        } else if (
          entry.calleeId === user.id &&
          entry.calleeSocketId === socket.id &&
          entry.callerId === payload.to
        ) {
          target = entry.callerSocketId;
        }
        if (!target) return;

        io.to(target).emit('call:signal', {
          from: user.id,
          conversationId: payload.conversationId,
          data: payload.data || null,
        });
        return;
      }

      // Legacy fallback for a call that began before an API restart.
      io.to(`user:${payload.to}`).emit('call:signal', {
        from: user.id,
        conversationId: payload.conversationId,
        data: payload.data || null,
      });
    });

    socket.on('call:end', (payload = {}) => {
      if (!conversationBetween(payload.conversationId, user.id, payload.to, scope)) return;

      const entry = directCalls.get(payload.conversationId);
      if (entry) {
        let target = null;
        if (entry.callerId === user.id && entry.callerSocketId === socket.id) {
          target = entry.calleeSocketId;
        } else if (entry.calleeId === user.id && entry.calleeSocketId === socket.id) {
          target = entry.callerSocketId;
        }
        if (!target) return;

        directCalls.delete(payload.conversationId);
        io.to(target).emit('call:ended', {
          from: publicUser(user, findUserById(payload.to)),
          conversationId: payload.conversationId,
          reason: payload.reason || 'ended',
        });
        return;
      }

      io.to(`user:${payload.to}`).emit('call:ended', {
        from: publicUser(user, findUserById(payload.to)),
        conversationId: payload.conversationId,
        reason: payload.reason || 'ended',
      });
    });

    /** Starts a group room, or joins the one already running in this group. */
    socket.on('group:call:start', (payload = {}) => {
      const conversation = groupConversationFor(payload.conversationId, user.id, scope);
      if (!conversation) return;

      const kind = payload.kind === 'video' ? 'video' : 'audio';
      let room = groupCallRooms.get(conversation.id);

      if (room && room.kind !== kind) {
        socket.emit('group:call:unavailable', {
          conversationId: conversation.id,
          reason: `${room.kind === 'audio' ? 'An audio' : 'A video'} call is already running in this group.`,
        });
        return;
      }

      const alreadyHere = !!room?.participants.has(user.id);
      if (!alreadyHere) {
        const directReason = directCallBusyReason(user.id);
        if (directReason) {
          socket.emit('group:call:unavailable', {
            conversationId: conversation.id,
            reason: directReason,
          });
          return;
        }
        const otherRoom = groupCallForUser(user.id);
        if (otherRoom && otherRoom.conversationId !== conversation.id) {
          socket.emit('group:call:unavailable', {
            conversationId: conversation.id,
            reason: 'You are already on a group call.',
          });
          return;
        }
      }

      const created = !room;
      if (!room) {
        room = {
          id: crypto.randomUUID(),
          conversationId: conversation.id,
          kind,
          startedBy: user.id,
          createdAt: new Date().toISOString(),
          participants: new Map(),
        };
        groupCallRooms.set(conversation.id, room);
      }

      addGroupParticipant(io, room, user, socket);

      if (!created) return;

      // Ring the focused tab of every other member who is online right now.
      for (const memberId of conversation.participantIds) {
        if (memberId === user.id) continue;
        const targetSocket = presence.activeSocketFor(memberId);
        if (!targetSocket) continue;

        io.to(targetSocket).emit('group:call:ringing', {
          callId: room.id,
          conversationId: conversation.id,
          title: conversation.title || 'Group chat',
          kind,
          from: publicUser(user, findUserById(memberId)),
          participantCount: room.participants.size,
        });
      }
    });

    /** Accepts a group-call ring and joins the running room. */
    socket.on('group:call:join', (payload = {}) => {
      const conversation = groupConversationFor(payload.conversationId, user.id, scope);
      if (!conversation) return;

      const room = groupCallRooms.get(conversation.id);
      if (!room) {
        socket.emit('group:call:unavailable', {
          conversationId: conversation.id,
          reason: 'That call has already ended.',
        });
        return;
      }

      if (!room.participants.has(user.id)) {
        const directReason = directCallBusyReason(user.id);
        if (directReason) {
          socket.emit('group:call:unavailable', {
            conversationId: conversation.id,
            reason: directReason,
          });
          return;
        }
        const otherRoom = groupCallForUser(user.id);
        if (otherRoom && otherRoom.conversationId !== conversation.id) {
          socket.emit('group:call:unavailable', {
            conversationId: conversation.id,
            reason: 'You are already on a group call.',
          });
          return;
        }
      }

      addGroupParticipant(io, room, user, socket);
    });

    socket.on('group:call:decline', (payload = {}) => {
      const room = groupCallRooms.get(payload.conversationId);
      if (!room) return;
      if (!room.participants.has(user.id)) {
        const conversation = groupConversationFor(payload.conversationId, user.id, scope);
        if (!conversation) return;
      }
      io.to(`user:${room.startedBy}`).emit('group:call:declined', {
        conversationId: room.conversationId,
        from: publicUser(user),
      });
    });

    socket.on('group:call:signal', (payload = {}) => {
      const room = groupCallRooms.get(payload.conversationId);
      if (!room) return;

      // Only the tab that owns this person's participation may signal.
      const sender = room.participants.get(user.id);
      if (!sender || sender.socketId !== socket.id) return;

      const target = room.participants.get(payload.to);
      if (!target) return;

      io.to(target.socketId).emit('group:call:signal', {
        conversationId: room.conversationId,
        callId: room.id,
        from: user.id,
        data: payload.data || null,
      });
    });

    socket.on('group:call:state', (payload = {}) => {
      const room = groupCallRooms.get(payload.conversationId);
      if (!room) return;
      const state = room.participants.get(user.id);
      if (!state || state.socketId !== socket.id) return;

      state.muted = !!payload.muted;
      state.cameraOn = !!payload.cameraOn;
      emitToRoom(
        io,
        room,
        'group:call:state',
        {
          conversationId: room.conversationId,
          callId: room.id,
          userId: user.id,
          muted: state.muted,
          cameraOn: state.cameraOn,
        },
        user.id,
      );
    });

    socket.on('group:call:leave', (payload = {}) => {
      const room = groupCallRooms.get(payload.conversationId);
      if (!room) return;
      const state = room.participants.get(user.id);
      if (!state || state.socketId !== socket.id) return;
      removeFromGroupCall(io, room, user.id, 'left');
    });

    socket.on('disconnect', async () => {
      for (const room of [...groupCallRooms.values()]) {
        const participant = room.participants.get(user.id);
        if (participant?.socketId === socket.id) {
          removeFromGroupCall(io, room, user.id, 'disconnected');
        }
      }

      // Tell the other end of any one-to-one call that this tab went away.
      for (const [conversationId, entry] of [...directCalls]) {
        let otherSocketId = null;
        let otherUserId = null;
        if (entry.callerSocketId === socket.id) {
          otherSocketId = entry.calleeSocketId;
          otherUserId = entry.calleeId;
        } else if (entry.calleeSocketId === socket.id) {
          otherSocketId = entry.callerSocketId;
          otherUserId = entry.callerId;
        }
        if (!otherSocketId) continue;

        directCalls.delete(conversationId);
        io.to(otherSocketId).emit('call:ended', {
          from: publicUser(user, findUserById(otherUserId)),
          conversationId,
          reason: 'offline',
        });
      }

      const wentOffline = presence.removeSocket(user.id, socket.id);
      if (!wentOffline) return;

      const dbUser = findUserById(user.id);
      if (dbUser) {
        dbUser.lastSeen = new Date().toISOString();
        try {
          await persistUser(dbUser);
        } catch (error) {
          console.warn(`[realtime] Could not persist last seen: ${error.message}`);
        }
      }
      io.to(`site:${scope}`).emit('presence:update', {
        userId: user.id,
        online: false,
        lastSeen: dbUser?.lastSeen || new Date().toISOString(),
      });
    });
  });
}
