/**
 * Error reporting.
 *
 * There was none. 23 query call sites used `if (!error && data) setX(data)`,
 * so a failing query left the previous (usually empty) state and rendered as an
 * empty page. A broken public directory and a directory with no results looked
 * identical — to visitors and to us. That is the specific failure this exists
 * to end, and it is why this landed before the directory lockdown rather than
 * after: revoking a policy incorrectly would otherwise have shipped silently.
 *
 * Deliberately dependency-free and provider-agnostic. `captureError` is the
 * single place to swap in Sentry (or anything else) later; every call site
 * already routes through it, so that swap is one file.
 *
 * Set VITE_ERROR_WEBHOOK_URL to receive reports somewhere durable. Without it
 * you still get structured console output, which is the difference between
 * "the page is blank" and "PostgREST returned 42501 on organizations".
 */

const WEBHOOK = import.meta.env.VITE_ERROR_WEBHOOK_URL as string | undefined;

/**
 * A runaway render loop can produce thousands of identical errors. Cap what
 * leaves the browser so a bug cannot turn into a self-inflicted flood — and so
 * the webhook stays readable.
 */
const MAX_REPORTS_PER_SESSION = 50;
let reportsSent = 0;

/** Collapse repeats: the same error from the same place is reported once. */
const seen = new Set<string>();

export interface ErrorContext {
  /** Where this happened, e.g. 'useDirectoryPage'. Required — an unlabelled report is nearly useless. */
  where: string;
  /** Extra non-sensitive detail: filters, ids, status codes. Never tokens or PII. */
  detail?: Record<string, unknown>;
}

export interface NormalisedError {
  message: string;
  name: string;
  code?: string;
  stack?: string;
}

/**
 * Supabase returns plain objects, not Errors, so `instanceof Error` misses the
 * thing we most need to see.
 */
export function normaliseError(err: unknown): NormalisedError {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  if (err && typeof err === 'object') {
    const e = err as { message?: string; code?: string; details?: string; hint?: string };
    return {
      message: e.message ?? e.details ?? e.hint ?? JSON.stringify(err).slice(0, 500),
      name: 'PostgrestError',
      code: e.code,
    };
  }
  return { message: String(err), name: 'UnknownError' };
}

/**
 * Report an error. Safe to call from anywhere, never throws, never blocks.
 * Returns the human-readable message so callers can put it in component state
 * in the same expression.
 */
export function captureError(err: unknown, ctx: ErrorContext): string {
  const e = normaliseError(err);

  // Structured and greppable. `where` first, because that is what you search.
  console.error(`[ngoreality] ${ctx.where}:`, e.message, {
    code: e.code,
    ...ctx.detail,
  });

  const key = `${ctx.where}|${e.code ?? ''}|${e.message}`;
  if (seen.has(key) || reportsSent >= MAX_REPORTS_PER_SESSION || !WEBHOOK) {
    return e.message;
  }
  seen.add(key);
  reportsSent += 1;

  try {
    const body = JSON.stringify({
      where: ctx.where,
      message: e.message,
      name: e.name,
      code: e.code,
      stack: e.stack?.slice(0, 2000),
      detail: ctx.detail,
      url: window.location.pathname + window.location.search,
      userAgent: navigator.userAgent,
      at: new Date().toISOString(),
    });
    // keepalive so a report survives the navigation that often follows a crash.
    void fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* reporting must never surface as a second error */
    });
  } catch {
    /* serialising failed; the console line above is still there */
  }

  return e.message;
}

/**
 * Catch what never reaches a try/catch: errors thrown outside React's tree and
 * promise rejections nobody awaited.
 */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    captureError(event.error ?? event.message, {
      where: 'window.onerror',
      detail: { source: event.filename, line: event.lineno },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    captureError(event.reason, { where: 'unhandledrejection' });
  });
}
