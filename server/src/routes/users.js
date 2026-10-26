import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getDb } from '../db.js';
import { publicUser } from '../serializers.js';

const router = Router();
router.use(requireAuth);

/** GET /api/users/search?q=ali — directory search by username or display name. */
router.get('/search', (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();

  const db = getDb();
  const users = db.users
    .filter((user) => user.id !== req.user.id)
    .filter(
      (user) =>
        !query ||
        user.username.includes(query) ||
        user.displayName.toLowerCase().includes(query),
    )
    .sort((a, b) => {
      const aExact = a.username === query ? 0 : a.username.startsWith(query) ? 1 : 2;
      const bExact = b.username === query ? 0 : b.username.startsWith(query) ? 1 : 2;
      return aExact - bExact || a.username.localeCompare(b.username);
    })
    .slice(0, 8)
    .map((user) => publicUser(user));

  res.json({ users });
});

/** GET /api/users/:username — exact lookup, used by "start a chat". */
router.get('/:username', (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();
  const user = getDb().users.find((candidate) => candidate.username === username);

  if (!user || user.id === req.user.id) {
    return res.status(404).json({ error: 'No account found with that username.' });
  }

  res.json({ user: publicUser(user) });
});

export default router;
