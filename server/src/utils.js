/** Shared validation helpers. */

export function inferKind(mime = '') {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

/**
 * Profile photos may be a small inline data URL so they survive redeploys on
 * hosts without durable object storage. 400k chars is roughly 300 KB of image.
 */
export function isSafeAvatarUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  if (url.startsWith('data:image/')) {
    return (
      /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url) &&
      url.length <= 400_000
    );
  }
  return isSafeUploadUrl(url);
}

export function isSafeUploadUrl(url) {
  if (typeof url !== 'string' || !url) return false;

  if (/^\/uploads\/[A-Za-z0-9._\-/]+$/.test(url)) {
    return !url.includes('..');
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.pathname.includes('..')) return false;

    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      return parsed.pathname.startsWith('/v0/b/');
    }

    // Only the configured Supabase project may be used for attachments.
    let supabaseHost = null;
    try {
      supabaseHost = new URL(process.env.SUPABASE_URL || '').hostname;
    } catch {
      supabaseHost = null;
    }
    if (supabaseHost && parsed.hostname === supabaseHost) {
      return parsed.pathname.startsWith('/storage/v1/object/');
    }

    return false;
  } catch {
    return false;
  }
}

export function sanitizeText(value, max = 4000) {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max) : '';
}

export function sanitizeFileName(value, fallback = 'attachment') {
  const name = String(value || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 180);
  return name || fallback;
}

export function clampDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0) return undefined;
  return Math.min(duration, 60 * 60);
}

export const MESSAGE_KINDS = new Set(['text', 'image', 'audio', 'video', 'file']);
