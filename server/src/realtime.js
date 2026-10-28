import { findConversation, findUserById, persistUser } from './db.js';
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
      const conversation = conversationBetween(payload.conversationId, user.id, payload.to, scope);
      if (!conversation) return;

      io.to(`user:${payload.to}`).emit('typing:update', {
        conversationId: conversation.id,
        userId: user.id,
        typing: !!payload.typing,
      });
    });

    socket.on('call:invite', (payload = {}) => {
      const conversation = conversationBetween(payload.conversationId, user.id, payload.to, scope);
      if (!conversation) return;

      if (!presence.isOnline(payload.to)) {
        socket.emit('call:unavailable', {
          conversationId: conversation.id,
          reason: 'This person is offline right now.',
        });
        return;
      }

      io.to(`user:${payload.to}`).emit('call:incoming', {
        from: publicUser(user),
        conversationId: conversation.id,
        kind: payload.kind === 'video' ? 'video' : 'audio',
        sdp: payload.sdp || null,
      });
    });

    socket.on('call:accept', (payload = {}) => {
      if (!conversationBetween(payload.conversationId, user.id, payload.to, scope)) return;
      io.to(`user:${payload.to}`).emit('call:accepted', {
        from: publicUser(user),
        conversationId: payload.conversationId,
      });
    });

    socket.on('call:answer', (payload = {}) => {
      if (!conversationBetween(payload.conversationId, user.id, payload.to, scope)) return;
      if (!payload.sdp) return;

      io.to(`user:${payload.to}`).emit('call:answer', {
        from: user.id,
        conversationId: payload.conversationId,
        sdp: payload.sdp,
      });
    });

    socket.on('call:decline', (payload = {}) => {
      if (!conversationBetween(payload.conversationId, user.id, payload.to, scope)) return;
      io.to(`user:${payload.to}`).emit('call:declined', {
        from: publicUser(user),
        conversationId: payload.conversationId,
        reason: payload.reason || 'declined',
      });
    });

    socket.on('call:signal', (payload = {}) => {
      if (!conversationBetween(payload.conversationId, user.id, payload.to, scope)) return;
      io.to(`user:${payload.to}`).emit('call:signal', {
        from: user.id,
        conversationId: payload.conversationId,
        data: payload.data || null,
      });
    });

    socket.on('call:end', (payload = {}) => {
      if (!conversationBetween(payload.conversationId, user.id, payload.to, scope)) return;
      io.to(`user:${payload.to}`).emit('call:ended', {
        from: publicUser(user),
        conversationId: payload.conversationId,
        reason: payload.reason || 'ended',
      });
    });

    socket.on('disconnect', async () => {
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
