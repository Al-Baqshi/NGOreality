/** Canonical production origin (no trailing slash). Override with VITE_SITE_URL per environment. */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://ngoreality.com').replace(/\/$/, '');

export function absoluteUrl(path = ''): string {
  if (!path || path === '/') return SITE_URL;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
