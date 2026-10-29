import crypto from 'node:crypto';
import { Router } from 'express';
import { hashPassword, requireAuth, verifyPassword } from '../auth.js';
import {
  conversationFor,
  deleteConversation,
  deleteMessagesByIds,
  findUserByUsername,
  getDb,
  isGroupConversation,
  lastMessageFor,
  persistConversation,
  persistMessage,
  visibleMessagesFor,
} from '../db.js';
import { serializeConversation, serializeMessage } from '../serializers.js';
import { conversationScope } from '../site.js';
import {
  broadcastConversationRefresh,
  broadcastConversationRemoved,
  broadcastMessage,
  broadcastModes,
  broadcastPurge,
  removeUserFromGroupCall,
} from '../realtime.js';
import {
  MESSAGE_KINDS,
  clampDuration,
  inferKind,
  isSafeUploadUrl,
  sanitizeFileName,
  sanitizeText,
} from '../utils.js';

const router = Router();
router.use(requireAuth);

function sortConversations(conversations) {
  return conversations.sort(
    (a, b) =>
      new Date(b.lastMessage?.createdAt || b.updatedAt).getTime() -
      new Date(a.lastMessage?.createdAt || a.updatedAt).getTime(),
  );
}

/** GET /api/conversations — sidebar data for the signed-in user. */
router.get('/', (req, res) => {
  const conversations = getDb()
    .conversations.filter(
      (conversation) =>
        conversation.participantIds.includes(req.user.id) &&
        conversationScope(conversation) === req.scope,
    )
    .map((conversation) => serializeConversation(conversation, req.user.id));

  res.json({ conversations: sortConversations(conversations) });
});

/**
 * POST /api/conversations/purge-ephemeral
 * Called on page load. Any vanish-mode message left behind is destroyed.
 */
router.post('/purge-ephemeral', async (req, res, next) => {
  try {
    const db = getDb();
    const io = req.app.locals.io;
    const conversationIds = new Set(
      db.conversations
        .filter(
          (conversation) =>
            conversation.participantIds.includes(req.user.id) &&
            conversationScope(conversation) === req.scope,
        )
        .map((conversation) => conversation.id),
    );

    const purgedByConversation = new Map();
    const purgedIds = [];
    db.messages = db.messages.filter((message) => {
      if (!message.ephemeral || !conversationIds.has(message.conversationId)) return true;
      const ids = purgedByConversation.get(message.conversationId) || [];
      ids.push(message.id);
      purgedIds.push(message.id);
      purgedByConversation.set(message.conversationId, ids);
      return false;
    });

    if (purgedIds.length > 0) {
      await deleteMessagesByIds(purgedIds);
      for (const [conversationId, ids] of purgedByConversation) {
        broadcastPurge(io, conversationId, ids);
      }
    }

    res.json({ purged: purgedIds.length });
  } catch (error) {
    next(error);
  }
});

