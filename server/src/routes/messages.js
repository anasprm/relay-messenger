import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getDb, saveDb } from '../db.js';
import { broadcastMessageUpdate } from '../realtime.js';
import { serializeMessage } from '../serializers.js';

const router = Router();
router.use(requireAuth);

const ALLOWED_REACTIONS = new Set(['❤️', '👍', '😂', '🎉', '👀', '✅']);

/** POST /api/messages/:id/reactions { emoji } — toggles the viewer's reaction. */
router.post('/:id/reactions', (req, res) => {
  const db = getDb();
  const message = db.messages.find((candidate) => candidate.id === req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found.' });

  const conversation = db.conversations.find(
    (candidate) =>
      candidate.id === message.conversationId &&
      candidate.participantIds.includes(req.user.id),
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

  saveDb();
  broadcastMessageUpdate(req.app.locals.io, message);
  res.json({ message: serializeMessage(message, req.user.id) });
});

export default router;
