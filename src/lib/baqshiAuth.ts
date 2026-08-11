/**
 * Client for the central Baqshi identity service (auth.baqshi.com).
 *
 * NGO users sign in here; staff and the super admin stay on Supabase. The CRM
 * API trusts both issuers, so a central access token is a valid Bearer token
 * against api.ngoreality.com.
 *
 * Token handling, and why it is shaped this way:
 *
 *  - The ACCESS token lives in memory only. Putting it in localStorage would
 *    hand it to any XSS on the page for its full lifetime.
 *  - The REFRESH token lives in localStorage, because a session has to survive
 *    a reload and there is no cookie/BFF in front of this SPA. It is the
 *    documented trade-off, not an oversight.
 *  - Refresh tokens ROTATE. Presenting an old one is treated by the server as
 *    theft and revokes the whole session family, so a refresh must never run
 *    twice concurrently — hence the single-flight promise below. A double
 *    refresh does not just fail, it logs the user out everywhere.
 *
 * Known limit: single-flight is per tab. Two tabs refreshing in the same
 * instant can still replay, which ends the family and forces a fresh sign-in.
 * Fixing that properly needs a cross-tab lock (BroadcastChannel or Web Locks);
 * until then a refresh failure clears the session rather than retrying, so the
 * user gets a clean "sign in again" instead of a wedged app.
 *
 * There is no npm package for this service yet; this file is the client.
 */

const AUTH_BASE = (import.meta.env.VITE_BAQSHI_AUTH_URL ?? 'https://auth.baqshi.com').replace(/\/$/, '');

/** Publishable app key identifying NGOreality to the central service. */
const APP_KEY =
  import.meta.env.VITE_BAQSHI_APP_KEY ?? 'pk_fbef4d16bce892ad19ed591012abbaec';

/** Where central users manage their own account (reset, verify, profile). */
export const BAQSHI_ACCOUNT_URL = 'https://account.baqshi.com';
export const BAQSHI_FORGOT_PASSWORD_URL = `${BAQSHI_ACCOUNT_URL}/forgot-password`;

const REFRESH_STORAGE_KEY = 'baqshi.refresh_token';

/** Refresh this long before expiry so a token cannot die mid-request. */
const EXPIRY_SKEW_MS = 30_000;

export interface CentralUser {
  id: string;
  username?: string;
  email?: string;
  full_name?: string;
  email_verified_at?: string | null;
}

interface SessionResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: CentralUser;
}

export class CentralAuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'CentralAuthError';
  }
}

/* ── in-memory session state ─────────────────────────────────────────────── */

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let currentUser: CentralUser | null = null;
let refreshInFlight: Promise<string | null> | null = null;

type Listener = (user: CentralUser | null) => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn(currentUser));
}

export function onCentralAuthChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_STORAGE_KEY);
  } catch {
    return null; // private mode / storage disabled
  }
}

function writeRefreshToken(token: string | null) {
  try {
    if (token) localStorage.setItem(REFRESH_STORAGE_KEY, token);
    else localStorage.removeItem(REFRESH_STORAGE_KEY);
  } catch {
    /* storage unavailable: the session simply will not survive a reload */
  }
}

function adopt(session: SessionResponse) {
  accessToken = session.access_token;
  accessTokenExpiresAt = Date.now() + session.expires_in * 1000;
  currentUser = session.user;
  writeRefreshToken(session.refresh_token);
  emit();
}

function clearSession() {
  accessToken = null;
  accessTokenExpiresAt = 0;
  currentUser = null;
  writeRefreshToken(null);
  emit();
}

/* ── transport ───────────────────────────────────────────────────────────── */

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Required on EVERY request: it tells the central service which product
      // is asking, which is what scopes the token's audience.
      'X-Baqshi-App': APP_KEY,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* fall through to the status-based message */
  }

  if (!res.ok) {
    const message =
      (parsed as { error?: string; message?: string } | null)?.error ??
      (parsed as { message?: string } | null)?.message ??
      `Request failed (${res.status})`;
    throw new CentralAuthError(message, res.status);
  }
  return parsed as T;
}

/* ── public API ──────────────────────────────────────────────────────────── */

export function hasCentralSession(): boolean {
  return Boolean(accessToken || readRefreshToken());
}

export function getCentralUser(): CentralUser | null {
  return currentUser;
}

export async function centralSignIn(
  usernameOrEmail: string,
  password: string,
): Promise<CentralUser> {
  const session = await post<SessionResponse>('/auth/signin', {
    username: usernameOrEmail.trim(),
    password,
  });
  adopt(session);
  return session.user;
}

/**
 * Exchange the stored refresh token for a new session.
 *
 * Single-flight: concurrent callers share one request. Rotation makes this
 * mandatory rather than an optimisation — a second refresh with the same token
 * would be read as replay and kill the family.
 */
export function refreshCentralSession(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = readRefreshToken();
  if (!refreshToken) {
    clearSession();
    return Promise.resolve(null);
  }

  refreshInFlight = post<SessionResponse>('/auth/refresh', { refresh_token: refreshToken })
    .then((session) => {
      adopt(session);
      return session.access_token;
    })
    .catch(() => {
      // Either the token expired or the family was revoked. Both mean the only
      // honest next step is a fresh sign-in.
      clearSession();
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/** A valid access token, refreshing first if it is missing or about to expire. */
export async function getCentralAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < accessTokenExpiresAt - EXPIRY_SKEW_MS) {
    return accessToken;
  }
  if (!readRefreshToken()) return null;
  return refreshCentralSession();
}

export async function centralSignOut(): Promise<void> {
  const refreshToken = readRefreshToken();
  clearSession();
  if (!refreshToken) return;
  try {
    await post('/auth/logout', { refresh_token: refreshToken });
  } catch {
    // The local session is already gone; a failed server-side revoke must not
    // leave the user looking signed in.
  }
}

/**
 * Restore a session on page load. Returns the user, or null if there is no
 * usable refresh token.
 */
export async function restoreCentralSession(): Promise<CentralUser | null> {
  if (!readRefreshToken()) return null;
  await refreshCentralSession();
  return currentUser;
}

/**
 * fetch() with the central access token attached, retrying ONCE after a
 * refresh on 401. Used for calls to our own API, which accepts central tokens.
 */
export async function centralFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const send = async (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Baqshi-App', APP_KEY);
    return fetch(input, { ...init, headers });
  };

  let res = await send(await getCentralAccessToken());
  if (res.status !== 401) return res;

  // One retry only. If the refreshed token is also rejected, the problem is
  // authorisation, not staleness, and retrying would just loop.
  const fresh = await refreshCentralSession();
  if (!fresh) return res;
  res = await send(fresh);
  return res;
}
