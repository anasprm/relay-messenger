import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  conversationFor,
  deleteMessagesByIds,
  findConversation,
  findUserByUsername,
  getDb,
  lastMessageFor,
  messagesFor,
  persistConversation,
  persistMessage,
} from '../db.js';
import { serializeConversation, serializeMessage } from '../serializers.js';
import {
  broadcastConversationRefresh,
  broadcastMessage,
  broadcastModes,
  broadcastPurge,
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
    .conversations.filter((conversation) => conversation.participantIds.includes(req.user.id))
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
        .filter((conversation) => conversation.participantIds.includes(req.user.id))
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
    const other = findUserByUsername(username);

    if (!other) return res.status(404).json({ error: 'No account found with that username.' });
    if (other.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot start a conversation with yourself.' });
    }

    const db = getDb();
    let conversation = db.conversations.find(
      (candidate) =>
        candidate.participantIds.length === 2 &&
        candidate.participantIds.includes(req.user.id) &&
        candidate.participantIds.includes(other.id),
    );

    if (!conversation) {
      conversation = {
        id: crypto.randomUUID(),
        participantIds: [req.user.id, other.id],
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

/** GET /api/conversations/:id/messages */
router.get('/:id/messages', (req, res) => {
  const conversation = conversationFor(req.user.id, req.params.id);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const messages = messagesFor(conversation.id).slice(-limit);

  res.json({
    messages: messages.map((message) => serializeMessage(message, req.user.id)),
    conversation: serializeConversation(conversation, req.user.id),
  });
});

/** POST /api/conversations/:id/messages */
router.post('/:id/messages', async (req, res, next) => {
  try {
    const conversation = conversationFor(req.user.id, req.params.id);
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

    const message = {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      senderId: req.user.id,
      kind,
      text,
      attachment,
      anonymous: !!modes.anonymity,
      ephemeral: !!modes.vanish,
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
    const conversation = conversationFor(req.user.id, req.params.id);
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
    const conversation = conversationFor(req.user.id, req.params.id);
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
    const conversation = conversationFor(req.user.id, req.params.id);
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

/** GET /api/conversations/:id — single thread refresh. */
router.get('/:id', (req, res) => {
  const conversation = findConversation(req.params.id);
  if (!conversation || !conversation.participantIds.includes(req.user.id)) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const lastMessage = lastMessageFor(conversation.id);

  res.json({
    conversation: serializeConversation(conversation, req.user.id),
    lastMessage: lastMessage ? serializeMessage(lastMessage, req.user.id) : null,
  });
});

export default router;
