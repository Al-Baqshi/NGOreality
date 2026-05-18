/** Canonical production origin (no trailing slash). Override with VITE_SITE_URL per environment. */
/** Vercel serves production on www; apex redirects to www. Do not add www→apex redirects in vercel.json. */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://www.ngoreality.com').replace(/\/$/, '');

export function absoluteUrl(path = ''): string {
  if (!path || path === '/') return SITE_URL;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
