import type { Attachment } from './types';
import { siteScope } from './site';

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_SERVER_URL ||
  'http://localhost:4000'
).replace(/\/$/, '');

const TOKEN_KEY = 'relay.token';

/**
 * A launcher shortcut can carry a long-lived session token in the URL fragment,
 * e.g. `https://site/chat#relay-token=…`. The fragment never reaches the server
 * or a referrer, and it is stripped from the address bar as soon as it is read,
 * so a double-click shortcut lands straight in the signed-in workspace.
 */
const LAUNCHER_PREFIX = '#relay-token=';

/** Drop the launcher fragment from the address bar (never leaves the page). */
function scrubLauncherHash(): void {
  try {
    if (!window.location.hash.startsWith(LAUNCHER_PREFIX)) return;
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  } catch {
    /* history is optional */
  }
}

export function consumeLauncherToken(): boolean {
  if (typeof window === 'undefined') return false;
  const { hash } = window.location;
  if (!hash.startsWith(LAUNCHER_PREFIX)) return false;

  let token = '';
  try {
    token = decodeURIComponent(hash.slice(LAUNCHER_PREFIX.length)).trim();
  } catch {
    token = '';
  }

  if (token) writeToken(token);
  scrubLauncherHash();
  return Boolean(token);
}

if (typeof window !== 'undefined' && consumeLauncherToken()) {
  /**
   * Next.js re-applies the URL it rendered with once hydration finishes, which
   * puts the fragment back. Scrub again after it settles so the token never
   * lingers in the address bar or in history.
   */
  for (const delay of [0, 60, 250, 1000]) {
    window.setTimeout(scrubLauncherHash, delay);
  }
  window.addEventListener('hashchange', scrubLauncherHash);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — session lives in memory only */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = readToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Relay-Site', siteScope());

  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new ApiError(
      'Cannot reach the Relay server. Check your connection and try again.',
      0,
    );
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    throw new ApiError(
      (payload && (payload.error as string)) || `Request failed (${response.status}).`,
      response.status,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
};

export function mediaUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

interface UploadOptions {
  filename: string;
  contentType?: string;
  duration?: number;
  width?: number;
  height?: number;
}

export function uploadAttachment(
  file: Blob,
  options: UploadOptions,
  onProgress?: (percent: number) => void,
): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // Some browsers report recorded MediaRecorder blobs as text/plain. Force
    // the expected type so the API stores the right kind and MIME metadata.
    const payload =
      options.contentType && file.type !== options.contentType
        ? new Blob([file], { type: options.contentType })
        : file;
    form.append('file', payload, options.filename);
    if (options.duration !== undefined) form.append('duration', String(options.duration));
    if (options.width !== undefined) form.append('width', String(options.width));
    if (options.height !== undefined) form.append('height', String(options.height));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/uploads`);

    const token = readToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('X-Relay-Site', siteScope());

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onerror = () => reject(new ApiError('Upload failed — check the server connection.', 0));
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0));

    xhr.onload = () => {
      let payload: { attachment?: Attachment; error?: string } | null = null;
      try {
        payload = JSON.parse(xhr.responseText || '{}');
      } catch {
        payload = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload?.attachment) {
        onProgress?.(100);
        resolve(payload.attachment);
        return;
      }

      reject(
        new ApiError(
          payload?.error || `Upload failed (${xhr.status}).`,
          xhr.status,
        ),
      );
    };

    xhr.send(form);
  });
}
