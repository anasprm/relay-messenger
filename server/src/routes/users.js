import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getDb, persistUser } from '../db.js';
import { publicUser } from '../serializers.js';
import { userScope } from '../site.js';
import { isSafeAvatarUrl, sanitizeText } from '../utils.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/users/search?q=ali — directory search inside the current workspace.
 * Accounts that opted out of the directory only appear when the query is their
 * exact username, so they can still be reached deliberately but never listed.
 */
router.get('/search', (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();

  const db = getDb();
  const users = db.users
    .filter((user) => user.id !== req.user.id)
    .filter((user) => userScope(user) === req.scope)
    .filter((user) => user.discoverable !== false || user.username === query)
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
    .map((user) => publicUser(user, req.user));

  res.json({ users, scope: req.scope });
});

/**
 * PATCH /api/users/me — profile details and directory privacy.
 * Only the signed-in account can change its own record.
 */
router.patch('/me', async (req, res, next) => {
  try {
    const user = req.user;
    const body = req.body || {};

    if (body.displayName !== undefined) {
      const displayName = sanitizeText(body.displayName, 40).trim();
      if (displayName.length < 2) {
        return res.status(400).json({ error: 'Display name must be at least 2 characters.' });
      }
      user.displayName = displayName;
    }

    if (body.avatarUrl !== undefined) {
      if (body.avatarUrl === null || body.avatarUrl === '') {
        user.avatarUrl = null;
      } else {
        const avatarUrl = String(body.avatarUrl);
        if (!isSafeAvatarUrl(avatarUrl)) {
          return res.status(400).json({ error: 'Invalid profile photo URL.' });
        }
        user.avatarUrl = avatarUrl;
      }
    }

    if (typeof body.discoverable === 'boolean') {
      user.discoverable = body.discoverable;
    }

    await persistUser(user);
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/users/me/aliases/:userId — a private nickname for one contact.
 * Only the caller's record changes; the other person keeps their own name.
 */
router.put('/me/aliases/:userId', async (req, res, next) => {
  try {
    const target = getDb().users.find((candidate) => candidate.id === req.params.userId);
    if (!target || userScope(target) !== req.scope) {
      return res.status(404).json({ error: 'No account found with that id.' });
    }
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot rename your own account here.' });
    }

    const raw = String(req.body?.name ?? '').trim();
    const aliases = { ...(req.user.aliases || {}) };

    if (!raw) {
      delete aliases[target.id];
    } else {
      const name = sanitizeText(raw, 40).trim();
      if (!name) {
        return res.status(400).json({ error: 'Enter a name or leave it empty to reset.' });
      }
      aliases[target.id] = name;
    }

    req.user.aliases = aliases;
    await persistUser(req.user);
    res.json({ user: publicUser(req.user), other: publicUser(target, req.user) });
  } catch (error) {
    next(error);
  }
});

/** GET /api/users/:username — exact lookup, used by "start a chat". */
router.get('/:username', (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();
  const user = getDb().users.find(
    (candidate) => candidate.username === username && userScope(candidate) === req.scope,
  );

  if (!user || user.id === req.user.id) {
    return res.status(404).json({ error: 'No account found with that username.' });
  }

  res.json({ user: publicUser(user, req.user) });
});

export default router;
