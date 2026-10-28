/**
 * Removes the five seeded demo accounts and anything that belongs to them.
 * Real accounts and their conversations are left untouched.
 *
 *   node server/scripts/remove-demo-accounts.mjs --confirm
 */
import { getFirestoreDb, getFirebaseProjectId } from '../src/firebase.js';

const DEMO_USERNAMES = new Set(['demo', 'alice', 'bob', 'carol', 'dev']);

if (!process.argv.includes('--confirm')) {
  console.error('Refusing to delete without --confirm');
  process.exit(1);
}

const firestore = getFirestoreDb();
if (!firestore) {
  console.error('Firestore is not configured');
  process.exit(1);
}

const users = await firestore.collection('users').get();
const demoIds = new Set(
  users.docs
    .filter((doc) => DEMO_USERNAMES.has(String(doc.data().username || '').toLowerCase()))
    .map((doc) => doc.id),
);

if (demoIds.size === 0) {
  console.log('[demo] No demo accounts found.');
  process.exit(0);
}

const conversations = await firestore.collection('conversations').get();
const demoConversationIds = new Set(
  conversations.docs
    .filter((doc) => {
      const ids = doc.data().participantIds || [];
      return ids.some((id) => demoIds.has(id));
    })
    .map((doc) => doc.id),
);

const messages = await firestore.collection('messages').get();
const demoMessageIds = messages.docs
  .filter((doc) => {
    const data = doc.data();
    return demoIds.has(data.senderId) || demoConversationIds.has(data.conversationId);
  })
  .map((doc) => doc.id);

async function removeAll(collectionName, ids) {
  let batch = firestore.batch();
  let pending = 0;
  for (const id of ids) {
    batch.delete(firestore.collection(collectionName).doc(id));
    pending += 1;
    if (pending === 400) {
      await batch.commit();
      batch = firestore.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  console.log(`[demo] Deleted ${ids.length} document(s) from ${collectionName}`);
}

await removeAll('messages', demoMessageIds);
await removeAll('conversations', [...demoConversationIds]);
await removeAll('users', [...demoIds]);

const counts = {};
for (const name of ['users', 'conversations', 'messages']) {
  counts[name] = (await firestore.collection(name).get()).size;
}
console.log(`[demo] Remaining on ${getFirebaseProjectId()}: ${JSON.stringify(counts)}`);
process.exit(0);
