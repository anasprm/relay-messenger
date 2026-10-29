import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** server/ root */
export const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * Load server/.env for local runs. Hosts such as Render inject variables
 * directly, and real environment variables always take precedence.
 * Kept dependency-free so older Node versions can start the API too.
 */
function loadEnvFile() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;

  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;

    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile();

export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(ROOT, 'uploads');
export const SEED_UPLOAD_DIR = path.join(UPLOAD_DIR, 'seed');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const PORT = Number(process.env.PORT || 4000);
export const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

/**
 * Origins that are always trusted, so a stale or missing CLIENT_ORIGIN on the
 * host can never lock the deployed web app out of the API.
 */
const DEFAULT_CLIENT_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://relay-messengerpro.vercel.app',
  'https://relay-messenger-anasprm.vercel.app',
  'https://valiyakath.vercel.app',
];

export const CLIENT_ORIGINS = Array.from(
  new Set([
    ...DEFAULT_CLIENT_ORIGINS,
    ...(process.env.CLIENT_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  ]),
);

/**
 * Sessions are short-lived and slide forward while the app is used, so a token
 * stolen from a browser goes stale instead of living for a year. A launcher
 * link never carries a session token — only a single-use code.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_REFRESH_WINDOW_MS = 20 * 24 * 60 * 60 * 1000; // renew in the last 10 days
export const LAUNCH_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, single use
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // 30 MB

/**
 * Sign-up on the private family site is invite-only. An empty value closes
 * private registration entirely, so a missing variable fails safe.
 */
export const PRIVATE_INVITE_CODE = (process.env.PRIVATE_INVITE_CODE || '').trim();

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
