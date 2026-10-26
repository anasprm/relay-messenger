import fs from 'node:fs';
import path from 'node:path';
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { DATA_DIR } from './config.js';

const APP_NAME = 'relay-server';
const CREDENTIAL_FILE = path.join(DATA_DIR, 'firebase-service-account.json');
const DATABASE_ID = (process.env.FIREBASE_FIRESTORE_DATABASE || 'default').trim();

let firebase = null;
let firebaseError = null;
let storageBucket = null;
let storageChecked = false;
let storageError = null;

function resolveCredential() {
  const inline = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (inline.startsWith('{')) {
    const parsed = JSON.parse(inline);
    return { credential: cert(parsed), projectId: parsed.project_id, databaseId: DATABASE_ID };
  }

  const credentialPath =
    inline ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (fs.existsSync(CREDENTIAL_FILE) ? CREDENTIAL_FILE : '');

  if (credentialPath && fs.existsSync(credentialPath)) {
    const parsed = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
    return { credential: cert(parsed), projectId: parsed.project_id, databaseId: DATABASE_ID };
  }

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return {
      credential: null,
      projectId: process.env.FIREBASE_PROJECT_ID || 'relay-demo',
      databaseId: DATABASE_ID,
    };
  }

  if (process.env.FIREBASE_PROJECT_ID) {
    return {
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
      databaseId: DATABASE_ID,
    };
  }

  return null;
}

export function getFirebase() {
  if (firebase || firebaseError) return firebase;

  const resolved = resolveCredential();
  if (!resolved) {
    firebaseError = new Error('No Firebase credentials configured');
    return null;
  }

  try {
    const existing = getApps().find((app) => app.name === APP_NAME);
    const app =
      existing ||
      initializeApp(
        {
          ...(resolved.credential ? { credential: resolved.credential } : {}),
          projectId: resolved.projectId,
        },
        APP_NAME,
      );

    const firestore = getFirestore(app, resolved.databaseId);
    firestore.settings({ ignoreUndefinedProperties: true });

    firebase = {
      app,
      firestore,
      projectId: resolved.projectId,
      databaseId: resolved.databaseId,
    };
    console.log(
      `[firebase] Firestore connected to ${resolved.projectId}/${resolved.databaseId}`,
    );
    return firebase;
  } catch (error) {
    firebaseError = error;
    console.warn(`[firebase] Could not initialize Admin SDK: ${error.message}`);
    return null;
  }
}

export function getFirestoreDb() {
  return getFirebase()?.firestore || null;
}

export function getFirebaseProjectId() {
  return getFirebase()?.projectId || process.env.FIREBASE_PROJECT_ID || null;
}

/** Storage is only enabled once a bucket name is configured and verified. */
export async function getStorageBucket() {
  if (storageBucket || storageChecked) return storageBucket;
  storageChecked = true;

  const bucketName = (process.env.FIREBASE_STORAGE_BUCKET || '').trim();
  const fb = getFirebase();
  if (!bucketName || !fb) {
    if (!bucketName) storageError = new Error('FIREBASE_STORAGE_BUCKET is not configured');
    return null;
  }

  try {
    const bucket = getStorage(fb.app).bucket(bucketName);
    const [exists] = await bucket.exists();
    if (!exists) {
      storageError = new Error(`Storage bucket ${bucketName} does not exist`);
      console.warn(`[firebase] ${storageError.message}; uploads will use local disk.`);
      return null;
    }
    storageBucket = bucket;
    console.log(`[firebase] Storage connected to ${bucketName}`);
    return storageBucket;
  } catch (error) {
    storageError = error;
    console.warn(`[firebase] Storage unavailable: ${error.message}; uploads will use local disk.`);
    return null;
  }
}

/** Resolves the bucket once at boot so health reports the real upload target. */
export async function probeStorage() {
  await getStorageBucket();
  return firebaseStatus();
}

export function firebaseStatus() {
  const fb = getFirebase();
  return {
    database: fb?.firestore ? 'firestore' : 'json',
    projectId: fb?.projectId || null,
    databaseId: fb?.databaseId || null,
    storage: storageBucket ? 'firebase' : 'local',
    storageBucket: storageBucket?.name || null,
    storageError: storageError?.message || null,
    error: firebaseError?.message || null,
  };
}
