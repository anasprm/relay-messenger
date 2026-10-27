/**
 * Moves every local `/uploads/...` attachment into the configured durable
 * storage provider and updates the matching Firestore message documents.
 *
 * Run from the repository root:
 *   node server/scripts/migrate-uploads.mjs
 *
 * Requires a durable provider: Supabase (SUPABASE_URL + service role key) or
 * Firebase Storage (FIREBASE_STORAGE_BUCKET). Without one the script stops
 * instead of pretending the files are safe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from '../src/config.js';
import { getDb, initDb, persistMessage } from '../src/db.js';
import { storageStatus, storeUpload } from '../src/storage.js';
import { inferKind } from '../src/utils.js';

const GENERIC_MIME = new Set(['', 'application/octet-stream', 'text/plain']);

function repairedMime(message, extension) {
  const current = String(message.attachment?.mime || '').toLowerCase();
  if (!GENERIC_MIME.has(current)) return current;

  if (message.kind === 'video') return 'video/webm';
  if (message.kind === 'audio') return extension === '.wav' ? 'audio/wav' : 'audio/webm';
  if (message.kind === 'image') {
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
    if (extension === '.png') return 'image/png';
    if (extension === '.gif') return 'image/gif';
    if (extension === '.webp') return 'image/webp';
    if (extension === '.svg') return 'image/svg+xml';
  }

  if (extension === '.txt') return 'text/plain';
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.webm') return 'video/webm';
  return current || 'application/octet-stream';
}

const status = storageStatus();
if (!status.durable) {
  console.error(
    `No durable storage configured (current provider: ${status.provider}).\n` +
      'Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ SUPABASE_STORAGE_BUCKET) ' +
      'or FIREBASE_STORAGE_BUCKET, then run this script again.',
  );
  process.exit(1);
}

await initDb();
const db = getDb();

const pending = db.messages.filter((message) =>
  String(message.attachment?.url || '').startsWith('/uploads/'),
);

if (pending.length === 0) {
  console.log('No local upload URLs need migration.');
  process.exit(0);
}

let migrated = 0;
let missing = 0;

for (const message of pending) {
  const relative = message.attachment.url.replace(/^\/uploads\//, '');
  const filePath = path.join(UPLOAD_DIR, relative);

  if (!fs.existsSync(filePath)) {
    missing += 1;
    console.warn(`[missing] ${relative} (message ${message.id}) — original file is not in server/uploads`);
    continue;
  }

  const extension = path.extname(relative).toLowerCase();
  const contentType = repairedMime(message, extension);
  const buffer = fs.readFileSync(filePath);

  const stored = await storeUpload(buffer, {
    extension,
    contentType,
    folder: 'uploads',
  });

  if (stored.storage === 'local') {
    console.error(`[failed] ${relative} — the provider fell back to local disk.`);
    continue;
  }

  message.attachment.url = stored.url;
  message.attachment.mime = contentType;
  message.attachment.kind = inferKind(contentType);
  await persistMessage(message);

  migrated += 1;
  console.log(`[ok] ${relative} -> ${stored.storage} (${message.attachment.kind})`);
}

console.log(`\nDone. Migrated ${migrated}, missing ${missing}, total ${pending.length}.`);
process.exit(missing > 0 ? 2 : 0);
