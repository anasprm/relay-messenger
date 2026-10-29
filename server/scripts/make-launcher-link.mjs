import fs from 'node:fs';
import path from 'node:path';

/**
 * Mints a single-use Relay sign-in link for a shortcut or a phone.
 *
 *   node server/scripts/make-launcher-link.mjs --username anas --days 7
 *
 * How it works: the script signs in normally, asks the API for a one-time
 * launch code, and puts that code in the URL fragment. The code is stored
 * hashed on the server, expires (7 days by default) and dies the first time it
 * is redeemed — so a copied shortcut is worthless after the first use.
 *
 * It no longer needs SESSION_SECRET, and it can revoke every older unused link.
 */

const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
function flag(name) {
  return args.includes(`--${name}`);
}

const username = arg('username');
const password = arg('password');
const days = Math.min(Math.max(Number(arg('days', '7')) || 7, 1), 30);
const site = arg('site', 'private');
const apiUrl = arg('api', 'https://relay-api-amr9.onrender.com').replace(/\/$/, '');
const appUrl = arg('app', 'https://valiyakath.vercel.app').replace(/\/$/, '');
const out = arg('out', '');
const keepOld = flag('keep-old');

if (!username) {
  console.error(
    'Usage: node server/scripts/make-launcher-link.mjs --username <name> [--days 7] [--out file] [--keep-old]',
  );
  process.exit(1);
}

function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (value) => resolve(String(value).trim()));
  });
}

const loginPassword = password || (await prompt(`Password for ${username}: `));
if (!loginPassword) {
  console.error('A password is required to confirm the account.');
  process.exit(1);
}

const headers = { 'Content-Type': 'application/json', 'X-Relay-Site': site };

const loginResponse = await fetch(`${apiUrl}/api/auth/login`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ username, password: loginPassword }),
});
const login = await loginResponse.json().catch(() => null);
if (!loginResponse.ok || !login?.token) {
  console.error(`Sign-in failed (${loginResponse.status}): ${login?.error || 'unknown error'}`);
  process.exit(1);
}

const authHeaders = { ...headers, Authorization: `Bearer ${login.token}` };

if (!keepOld) {
  const revoked = await fetch(`${apiUrl}/api/auth/launch/revoke`, {
    method: 'POST',
    headers: authHeaders,
    body: '{}',
  })
    .then((response) => response.json().catch(() => null))
    .catch(() => null);
  if (revoked?.revoked) console.log(`Revoked ${revoked.revoked} older unused link(s).`);
}

const created = await fetch(`${apiUrl}/api/auth/launch`, {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({ label: `launcher ${new Date().toISOString().slice(0, 10)}` }),
});

const payload = await created.json().catch(() => null);
if (!created.ok || !payload?.code) {
  console.error(`Could not create a launch code (${created.status}): ${payload?.error || ''}`);
  process.exit(1);
}

const url = `${appUrl}/chat#relay-code=${encodeURIComponent(payload.code)}`;
const expires = new Date(payload.expiresAt).toISOString();

console.log(`Account:  ${login.user?.displayName || username} (@${username}, ${site})`);
console.log(`Expires:  ${expires} (single use)`);
console.log(`Link:     ${url}`);

if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), `${url}\n`, 'utf8');
  console.log(`Saved to: ${path.resolve(out)}`);
}
