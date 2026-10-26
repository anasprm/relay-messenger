import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { findUserById } from './db.js';
import { SESSION_SECRET, SESSION_TTL_MS } from './config.js';

const b64url = (value) => Buffer.from(value).toString('base64url');

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

function signature(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

export function signToken(user) {
  const payload = b64url(
    JSON.stringify({ sub: user.id, username: user.username, exp: Date.now() + SESSION_TTL_MS }),
  );
  return `${payload}.${signature(payload)}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = signature(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.sub || !data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/** Express middleware: attaches the live user record to req.user */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const claims = verifyToken(token);
  const user = claims ? findUserById(claims.sub) : null;

  if (!user) {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }

  req.user = user;
  req.token = token;
  next();
}
