import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** server/ root */
export const ROOT = path.resolve(import.meta.dirname, '..');

export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(ROOT, 'uploads');
export const SEED_UPLOAD_DIR = path.join(UPLOAD_DIR, 'seed');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const PORT = Number(process.env.PORT || 4000);
export const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

export const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ||
  'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // 30 MB

function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;

  const secretFile = path.join(DATA_DIR, '.secret');
  try {
    return fs.readFileSync(secretFile, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
    return secret;
  }
}

export const SESSION_SECRET = loadSecret();
