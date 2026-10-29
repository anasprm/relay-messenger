import { findUserById, isGroupConversation, lastMessageFor, visibleMessagesFor } from './db.js';
import { isOnline } from './presence.js';

const ANONYMOUS_IDENTITY = {
  id: 'anonymous',
  username: 'anonymous',
  displayName: 'Anonymous Operator',
  accent: 'slate',
  online: false,
  lastSeen: null,
  anonymous: true,
};

export function publicUser(user, viewer = null) {
  if (!user) return null;
  const alias =
    viewer && viewer.id !== user.id && viewer.aliases
      ? viewer.aliases[user.id] || null
      : null;
  return {
    id: user.id,
    username: user.username,
    displayName: alias || user.displayName,
    accent: user.accent,
    avatarUrl: user.avatarUrl || null,
    discoverable: user.discoverable !== false,
    online: isOnline(user.id),
    lastSeen: user.lastSeen || null,
  };
}

export function serializeMessage(message, viewerId) {
  if (!message) return null;

  const sender = findUserById(message.senderId);
  const viewer = findUserById(viewerId);
  const masked = !!message.anonymous && message.senderId !== viewerId;
  const viewedBy = message.viewedBy || {};
  const mine = message.senderId === viewerId;

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: masked ? null : message.senderId,
    sender: masked ? { ...ANONYMOUS_IDENTITY } : publicUser(sender, viewer),
    kind: message.kind || 'text',
    text: message.text || '',
    attachment: message.attachment || null,
    anonymous: !!message.anonymous,
    ephemeral: !!message.ephemeral,
    viewOnce: !!message.viewOnce,
    // Sender sees whether it was opened; the recipient sees whether they opened it.
    viewOnceOpened: mine ? Object.keys(viewedBy).length > 0 : !!viewedBy[viewerId],
    reactions: message.reactions || {},
    createdAt: message.createdAt,
  };
}

export function unreadCount(conversation, viewerId) {
  const readAt = conversation.reads?.[viewerId] ? new Date(conversation.reads[viewerId]).getTime() : 0;
  return visibleMessagesFor(conversation, viewerId).filter(
    (message) =>
      message.senderId !== viewerId && new Date(message.createdAt).getTime() > readAt,
  ).length;
}

export function serializeConversation(conversation, viewerId) {
  const viewer = findUserById(viewerId);
  const group = isGroupConversation(conversation);
  // A group has no single "other" participant; the client shows the group title.
  const otherId = group
    ? null
    : conversation.participantIds.find((participantId) => participantId !== viewerId);
  const locked = !!conversation.locks?.[viewerId];
  const last = locked ? null : lastMessageFor(conversation.id, viewerId, conversation);

  return {
    id: conversation.id,
    kind: group ? 'group' : 'direct',
    title: group ? conversation.title || 'Group chat' : null,
    createdBy: group ? conversation.createdBy || null : null,
    memberCount: conversation.participantIds.length,
    participants: conversation.participantIds
      .map((participantId) => publicUser(findUserById(participantId), viewer))
      .filter(Boolean),
    other: group ? null : publicUser(findUserById(otherId), viewer),
    lastMessage: serializeMessage(last, viewerId),
    unreadCount: unreadCount(conversation, viewerId),
    modes: conversation.modes?.[viewerId] || { anonymity: false, vanish: false },
    locked,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}
