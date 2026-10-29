import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth, signToken, hashPassword, verifyPassword } from '../auth.js';
import { LAUNCH_CODE_TTL_MS, PRIVATE_INVITE_CODE } from '../config.js';
import {
  findUserById,
  findUserByUsername,
  getDb,
  persistLaunchCode,
  persistUser,
} from '../db.js';
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

/**
 * POST /api/auth/refresh — slides the session forward while the app is used, so
 * an active device never needs a long-lived credential.
 */
router.post('/refresh', requireAuth, (req, res) => {
  res.json({ token: signToken(req.user), user: publicUser(req.user), scope: req.scope });
});

const codeHash = (code) => crypto.createHash('sha256').update(code).digest('hex');

/** Drop expired launch codes from memory so the list cannot grow forever. */
function pruneLaunchCodes(db, now = Date.now()) {
  const cutoff = now - 24 * 60 * 60 * 1000;
  db.launchCodes = db.launchCodes.filter(
    (record) => new Date(record.expiresAt).getTime() > cutoff,
  );
}

/**
 * POST /api/auth/launch — mint a single-use sign-in code for a shortcut or a
 * phone. The code is stored hashed and dies the first time it is redeemed, so a
 * copied link stops working as soon as it has been opened once.
 */
router.post('/launch', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    pruneLaunchCodes(db);

    const now = Date.now();
    const code = crypto.randomBytes(32).toString('base64url');
    const record = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      username: req.user.username,
      scope: req.scope,
      hash: codeHash(code),
      label: String(req.body?.label || '').trim().slice(0, 60),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + LAUNCH_CODE_TTL_MS).toISOString(),
      usedAt: null,
    };

    db.launchCodes.push(record);
    await persistLaunchCode(record);

    res.status(201).json({
      code,
      expiresAt: record.expiresAt,
      scope: record.scope,
      username: req.user.username,
    });
  } catch (error) {
    next(error);
  }
});

/** POST /api/auth/launch/redeem — exchange a one-time code for a session. */
router.post('/launch/redeem', async (req, res, next) => {
  try {
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ error: 'A launch code is required.' });

    const db = getDb();
    const record = db.launchCodes.find((entry) => entry.hash === codeHash(code));
    if (!record || record.revokedAt) {
      return res.status(401).json({ error: 'This launch link is not valid.', code: 'launch-invalid' });
    }
    if (record.usedAt) {
      return res.status(401).json({
        error: 'This launch link has already been used. Create a new one.',
        code: 'launch-used',
      });
    }
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return res.status(401).json({
        error: 'This launch link has expired. Create a new one.',
        code: 'launch-expired',
      });
    }

    const scope = requestScope(req);
    if (record.scope !== scope) {
      return res.status(403).json({
        error: 'This launch link belongs to the other workspace.',
        code: 'wrong-workspace',
      });
    }

    const user = findUserById(record.userId);
    if (!user) {
      return res.status(401).json({ error: 'This launch link is not valid.', code: 'launch-invalid' });
    }
    if (userScope(user) !== scope) {
      return res.status(403).json({
        error: wrongWorkspaceMessage(userScope(user)),
        code: 'wrong-workspace',
        scope: userScope(user),
      });
    }

    record.usedAt = new Date().toISOString();
    record.usedFrom = String(req.headers['user-agent'] || '').slice(0, 120);
    await persistLaunchCode(record);

    res.json({ token: signToken(user), user: publicUser(user), scope });
  } catch (error) {
    next(error);
  }
});

/** POST /api/auth/launch/revoke — burn every unused launch code for this account. */
router.post('/launch/revoke', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const mine = db.launchCodes.filter((entry) => entry.userId === req.user.id && !entry.usedAt);
    const now = new Date().toISOString();
    for (const entry of mine) {
      entry.revokedAt = now;
      await persistLaunchCode(entry);
    }
    res.json({ revoked: mine.length });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/sessions/revoke-all — sign out every device and invalidate
 * every outstanding launch link, without touching SESSION_SECRET.
 */
router.post('/sessions/revoke-all', requireAuth, async (req, res, next) => {
  try {
    const user = req.user;
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    user.sessionsRevokedAt = new Date().toISOString();
    await persistUser(user);

    const db = getDb();
    const codes = db.launchCodes.filter((entry) => entry.userId === user.id && !entry.usedAt);
    const now = new Date().toISOString();
    for (const entry of codes) {
      entry.revokedAt = now;
      await persistLaunchCode(entry);
    }

    res.json({
      ok: true,
      sessionVersion: user.sessionVersion,
      launchCodesRevoked: codes.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
