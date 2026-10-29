import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { getFirestoreDb, getFirebaseProjectId } from './firebase.js';
import { seedDatabase } from './seed.js';
import { conversationScope, userScope } from './site.js';

const DB_FILE = path.join(DATA_DIR, 'db.json');
let state = null;
let backend = 'json';
let lastFirestoreError = null;

/**
 * Demo data is seeded only when the store is empty. Set SEED_DEMO=false to
 * keep a wiped database empty instead of restoring the sample accounts.
 */
const SEED_DEMO = (process.env.SEED_DEMO || 'true').trim().toLowerCase() !== 'false';

const emptyState = () => ({
  version: 3,
  users: [],
  conversations: [],
  messages: [],
  launchCodes: [],
});

/** Older snapshots predate launch codes; keep them loadable. */
function normalizeState(next) {
  if (!Array.isArray(next.launchCodes)) next.launchCodes = [];
  return next;
}

function validShape(candidate) {
  return (
    candidate &&
    Array.isArray(candidate.users) &&
    Array.isArray(candidate.conversations) &&
    Array.isArray(candidate.messages)
  );
}

function writeLocalSnapshot() {
  if (!state) return;
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function loadLocal() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!validShape(parsed)) throw new Error('Invalid database shape');
    state = normalizeState(parsed);
  } catch {
    state = normalizeState(SEED_DEMO ? seedDatabase() : emptyState());
    writeLocalSnapshot();
  }
  backend = 'json';
}

