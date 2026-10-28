/**
 * Deletes every user, conversation, and message from the configured database.
 *
 *   node server/scripts/wipe-accounts.mjs --confirm
 *
 * Local JSON storage is emptied too, so a fallback start cannot resurrect
 * accounts that were removed from Firestore.
 */
import fs from 'node:fs';
import path from 'node:path';

import { DATA_DIR } from '../src/config.js';
import { getFirestoreDb, getFirebaseProjectId } from '../src/firebase.js';

const COLLECTIONS = ['users', 'conversations', 'messages'];
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!process.argv.includes('--confirm')) {
  console.error('Refusing to wipe without --confirm');
  process.exit(1);
}

async function wipeFirestore() {
  const firestore = getFirestoreDb();
  if (!firestore) {
    console.log('[wipe] Firestore is not configured; nothing to delete there.');
    return null;
  }

  for (const name of COLLECTIONS) {
    const docs = await firestore.collection(name).get();
    let batch = firestore.batch();
    let pending = 0;
    for (const doc of docs.docs) {
      batch.delete(doc.ref);
      pending += 1;
      if (pending === 400) {
        await batch.commit();
        batch = firestore.batch();
        pending = 0;
      }
    }
    if (pending > 0) await batch.commit();
    console.log(`[wipe] Deleted ${docs.size} document(s) from ${name}`);
  }

  const after = {};
  for (const name of COLLECTIONS) {
    after[name] = (await firestore.collection(name).get()).size;
  }
  console.log(`[wipe] Remaining: ${JSON.stringify(after)} on ${getFirebaseProjectId()}`);
  return after;
}

function wipeLocal() {
  if (!fs.existsSync(DB_FILE)) {
    console.log('[wipe] No local db.json found.');
    return;
  }
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify({ version: 2, users: [], conversations: [], messages: [] }, null, 2),
  );
  console.log('[wipe] Local db.json emptied.');
}

try {
  const firestoreCounts = await wipeFirestore();
  wipeLocal();
  console.log('[wipe] Done.', JSON.stringify(firestoreCounts));
  process.exit(0);
} catch (error) {
  console.error('[wipe] Failed:', error.message);
  process.exit(1);
}
