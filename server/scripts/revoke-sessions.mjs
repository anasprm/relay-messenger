/**
 * Signs out every device and burns every unused launcher link for an account.
 *
 *   node server/scripts/revoke-sessions.mjs --username anas
 *
 * Use this when a shortcut, a phone, or the launcher folder goes missing. It
 * bumps the account's session generation, so every token issued before now stops
 * working immediately — no SESSION_SECRET rotation needed.
 */

const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const username = arg('username');
const password = arg('password');
const site = arg('site', 'private');
const apiUrl = arg('api', 'https://relay-api-amr9.onrender.com').replace(/\/$/, '');

if (!username) {
  console.error('Usage: node server/scripts/revoke-sessions.mjs --username <name> [--site private]');
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

const response = await fetch(`${apiUrl}/api/auth/sessions/revoke-all`, {
  method: 'POST',
  headers: { ...headers, Authorization: `Bearer ${login.token}` },
  body: '{}',
});
const payload = await response.json().catch(() => null);

if (!response.ok) {
  console.error(`Revoke failed (${response.status}): ${payload?.error || 'unknown error'}`);
  process.exit(1);
}

console.log(`Signed out every device for @${username}.`);
console.log(`Session generation is now ${payload.sessionVersion}.`);
console.log(`Unused launcher links burned: ${payload.launchCodesRevoked}.`);
console.log('Open a freshly generated launcher link to sign back in.');