/** POST /api/conversations { username } — get-or-create a direct thread. */
router.post('/', async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const other = findUserByUsername(username, req.scope);

    if (!other) return res.status(404).json({ error: 'No account found with that username.' });
    if (other.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot start a conversation with yourself.' });
    }

    const db = getDb();
    let conversation = db.conversations.find(
      (candidate) =>
        !isGroupConversation(candidate) &&
        candidate.participantIds.length === 2 &&
        candidate.participantIds.includes(req.user.id) &&
        candidate.participantIds.includes(other.id) &&
        conversationScope(candidate) === req.scope,
    );

    if (!conversation) {
      conversation = {
        id: crypto.randomUUID(),
        participantIds: [req.user.id, other.id],
        scope: req.scope,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        modes: {
          [req.user.id]: { anonymity: false, vanish: false },
          [other.id]: { anonymity: false, vanish: false },
        },
        reads: {},
      };
      db.conversations.push(conversation);
      await persistConversation(conversation);
      broadcastConversationRefresh(req.app.locals.io, conversation);
    }

    res.status(201).json({ conversation: serializeConversation(conversation, req.user.id) });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ *
 * Group chats — private family workspace only.
 * ------------------------------------------------------------------ */

const GROUP_MEMBER_LIMIT = 50;

function cleanGroupTitle(value) {
  return sanitizeText(value, 40).replace(/\s+/g, ' ').trim();
}

/** Resolves :id to a group the caller belongs to, or null. */
function groupFor(req) {
  const conversation = conversationFor(req.user.id, req.params.id, req.scope);
  return isGroupConversation(conversation) ? conversation : null;
}

function newModesFor(participantIds) {
  const modes = {};
  for (const participantId of participantIds) {
    modes[participantId] = { anonymity: false, vanish: false };
  }
  return modes;
}

/**
 * POST /api/conversations/group { title, usernames }
 * Creates a named group with the caller and at least two other members.
 */
router.post('/group', async (req, res, next) => {
  try {
    if (req.scope !== 'private') {
      return res.status(403).json({
        error: 'Group chats are only available in the family workspace.',
      });
    }

    const title = cleanGroupTitle(req.body?.title);
    if (title.length < 2) {
      return res.status(400).json({ error: 'Give the group a name of at least 2 characters.' });
    }

    const requested = Array.isArray(req.body?.usernames) ? req.body.usernames : [];
    const members = [];
    for (const raw of requested.slice(0, GROUP_MEMBER_LIMIT)) {
      const username = String(raw || '').trim().toLowerCase();
      if (!username) continue;

      const member = findUserByUsername(username, req.scope);
      if (!member) {
        return res.status(404).json({ error: `No account found with the username @${username}.` });
      }
      if (member.id === req.user.id || members.some((entry) => entry.id === member.id)) continue;
      members.push(member);
    }

    if (members.length < 2) {
      return res.status(400).json({ error: 'Pick at least two people for the group.' });
    }

    const now = new Date().toISOString();
    const participantIds = [req.user.id, ...members.map((member) => member.id)];
    const conversation = {
      id: crypto.randomUUID(),
      kind: 'group',
      title,
      createdBy: req.user.id,
      participantIds,
      scope: req.scope,
      createdAt: now,
      updatedAt: now,
      modes: newModesFor(participantIds),
      reads: { [req.user.id]: now },
    };

    getDb().conversations.push(conversation);
    await persistConversation(conversation);
    broadcastConversationRefresh(req.app.locals.io, conversation);

    res.status(201).json({ conversation: serializeConversation(conversation, req.user.id) });
  } catch (error) {
    next(error);
  }
});

/** PATCH /api/conversations/:id/group { title } — creator renames the group. */
router.patch('/:id/group', async (req, res, next) => {
  try {
    const conversation = groupFor(req);
    if (!conversation) return res.status(404).json({ error: 'Group not found.' });
    if (conversation.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Only the group creator can rename it.' });
    }

    const title = cleanGroupTitle(req.body?.title);
    if (title.length < 2) {
      return res.status(400).json({ error: 'Give the group a name of at least 2 characters.' });
    }

    conversation.title = title;
    await persistConversation(conversation);
    broadcastConversationRefresh(req.app.locals.io, conversation);

    res.json({ conversation: serializeConversation(conversation, req.user.id) });
  } catch (error) {
    next(error);
  }
});

/** POST /api/conversations/:id/members { username } — creator adds a member. */
router.post('/:id/members', async (req, res, next) => {
  try {
    const conversation = groupFor(req);
    if (!conversation) return res.status(404).json({ error: 'Group not found.' });
    if (conversation.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Only the group creator can add members.' });
    }

    const username = String(req.body?.username || '').trim().toLowerCase();
    const member = findUserByUsername(username, req.scope);
    if (!member) {
      return res.status(404).json({ error: 'No account found with that username.' });
    }
    if (conversation.participantIds.includes(member.id)) {
      return res.status(409).json({ error: 'That person is already in this group.' });
    }
    if (conversation.participantIds.length >= GROUP_MEMBER_LIMIT) {
      return res.status(400).json({ error: 'This group is full.' });
    }

    conversation.participantIds.push(member.id);
    conversation.modes = conversation.modes || {};
    conversation.modes[member.id] = { anonymity: false, vanish: false };
    conversation.reads = conversation.reads || {};
    conversation.reads[member.id] = new Date().toISOString();
    await persistConversation(conversation);

    broadcastConversationRefresh(req.app.locals.io, conversation);
    res.json({ conversation: serializeConversation(conversation, req.user.id) });
  } catch (error) {
    next(error);
  }
});

/** DELETE /api/conversations/:id/members/:userId — creator removes a member. */
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const conversation = groupFor(req);
    if (!conversation) return res.status(404).json({ error: 'Group not found.' });
    if (conversation.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Only the group creator can remove members.' });
    }

    const targetId = req.params.userId;
    if (!conversation.participantIds.includes(targetId)) {
      return res.status(404).json({ error: 'That person is not in this group.' });
    }
    if (targetId === conversation.createdBy) {
      return res.status(400).json({ error: 'The group creator cannot be removed.' });
    }

    conversation.participantIds = conversation.participantIds.filter((id) => id !== targetId);
    if (conversation.modes) delete conversation.modes[targetId];
    if (conversation.reads) delete conversation.reads[targetId];
    if (conversation.clearedAt) delete conversation.clearedAt[targetId];
    if (conversation.locks) delete conversation.locks[targetId];
    await persistConversation(conversation);

    broadcastConversationRemoved(req.app.locals.io, conversation, targetId);
    removeUserFromGroupCall(req.app.locals.io, conversation.id, targetId);
    broadcastConversationRefresh(req.app.locals.io, conversation);
    res.json({ ok: true, participantIds: conversation.participantIds });
  } catch (error) {
    next(error);
  }
});

