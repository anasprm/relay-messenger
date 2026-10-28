import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth, signToken, hashPassword, verifyPassword } from '../auth.js';
import { PRIVATE_INVITE_CODE } from '../config.js';
import { findUserByUsername, getDb, persistUser } from '../db.js';
import { publicUser } from '../serializers.js';
import { requestScope, userScope, wrongWorkspaceMessage } from '../site.js';

const router = Router();

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const RESERVED = new Set(['anonymous', 'admin', 'system', 'relay', 'support', 'me']);

function titleCase(value) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

/**
 * Private sign-ups can be invite-only. When no invite code is configured the
 * private workspace stays open, so a fresh deployment is usable immediately.
 */
function privateSignupError(req) {
  if (!PRIVATE_INVITE_CODE) return null;
  const supplied = String(req.body?.inviteCode || '')
    .trim()
    .toLowerCase();
  if (!supplied || supplied !== PRIVATE_INVITE_CODE.toLowerCase()) {
    return 'That invite code is not valid.';
  }
  return null;
}

/** GET /api/auth/config — public flags the sign-up screen needs. */
router.get('/config', (req, res) => {
  res.json({
    scope: requestScope(req),
    privateInviteRequired: !!PRIVATE_INVITE_CODE,
  });
});

router.post('/register', async (req, res, next) => {
  try {
    const scope = requestScope(req);
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const displayNameInput = String(req.body?.displayName || '').trim();

    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: 'Username must be 3–20 characters: letters, numbers, or underscores.',
      });
    }
    if (RESERVED.has(username)) {
      return res.status(400).json({ error: 'That username is reserved. Please pick another.' });
    }
    if (password.length < 6 || Buffer.byteLength(password) > 72) {
      return res.status(400).json({ error: 'Password must be at least 6 characters (max 72 bytes).' });
    }

    if (scope === 'private') {
      const inviteError = privateSignupError(req);
      if (inviteError) return res.status(403).json({ error: inviteError, code: 'invite-required' });
    }

    if (findUserByUsername(username, scope)) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }

    const db = getDb();
    const user = {
      id: crypto.randomUUID(),
      username,
      displayName: displayNameInput.slice(0, 40) || titleCase(username),
      accent: ['indigo', 'violet', 'emerald', 'amber', 'rose', 'cyan'][db.users.length % 6],
      passwordHash: hashPassword(password),
      scope,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    db.users.push(user);
    await persistUser(user);

    res.status(201).json({ token: signToken(user), user: publicUser(user), scope });
  } catch (error) {
    next(error);
  }
});

router.post('/login', (req, res) => {
  const scope = requestScope(req);
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = findUserByUsername(username, scope);

  if (!user) {
    // The same username may exist in the other workspace. Saying so is more
    // useful than a generic failure, and it reveals nothing about passwords.
    const other = findUserByUsername(username);
    if (other) {
      return res.status(403).json({
        error: wrongWorkspaceMessage(userScope(other)),
        code: 'wrong-workspace',
        scope: userScope(other),
      });
    }
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  res.json({ token: signToken(user), user: publicUser(user), scope });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), scope: req.scope });
});

export default router;