function fromSnapshot(snapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function writeAllToFirestore(data) {
  const firestore = getFirestoreDb();
  if (!firestore) return;

  const collections = ['users', 'conversations', 'messages', 'launch_codes'];
  let batch = firestore.batch();
  let pending = 0;

  for (const collectionName of collections) {
    const docs = data[collectionName] || [];
    for (const doc of docs) {
      batch.set(firestore.collection(collectionName).doc(doc.id), doc);
      pending += 1;
      if (pending === 450) {
        await batch.commit();
        batch = firestore.batch();
        pending = 0;
      }
    }
  }

  if (pending > 0) await batch.commit();
}

async function loadFromFirestore() {
  const firestore = getFirestoreDb();
  if (!firestore) throw new Error('Firestore is not configured');

  const [users, conversations, messages, launchCodes] = await Promise.all([
    firestore.collection('users').get(),
    firestore.collection('conversations').get(),
    firestore.collection('messages').get(),
    firestore.collection('launch_codes').get(),
  ]);

  const parsed = {
    version: 3,
    users: fromSnapshot(users),
    conversations: fromSnapshot(conversations),
    messages: fromSnapshot(messages),
    launchCodes: fromSnapshot(launchCodes),
  };

  if (parsed.users.length === 0 && SEED_DEMO) {
    const seeded = normalizeState(seedDatabase());
    await writeAllToFirestore(seeded);
    state = seeded;
    backend = 'firestore';
    writeLocalSnapshot();
    return;
  }

  if (!validShape(parsed)) throw new Error('Firestore returned an invalid document shape');
  state = normalizeState(parsed);
  backend = 'firestore';
}

/**
 * Hydrates the in-memory cache from Firestore when configured, otherwise from
 * the local JSON snapshot. Must complete before the HTTP server accepts traffic.
 */
export async function initDb() {
  if (state) return state;

  if (getFirestoreDb()) {
    try {
      await loadFromFirestore();
      console.log(
        `[db] Loaded ${state.users.length} users, ${state.conversations.length} conversations, ${state.messages.length} messages from Firestore (${getFirebaseProjectId()}).`,
      );
      return state;
    } catch (error) {
      lastFirestoreError = error;
      console.warn(`[db] Firestore unavailable (${error.message}); falling back to local JSON.`);
    }
  }

  loadLocal();
  console.log(
    `[db] Loaded ${state.users.length} users, ${state.conversations.length} conversations, ${state.messages.length} messages from local JSON.`,
  );
  return state;
}

export function getDb() {
  if (!state) {
    // Routes are only mounted after initDb(), but this keeps tests and tools safe.
    loadLocal();
  }
  return state;
}

export function saveDb() {
  writeLocalSnapshot();
}

async function writeDoc(collectionName, doc) {
  const firestore = getFirestoreDb();
  if (!firestore) return;

  try {
    await firestore.collection(collectionName).doc(doc.id).set(doc, { merge: true });
    lastFirestoreError = null;
  } catch (error) {
    lastFirestoreError = error;
    console.warn(`[db] Firestore write failed for ${collectionName}/${doc.id}: ${error.message}`);
  }
}

export async function persistUser(user) {
  saveDb();
  await writeDoc('users', user);
}

export async function persistConversation(conversation) {
  saveDb();
  await writeDoc('conversations', conversation);
}

export async function persistMessage(message) {
  saveDb();
  await writeDoc('messages', message);
}

/**
 * Launch codes are single-use sign-in links. Only the SHA-256 hash is stored, so
 * a database leak does not hand out working links.
 */
export async function persistLaunchCode(record) {
  saveDb();
  await writeDoc('launch_codes', record);
}

export async function deleteLaunchCode(id) {
  const db = getDb();
  db.launchCodes = db.launchCodes.filter((record) => record.id !== id);
  saveDb();

  const firestore = getFirestoreDb();
  if (!firestore) return;

  try {
    await firestore.collection('launch_codes').doc(id).delete();
    lastFirestoreError = null;
  } catch (error) {
    lastFirestoreError = error;
    console.warn(`[db] Firestore delete failed for launch_codes/${id}: ${error.message}`);
  }
}

export async function deleteConversation(id) {
  const db = getDb();
  db.conversations = db.conversations.filter((conversation) => conversation.id !== id);
  saveDb();

  const firestore = getFirestoreDb();
  if (!firestore) return;

  try {
    await firestore.collection('conversations').doc(id).delete();
    lastFirestoreError = null;
  } catch (error) {
    lastFirestoreError = error;
    console.warn(`[db] Firestore delete failed for conversations/${id}: ${error.message}`);
  }
}

export async function deleteMessagesByIds(ids) {
  if (!ids?.length) return;
  saveDb();

  const firestore = getFirestoreDb();
  if (!firestore) return;

  try {
    const batch = firestore.batch();
    for (const id of ids) batch.delete(firestore.collection('messages').doc(id));
    await batch.commit();
    lastFirestoreError = null;
  } catch (error) {
    lastFirestoreError = error;
    console.warn(`[db] Firestore delete failed: ${error.message}`);
  }
}

export function dbStatus() {
  return {
    backend,
    projectId: getFirebaseProjectId(),
    error: lastFirestoreError?.message || null,
  };
}

export function resetDb() {
  state = normalizeState(seedDatabase());
  writeLocalSnapshot();
  return state;
}

export function findUserById(id) {
  return getDb().users.find((user) => user.id === id) || null;
}

export function findUserByUsername(username, scope) {
  const needle = String(username || '').trim().toLowerCase();
  const matches = getDb().users.filter((user) => user.username === needle);
  if (!scope) return matches[0] || null;
  return matches.find((user) => userScope(user) === scope) || null;
}

export function findConversation(id) {
  return getDb().conversations.find((conversation) => conversation.id === id) || null;
}

/**
 * Direct threads predate groups and carry no `kind`, so only an explicit
 * `kind: 'group'` marks a group. That keeps old conversations loadable.
 */
export function isGroupConversation(conversation) {
  return conversation?.kind === 'group';
}

export function conversationFor(userId, conversationId, scope) {
  const conversation = findConversation(conversationId);
  if (!conversation) return null;
  if (scope && conversationScope(conversation) !== scope) return null;
  return conversation.participantIds.includes(userId) ? conversation : null;
}

export function isParticipant(conversation, userId) {
  return !!conversation && conversation.participantIds.includes(userId);
}

export function otherParticipantIds(conversation, userId) {
  return conversation.participantIds.filter((id) => id !== userId);
}

export function messagesFor(conversationId) {
  return getDb()
    .messages.filter((message) => message.conversationId === conversationId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/** Messages the viewer has not cleared from their own copy of the thread. */
export function visibleMessagesFor(conversation, viewerId) {
  if (!conversation) return [];
  const clearedAt = conversation.clearedAt?.[viewerId]
    ? new Date(conversation.clearedAt[viewerId]).getTime()
    : 0;
  return messagesFor(conversation.id).filter(
    (message) => new Date(message.createdAt).getTime() > clearedAt,
  );
}

export function lastMessageFor(conversationId, viewerId, conversation) {
  const messages =
    viewerId && conversation
      ? visibleMessagesFor(conversation, viewerId)
      : messagesFor(conversationId);
  return messages.length ? messages[messages.length - 1] : null;
}
