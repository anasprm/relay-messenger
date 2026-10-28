/**
 * Two workspaces share one API process:
 *
 *   valiyakath.vercel.app         → private (family, invite-only)
 *   relay-messengerpro.vercel.app → public  (open sign-up)
 *
 * The web client sends `X-Relay-Site` on every request and in the socket
 * handshake. That header only selects a workspace — access is still decided by
 * the account's own scope, so a spoofed header can never reach another
 * workspace's data.
 */

export const SITE_HEADER = 'x-relay-site';

/** Host prefixes that resolve to the private family workspace. */
export const PRIVATE_HOST_PREFIXES = ['valiyakath'];

export const SITE_URLS = {
  private: 'https://valiyakath.vercel.app',
  public: 'https://relay-messengerpro.vercel.app',
};

export function isScope(value) {
  return value === 'private' || value === 'public';
}

/** Accounts created before scoping existed are public. */
export function userScope(user) {
  return user?.scope === 'private' ? 'private' : 'public';
}

export function conversationScope(conversation) {
  return conversation?.scope === 'private' ? 'private' : 'public';
}

export function scopeFromHostname(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase();
  if (!host) return null;
  return PRIVATE_HOST_PREFIXES.some((prefix) => host === prefix || host.startsWith(`${prefix}.`))
    ? 'private'
    : 'public';
}

export function scopeFromOrigin(origin) {
  if (!origin) return null;
  try {
    return scopeFromHostname(new URL(origin).hostname);
  } catch {
    return null;
  }
}

/**
 * Workspace for an HTTP request: explicit client header first, then the
 * request origin, then public. Localhost requests resolve to public so the
 * development server keeps working without extra configuration.
 */
export function requestScope(req) {
  const header = String(req.headers?.[SITE_HEADER] || '')
    .trim()
    .toLowerCase();
  if (isScope(header)) return header;

  const fromOrigin = scopeFromOrigin(req.headers?.origin);
  return fromOrigin || 'public';
}

export function scopeLabel(scope) {
  return scope === 'private' ? 'private family workspace' : 'public workspace';
}

/** Message shown when an account is used on the other site. */
export function wrongWorkspaceMessage(accountScope) {
  return `This account belongs to the ${scopeLabel(accountScope)}. Sign in at ${SITE_URLS[accountScope]} instead.`;
}
