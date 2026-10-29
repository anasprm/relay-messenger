import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Mints a long-lived sign-in link for the Relay web app.
 *
 * The link carries a session token in the URL fragment. Opening it signs the
 * account in, stores the token, and strips the fragment from the address bar.
 * Handy for desktop shortcuts and phone home-screen icons.
 *
 *   node server/scripts/make-launcher-link.mjs --username anas --days 365
 *
 * The password is asked for at runtime unless --password is given. SESSION_SECRET
 * must match the deployed API (Render), otherwise the link will be rejected.
 */

const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const username = arg('username');
const password = arg('password');
const days = Math.min(Math.max(Number(arg('days', '365')) || 365, 1), 3650);
const site = arg('site', 'private');
const apiUrl = arg('api', 'https://relay-api-amr9.onrender.com').replace(/\/$/, '');
const appUrl = arg('app', 'https://valiyakath.vercel.app').replace(/\/$/, '');
const out = arg('out', '');

if (!username) {
  console.error('Usage: node server/scripts/make-launcher-link.mjs --username <name> [--days 365] [--out file]');
  process.exit(1);
}

function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET.trim();
  const envFile = path.join(process.cwd(), 'server', '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = /^\s*SESSION_SECRET\s*=\s*(.+)\s*$/.exec(line);
      if (match) return match[1].trim();
    }
  }
  const secretFile = path.join(process.cwd(), 'server', 'data', '.secret');
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  return '';
}

function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (value) => resolve(String(value).trim()));
  });
}

const secret = loadSecret();
if (!secret) {
  console.error(
    'SESSION_SECRET is not available. Set it in the environment or in server/.env.\n' +
      'It must be the same value the Render service uses, or the link will not verify.',
  );
  process.exit(1);
}

const loginPassword = password || (await prompt(`Password for ${username}: `));
if (!loginPassword) {
  console.error('A password is required to confirm the account.');
  process.exit(1);
}

const response = await fetch(`${apiUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Relay-Site': site },
  body: JSON.stringify({ username, password: loginPassword }),
});

const payload = await response.json().catch(() => null);
if (!response.ok || !payload?.token) {
  console.error(`Sign-in failed (${response.status}): ${payload?.error || 'unknown error'}`);
  process.exit(1);
}

const [body] = payload.token.split('.');
const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
const exp = Date.now() + days * 24 * 60 * 60 * 1000;

const nextBody = Buffer.from(
  JSON.stringify({ sub: claims.sub, username: claims.username, exp }),
).toString('base64url');
const signature = crypto
  .createHmac('sha256', secret)
  .update(nextBody)
  .digest('base64url');
const token = `${nextBody}.${signature}`;

const url = `${appUrl}/chat#relay-token=${encodeURIComponent(token)}`;
const expires = new Date(exp).toISOString();

console.log(`Account:  ${payload.user?.displayName || username} (@${username}, ${site})`);
console.log(`Expires:  ${expires} (${days} days)`);
console.log(`Link:     ${url}`);

if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), `${url}\n`, 'utf8');
  console.log(`Saved to: ${path.resolve(out)}`);
}
