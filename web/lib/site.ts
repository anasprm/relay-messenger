/**
 * Site identity. One deployment serves two hostnames, and each hostname is a
 * separate workspace on the API:
 *
 *   valiyakath.vercel.app         → private family workspace (invite-only)
 *   relay-messengerpro.vercel.app → public workspace (open sign-up)
 *
 * Keep PRIVATE_HOST_PREFIXES in sync with `themeScript` in app/layout.tsx and
 * with PRIVATE_HOST_PREFIXES in server/src/site.js.
 */
export type SiteScope = 'private' | 'public';

export const PRIVATE_HOST_PREFIXES = ['valiyakath'];

export function siteScope(): SiteScope {
  if (typeof window === 'undefined') return 'public';
  const host = window.location.hostname.toLowerCase();
  return PRIVATE_HOST_PREFIXES.some(
    (prefix) => host === prefix || host.startsWith(`${prefix}.`),
  )
    ? 'private'
    : 'public';
}

export function isPrivateSite(): boolean {
  return siteScope() === 'private';
}
