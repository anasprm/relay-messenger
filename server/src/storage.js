import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './config.js';
import { getStorageBucket } from './firebase.js';

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.vbs',
  '.jar', '.js', '.html', '.htm', '.dll', '.cpl', '.hta',
]);

export function extensionFor(filename = '') {
  return path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12);
}

export function isBlockedExtension(extension) {
  return BLOCKED_EXTENSIONS.has(extension);
}

/**
 * Persists an uploaded buffer in Firebase Storage when a bucket is available,
 * otherwise falls back to local disk so the app remains usable.
 */
export async function storeUpload(buffer, { extension = '', contentType = 'application/octet-stream', folder = 'uploads' } = {}) {
  const safeExtension = extension && !isBlockedExtension(extension) ? extension : '';
  const filename = `${crypto.randomUUID()}${safeExtension}`;
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