/** POST /api/conversations/:id/leave — leave a group you were added to. */
router.post('/:id/leave', async (req, res, next) => {
  try {
    const conversation = groupFor(req);
    if (!conversation) return res.status(404).json({ error: 'Group not found.' });

    const remaining = conversation.participantIds.filter((id) => id !== req.user.id);
    conversation.participantIds = remaining;
    if (conversation.modes) delete conversation.modes[req.user.id];
    if (conversation.reads) delete conversation.reads[req.user.id];
    if (conversation.clearedAt) delete conversation.clearedAt[req.user.id];
    if (conversation.locks) delete conversation.locks[req.user.id];

    broadcastConversationRemoved(req.app.locals.io, conversation, req.user.id);
    removeUserFromGroupCall(req.app.locals.io, conversation.id, req.user.id, 'left');

    if (remaining.length === 0) {
      // Nobody left: drop the thread and its messages instead of leaving an
      // unreachable conversation behind.
      const db = getDb();
      const ids = db.messages
        .filter((message) => message.conversationId === conversation.id)
        .map((message) => message.id);
      db.conversations = db.conversations.filter((entry) => entry.id !== conversation.id);
      if (ids.length > 0) {
        db.messages = db.messages.filter((message) => message.conversationId !== conversation.id);
        await deleteMessagesByIds(ids);
      }
      await deleteConversation(conversation.id);
      return res.json({ ok: true });
    }

    if (conversation.createdBy === req.user.id) {
      conversation.createdBy = remaining[0];
    }
    await persistConversation(conversation);
    broadcastConversationRefresh(req.app.locals.io, conversation);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/** GET /api/conversations/:id/messages */
router.get('/:id/messages', (req, res) => {
  const conversation = conversationFor(req.user.id, req.params.id, req.scope);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const messages = visibleMessagesFor(conversation, req.user.id).slice(-limit);

  res.json({
    messages: messages.map((message) => serializeMessage(message, req.user.id)),
    conversation: serializeConversation(conversation, req.user.id),
  });
});

/** POST /api/conversations/:id/messages */
router.post('/:id/messages', async (req, res, next) => {
  try {
    const conversation = conversationFor(req.user.id, req.params.id, req.scope);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const text = sanitizeText(req.body?.text);
    const rawAttachment = req.body?.attachment;

    let attachment = null;
    if (rawAttachment) {
      if (!isSafeUploadUrl(rawAttachment.url)) {
        return res.status(400).json({ error: 'Invalid attachment URL.' });
      }
      const mime = sanitizeText(rawAttachment.mime, 120) || 'application/octet-stream';
      attachment = {
        url: rawAttachment.url,
        name: sanitizeFileName(rawAttachment.name),
        mime,
        size: Math.max(0, Number(rawAttachment.size) || 0),
        kind: inferKind(mime),
        duration: clampDuration(rawAttachment.duration),
        width: Number(rawAttachment.width) || undefined,
        height: Number(rawAttachment.height) || undefined,
      };
    }

    let kind = MESSAGE_KINDS.has(req.body?.kind) ? req.body.kind : 'text';
    if (attachment) {
      kind = kind === 'text' || !MESSAGE_KINDS.has(kind) ? attachment.kind : kind;
    } else {
      kind = 'text';
    }

    if (!text && !attachment) {
      return res.status(400).json({ error: 'A message needs text or an attachment.' });
    }

    const modes = conversation.modes?.[req.user.id] || { anonymity: false, vanish: false };

    const viewOnce =
      !!req.body?.viewOnce &&
      !!attachment &&
      (attachment.kind === 'image' || attachment.kind === 'video');

    const message = {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      senderId: req.user.id,
      kind,
      text,
      attachment,
      anonymous: !!modes.anonymity,
      ephemeral: !!modes.vanish,
      ...(viewOnce ? { viewOnce: true, viewedBy: {}, openedAt: null } : {}),
      reactions: {},
      createdAt: new Date().toISOString(),
    };

    getDb().messages.push(message);
    conversation.updatedAt = message.createdAt;
    conversation.reads = conversation.reads || {};
    conversation.reads[req.user.id] = message.createdAt;

    await Promise.all([persistMessage(message), persistConversation(conversation)]);

    broadcastMessage(req.app.locals.io, message);
    res.status(201).json({ message: serializeMessage(message, req.user.id) });
  } catch (error) {
    next(error);
  }
});

/** POST /api/conversations/:id/read */
router.post('/:id/read', async (req, res, next) => {
  try {
    const conversation = conversationFor(req.user.id, req.params.id, req.scope);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    conversation.reads = conversation.reads || {};
    conversation.reads[req.user.id] = new Date().toISOString();
    await persistConversation(conversation);

    res.json({ ok: true, unreadCount: 0 });
  } catch (error) {
    next(error);
  }
});

/** PATCH /api/conversations/:id/modes { anonymity?, vanish? } */
router.patch('/:id/modes', async (req, res, next) => {
  try {
    const conversation = conversationFor(req.user.id, req.params.id, req.scope);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    conversation.modes = conversation.modes || {};
    const current = conversation.modes[req.user.id] || { anonymity: false, vanish: false };
    conversation.modes[req.user.id] = {
      anonymity:
        typeof req.body?.anonymity === 'boolean' ? req.body.anonymity : current.anonymity,
      vanish: typeof req.body?.vanish === 'boolean' ? req.body.vanish : current.vanish,
    };
    await persistConversation(conversation);

    broadcastModes(req.app.locals.io, conversation);
    res.json({ modes: conversation.modes[req.user.id] });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/conversations/:id/purge
 * Fired when the thread is closed. Deletes vanish-mode messages for both sides.
 */
router.post('/:id/purge', async (req, res, next) => {
  try {
    const conversation = conversationFor(req.user.id, req.params.id, req.scope);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const db = getDb();
    const ids = db.messages
      .filter((message) => message.conversationId === conversation.id && message.ephemeral)
      .map((message) => message.id);

    if (ids.length > 0) {
      const idSet = new Set(ids);
      db.messages = db.messages.filter((message) => !idSet.has(message.id));
      await deleteMessagesByIds(ids);
      broadcastPurge(req.app.locals.io, conversation.id, ids);
    }

    res.json({ purged: ids.length });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/conversations/:id/clear
 * Clears the thread from the caller's copy only. The other participant keeps
 * their messages, exactly like clearing a chat on a phone.
 */
router.post('/:id/clear', async (req, res, next) => {
  try {
    const conversation = conversationFor(req.user.id, req.params.id, req.scope);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    conversation.clearedAt = conversation.clearedAt || {};
    conversation.clearedAt[req.user.id] = new Date().toISOString();
    await persistConversation(conversation);

    res.json({ ok: true, clearedAt: conversation.clearedAt[req.user.id] });
  } catch (error) {
    next(error);
  }
});

/**
 * Chat lock is optional and private to each participant: one side can lock a
 * thread without changing what the other side sees. The PIN is stored as a
 * bcrypt hash on the conversation record.
 */
function pinError(pin) {
  if (!/^\d{4,8}$/.test(pin)) return 'PIN must be 4–8 digits.';
  return null;
}

/** PUT /api/conversations/:id/lock { pin } — lock (or re-key) this thread. */
router.put('/:id/lock', async (req, res, next) => {
  try {
    const conversation = conversationFor(req.user.id, req.params.id, req.scope);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const pin = String(req.body?.pin || '');
    const invalid = pinError(pin);
    if (invalid) return res.status(400).json({ error: invalid });

    conversation.locks = conversation.locks || {};
    conversation.locks[req.user.id] = {
      pinHash: hashPassword(pin),
      createdAt: new Date().toISOString(),
    };
    await persistConversation(conversation);

    res.json({ locked: true });
  } catch (error) {
    next(error);
  }
});

/** POST /api/conversations/:id/unlock { pin } — verify the PIN for this session. */
router.post('/:id/unlock', async (req, res, next) => {
  try {
    const conversation = conversationFor(req.user.id, req.params.id, req.scope);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const lock = conversation.locks?.[req.user.id];
    if (!lock) return res.json({ ok: true, locked: false });

    const pin = String(req.body?.pin || '');
    if (!verifyPassword(pin, lock.pinHash)) {
      return res.status(403).json({ error: 'Incorrect PIN.' });
    }

    res.json({ ok: true, locked: false });
  } catch (error) {
    next(error);
  }
});

/** DELETE /api/conversations/:id/lock { pin } — remove the lock entirely. */
router.delete('/:id/lock', async (req, res, next) => {
  try {
    const conversation = conversationFor(req.user.id, req.params.id, req.scope);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const lock = conversation.locks?.[req.user.id];
    if (!lock) return res.json({ locked: false });

    const pin = String(req.body?.pin || '');
    if (!verifyPassword(pin, lock.pinHash)) {
      return res.status(403).json({ error: 'Incorrect PIN.' });
    }

    delete conversation.locks[req.user.id];
    await persistConversation(conversation);

    res.json({ locked: false });
  } catch (error) {
    next(error);
  }
});

/** GET /api/conversations/:id — single thread refresh. */
router.get('/:id', (req, res) => {
  const conversation = conversationFor(req.user.id, req.params.id, req.scope);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const lastMessage = lastMessageFor(conversation.id, req.user.id, conversation);

  res.json({
    conversation: serializeConversation(conversation, req.user.id),
    lastMessage: lastMessage ? serializeMessage(lastMessage, req.user.id) : null,
  });
});

export default router;
