import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { conversationFor, deleteMessagesByIds, getDb, persistMessage } from '../db.js';
import { broadcastMessageDeleted, broadcastMessageUpdate } from '../realtime.js';
import { serializeMessage } from '../serializers.js';
import { conversationScope } from '../site.js';
import { deleteUpload } from '../storage.js';

const router = Router();
router.use(requireAuth);

const ALLOWED_REACTIONS = new Set(['❤️', '👍', '😂', '🎉', '👀', '✅']);

/** How long the opener's browser has to fetch a view-once file before it is erased. */
const VIEW_ONCE_GRACE_MS = 90_000;

/** POST /api/messages/:id/reactions { emoji } — toggles the viewer's reaction. */
router.post('/:id/reactions', async (req, res, next) => {
  try {
    const db = getDb();
    const message = db.messages.find((candidate) => candidate.id === req.params.id);
    if (!message) return res.status(404).json({ error: 'Message not found.' });

    const conversation = db.conversations.find(
      (candidate) =>
        candidate.id === message.conversationId &&
        candidate.participantIds.includes(req.user.id) &&
        conversationScope(candidate) === req.scope,
    );
    if (!conversation) return res.status(404).json({ error: 'Message not found.' });

    const emoji = String(req.body?.emoji || '❤️');
    if (!ALLOWED_REACTIONS.has(emoji)) {
      return res.status(400).json({ error: 'Unsupported reaction.' });
    }

    message.reactions = message.reactions || {};
    if (message.reactions[req.user.id] === emoji) {
      delete message.reactions[req.user.id];
    } else {
      message.reactions[req.user.id] = emoji;
    }

    await persistMessage(message);
    broadcastMessageUpdate(req.app.locals.io, message);
    res.json({ message: serializeMessage(message, req.user.id) });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/messages/:id/view
 * Opens a view-once photo or video. The recipient may do this once: the media
 * is removed from the message (and erased from storage shortly after) so it
 * cannot be reopened by either side.
 */
router.post('/:id/view', async (req, res, next) => {
  try {
    const message = getDb().messages.find((candidate) => candidate.id === req.params.id);
    if (!message || !message.viewOnce) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    const conversation = conversationFor(req.user.id, message.conversationId, req.scope);
    if (!conversation) return res.status(404).json({ error: 'Message not found.' });

    if (message.senderId === req.user.id) {
      return res.status(400).json({ error: 'You cannot open your own view-once message.' });
    }
    if (message.viewedBy?.[req.user.id] || !message.attachment) {
      return res.status(410).json({ error: 'This view-once message was already opened.' });
    }

    const attachment = message.attachment;
    const openedAt = new Date().toISOString();

    message.viewedBy = { ...(message.viewedBy || {}), [req.user.id]: openedAt };
    message.openedAt = message.openedAt || openedAt;
    message.attachment = null;
    await persistMessage(message);
    broadcastMessageUpdate(req.app.locals.io, message);

    // The browser has the signed URL now; erase the file after a short grace
    // period so the single view is genuinely the last one.
    const timer = setTimeout(() => {
      void deleteUpload(attachment.url);
    }, VIEW_ONCE_GRACE_MS);
    timer.unref?.();

    res.json({
      url: attachment.url,
      name: attachment.name,
      mime: attachment.mime,
      kind: attachment.kind || message.kind,
      openedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/messages/:id
 * Unsend: removes the message for both participants and erases its media.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const message = db.messages.find((candidate) => candidate.id === req.params.id);
    if (!message) return res.status(404).json({ error: 'Message not found.' });

    const conversation = conversationFor(req.user.id, message.conversationId, req.scope);
    if (!conversation) return res.status(404).json({ error: 'Message not found.' });

    if (message.senderId !== req.user.id) {
      return res.status(403).json({ error: 'You can only unsend your own messages.' });
    }

    const attachmentUrl = message.attachment?.url || null;
    db.messages = db.messages.filter((candidate) => candidate.id !== message.id);
    await deleteMessagesByIds([message.id]);

    broadcastMessageDeleted(req.app.locals.io, conversation, message.id);
    if (attachmentUrl) void deleteUpload(attachmentUrl);

    res.json({ ok: true, id: message.id, conversationId: conversation.id });
  } catch (error) {
    next(error);
  }
});

export default router;
