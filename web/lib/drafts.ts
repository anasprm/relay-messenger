const PREFIX = 'relay.draft';

function storageAvailable(): boolean {
  return typeof window !== 'undefined';
}

export function draftKey(userId: string, conversationId: string): string {
  return `${PREFIX}.${userId}.${conversationId}`;
}

export function readDraft(userId: string, conversationId: string): string {
  if (!storageAvailable()) return '';
  try {
    return window.localStorage.getItem(draftKey(userId, conversationId)) || '';
  } catch {
    return '';
  }
}

export function writeDraft(userId: string, conversationId: string, text: string): void {
  if (!storageAvailable()) return;
  try {
    const key = draftKey(userId, conversationId);
    if (text.trim()) window.localStorage.setItem(key, text);
    else window.localStorage.removeItem(key);
  } catch {
    /* storage is optional */
  }
}

export function clearDraft(userId: string, conversationId: string): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(draftKey(userId, conversationId));
  } catch {
    /* storage is optional */
  }
}

export function readAllDrafts(userId: string): Record<string, string> {
  if (!storageAvailable()) return {};
  const prefix = `${PREFIX}.${userId}.`;
  const drafts: Record<string, string> = {};
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      const conversationId = key.slice(prefix.length);
      const value = window.localStorage.getItem(key);
      if (conversationId && value && value.trim()) drafts[conversationId] = value;
    }
  } catch {
    return {};
  }
  return drafts;
}
