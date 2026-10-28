import crypto from 'node:crypto';
import { getFirestoreDb } from './firebase.js';

/**
 * Durable media storage on the Firestore database the app already uses.
 *
 * Render's free tier wipes the container filesystem on every deploy or
 * restart, which used to orphan every uploaded photo, voice note, and video.
 * Supabase Storage and Firebase Storage both need credentials the project does
 * not have, so files are split into sub-megabyte base64 chunks and stored in
 * Firestore instead. That keeps attachments alive across restarts with the
 * credentials already configured, and it costs nothing on the free tier.
 *
 * Layout:
 *   media/{id}                  → { contentType, size, chunks, folder, createdAt }
 *   media/{id}/chunks/{index}   → { index, data: base64 }
 */

const COLLECTION = 'media';
const CHUNK_COLLECTION = 'chunks';

/** 500 KB of raw bytes becomes ~667 KB of base64 — under Firestore's 1 MiB doc limit. */
const CHUNK_BYTES = 500_000;

/** Firestore allows 500 writes per batch; stay well under it. */
const BATCH_WRITES = 400;

/** Keeps a recently viewed file in memory so video seeking does not re-read Firestore. */
const CACHE_BYTES = 64 * 1024 * 1024;
const cache = new Map();
let cacheSize = 0;

export function isFirestoreMediaAvailable() {
  return !!getFirestoreDb();
}

function cacheGet(id) {
  const entry = cache.get(id);
  if (!entry) return null;
  // Refresh recency.
  cache.delete(id);
  cache.set(id, entry);
  return entry;
}

function cacheSet(id, entry) {
  if (entry.buffer.length > CACHE_BYTES / 4) return;
  if (cache.has(id)) {
    cacheSize -= cache.get(id).buffer.length;
    cache.delete(id);
  }
  cache.set(id, entry);
  cacheSize += entry.buffer.length;
  while (cacheSize > CACHE_BYTES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cacheSize -= cache.get(oldest.value).buffer.length;
    cache.delete(oldest.value);
  }
}

function chunkId(index) {
  return String(index).padStart(5, '0');
}

export async function storeMedia(
  buffer,
  { contentType = 'application/octet-stream', folder = 'uploads' } = {},
) {
  const firestore = getFirestoreDb();
  if (!firestore) throw new Error('Firestore is not configured');

  const id = crypto.randomUUID();
  const doc = firestore.collection(COLLECTION).doc(id);

  const chunks = [];
  for (let offset = 0; offset < buffer.length; offset += CHUNK_BYTES) {
    chunks.push(buffer.subarray(offset, offset + CHUNK_BYTES).toString('base64'));
  }
  if (chunks.length === 0) chunks.push('');

  let batch = firestore.batch();
  let pending = 0;

  const commitIfFull = async () => {
    if (pending < BATCH_WRITES) return;
    await batch.commit();
    batch = firestore.batch();
    pending = 0;
  };

  for (let index = 0; index < chunks.length; index += 1) {
    batch.set(doc.collection(CHUNK_COLLECTION).doc(chunkId(index)), {
      index,
      data: chunks[index],
    });
    pending += 1;
    await commitIfFull();
  }

  // Written last so a partially uploaded file is never visible by its metadata.
  batch.set(doc, {
    contentType,
    size: buffer.length,
    chunks: chunks.length,
    folder,
    createdAt: new Date().toISOString(),
  });
  await batch.commit();

  return {
    url: `/media/${id}`,
    path: id,
    storage: 'firestore',
    size: buffer.length,
  };
}

export async function readMedia(id) {
  const cached = cacheGet(id);
  if (cached) return cached;

  const firestore = getFirestoreDb();
  if (!firestore) return null;

  const doc = await firestore.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;

  const data = doc.data() || {};
  const expected = Number(data.chunks) || 0;

  const snapshot = await firestore
    .collection(COLLECTION)
    .doc(id)
    .collection(CHUNK_COLLECTION)
    .orderBy('index')
    .get();

  if (snapshot.size !== expected) {
    throw new Error(`Media ${id} is incomplete (${snapshot.size}/${expected} chunks)`);
  }

  const buffer = Buffer.concat(
    snapshot.docs.map((chunk) => Buffer.from(String(chunk.data()?.data || ''), 'base64')),
  );

  const entry = {
    buffer,
    contentType: String(data.contentType || 'application/octet-stream'),
    size: buffer.length,
  };
  cacheSet(id, entry);
  return entry;
}

export async function deleteMedia(id) {
  cache.delete(id);

  const firestore = getFirestoreDb();
  if (!firestore) return;

  const doc = firestore.collection(COLLECTION).doc(id);
  const snapshot = await doc.collection(CHUNK_COLLECTION).get();

  let batch = firestore.batch();
  let pending = 0;
  for (const chunk of snapshot.docs) {
    batch.delete(chunk.ref);
    pending += 1;
    if (pending >= BATCH_WRITES) {
      await batch.commit();
      batch = firestore.batch();
      pending = 0;
    }
  }
  batch.delete(doc);
  await batch.commit();
}

/** Extracts the media id from a `/media/<id>` URL, or null for other URLs. */
export function mediaIdFromUrl(url) {
  if (typeof url !== 'string') return null;
  const match = /^\/media\/([a-f0-9-]{36})$/i.exec(url.split('?')[0]);
  return match ? match[1] : null;
}
