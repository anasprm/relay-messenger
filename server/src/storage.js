import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './config.js';
import { firebaseStatus, getStorageBucket } from './firebase.js';

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.vbs',
  '.jar', '.js', '.html', '.htm', '.dll', '.cpl', '.hta',
]);

/** Ten years — long enough that a stored message does not lose its media. */
const SUPABASE_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

export function extensionFor(filename = '') {
  return path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12);
}

export function isBlockedExtension(extension) {
  return BLOCKED_EXTENSIONS.has(extension);
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  ).trim();
  const bucket = (process.env.SUPABASE_STORAGE_BUCKET || 'relay-uploads').trim();

  if (!url || !key || !bucket) return null;
  return { url, key, bucket };
}

function encodeObjectPath(objectPath) {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}

/**
 * Supabase Storage keeps uploads outside the API container, so they survive
 * Render restarts and redeploys. Objects are signed for long-lived read access
 * so the bucket can stay private.
 */
async function storeSupabase(buffer, { filename, contentType, folder }) {
  const config = supabaseConfig();
  if (!config) return null;

  const objectPath = `${folder}/${filename}`;
  const encodedPath = encodeObjectPath(objectPath);
  const uploadUrl = `${config.url}/storage/v1/object/${config.bucket}/${encodedPath}`;

  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.key}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
      'cache-control': 'max-age=31536000',
    },
    body: buffer,
  });

  if (!upload.ok) {
    const detail = await upload.text().catch(() => '');
    throw new Error(
      `Supabase upload failed (${upload.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    );
  }

  const sign = await fetch(
    `${config.url}/storage/v1/object/sign/${config.bucket}/${encodedPath}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: SUPABASE_SIGNED_URL_TTL_SECONDS }),
    },
  );

  if (!sign.ok) {
    const detail = await sign.text().catch(() => '');
    throw new Error(
      `Supabase signed URL failed (${sign.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    );
  }

  const payload = await sign.json().catch(() => null);
  const signed = payload?.signedURL || payload?.signedUrl;
  if (!signed || typeof signed !== 'string') {
    throw new Error('Supabase signed URL response was missing signedURL.');
  }

  const url = signed.startsWith('http')
    ? signed
    : `${config.url}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;

  return { url, path: objectPath, storage: 'supabase' };
}

/**
 * Persists an uploaded buffer in Supabase Storage, then Firebase Storage, and
 * finally local disk. The local fallback keeps development working but is
 * erased whenever a free Render service restarts.
 */
export async function storeUpload(buffer, { extension = '', contentType = 'application/octet-stream', folder = 'uploads' } = {}) {
  const safeExtension = extension && !isBlockedExtension(extension) ? extension : '';
  const filename = `${crypto.randomUUID()}${safeExtension}`;

  if (supabaseConfig()) {
    try {
      return await storeSupabase(buffer, { filename, contentType, folder });
    } catch (error) {
      console.warn(`[storage] Supabase upload failed (${error.message}); trying the next provider.`);
    }
  }

  const bucket = await getStorageBucket();
  if (bucket) {
    try {
      const objectPath = `${folder}/${filename}`;
      const token = crypto.randomUUID();
      await bucket.file(objectPath).save(buffer, {
        resumable: false,
        metadata: {
          contentType,
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
      const encoded = encodeURIComponent(objectPath);
      return {
        url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`,
        path: objectPath,
        storage: 'firebase',
      };
    } catch (error) {
      console.warn(`[storage] Firebase upload failed (${error.message}); using local disk.`);
    }
  }

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return {
    url: `/uploads/${filename}`,
    path: filename,
    storage: 'local',
  };
}

export function storageStatus() {
  const config = supabaseConfig();
  if (config) {
    return {
      provider: 'supabase',
      bucket: config.bucket,
      durable: true,
      error: null,
    };
  }

  const firebase = firebaseStatus();
  return {
    provider: firebase.storage,
    bucket: firebase.storageBucket,
    durable: firebase.storage === 'firebase',
    error: firebase.storageError,
  };
}

/**
 * Best-effort removal of a stored file. Used when a view-once message is
 * opened or an unsent message is revoked. Failures are logged, never thrown:
 * the database record is the source of truth.
 */
export async function deleteUpload(url) {
  if (!url || typeof url !== 'string') return;

  try {
    if (url.startsWith('/uploads/')) {
      const file = path.join(UPLOAD_DIR, url.slice('/uploads/'.length));
      if (file.startsWith(UPLOAD_DIR) && fs.existsSync(file)) fs.unlinkSync(file);
      return;
    }

    const config = supabaseConfig();
    if (config && url.includes('/storage/v1/object/sign/')) {
      const marker = `/object/sign/${config.bucket}/`;
      const index = url.indexOf(marker);
      if (index >= 0) {
        const objectPath = decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
        await fetch(`${config.url}/storage/v1/object/${config.bucket}/${encodeObjectPath(objectPath)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${config.key}` },
        });
      }
      return;
    }

    const bucket = await getStorageBucket();
    if (bucket && url.includes('firebasestorage.googleapis.com')) {
      const match = url.match(/\/o\/([^?]+)/);
      if (match) await bucket.file(decodeURIComponent(match[1])).delete({ ignoreNotFound: true });
    }
  } catch (error) {
    console.warn(`[storage] Could not delete ${url}: ${error.message}`);
  }
}
