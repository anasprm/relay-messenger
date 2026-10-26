import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth, signToken, hashPassword, verifyPassword } from '../auth.js';
import { findUserByUsername, getDb, saveDb } from '../db.js';
import { publicUser } from '../serializers.js';

const router = Router();

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const RESERVED = new Set(['anonymous', 'admin', 'system', 'relay', 'support', 'me']);

function titleCase(value) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

router.post('/register', (req, res) => {
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
  if (findUserByUsername(username)) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const db = getDb();
  const user = {
    id: crypto.randomUUID(),
    username,
    displayName: displayNameInput.slice(0, 40) || titleCase(username),
    accent: ['indigo', 'violet', 'emerald', 'amber', 'rose', 'cyan'][db.users.length % 6],
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };

  db.users.push(user);
  saveDb();

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = findUserByUsername(username);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
