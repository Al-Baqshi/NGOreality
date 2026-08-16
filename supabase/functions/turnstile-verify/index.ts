// Supabase Edge Function: turnstile-verify
// Purpose: Verify Cloudflare Turnstile tokens server-side (fail closed)

type VerifyBody = {
  token?: string;
  // Optional: include context for logging/tracing only (never secrets)
  action?: string;
};

const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY');
if (!TURNSTILE_SECRET_KEY) {
  console.error('TURNSTILE_SECRET_KEY is not set. Failing closed.');
}

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Connection': 'keep-alive',
    },
  });
}

function safeToken(body: VerifyBody): string | null {
  const t = body.token;
  if (!t || typeof t !== 'string') return null;
  const trimmed = t.trim();
  return trimmed.length ? trimmed : null;
}

Deno.serve(async (req: Request) => {
  // Expect JSON POST
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Expected application/json' }, 400);
  }

  const body = (await req.json().catch(() => null)) as VerifyBody | null;
  if (!body) return jsonResponse({ error: 'Invalid JSON body' }, 400);

  // Fail closed if secret isn't configured
  if (!TURNSTILE_SECRET_KEY) {
    return jsonResponse({ error: 'temporarily unavailable' }, 503);
  }

  const token = safeToken(body);
  if (!token) {
    return jsonResponse({ error: 'Missing Turnstile token' }, 400);
  }

  // Best-effort: also provide the request IP (optional)
  // Cloudflare uses this to detect anomalies.
  const forwardedFor = req.headers.get('x-forwarded-for');
  const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : undefined;

  const form = new URLSearchParams({
    secret: TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (clientIp) form.set('remoteip', clientIp);
  if (body.action) form.set('action', body.action);

  const verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  // If Cloudflare is unreachable, fail closed
  if (!verifyRes.ok) {
    console.error('Turnstile verify non-2xx:', verifyRes.status);
    return jsonResponse({ error: 'temporarily unavailable' }, 503);
  }

  const result = (await verifyRes.json().catch(() => null)) as
    | {
        success?: boolean;
        'error-codes'?: string[];
        challenge_ts?: string;
        hostname?: string;
        action?: string;
        score?: string;
      }
    | null;

  if (!result || typeof result.success !== 'boolean') {
    return jsonResponse({ error: 'temporarily unavailable' }, 503);
  }

  if (!result.success) {
    // fail closed on invalid tokens
    return jsonResponse(
      {
        ok: false,
        error: 'invalid token',
        errorCodes: result['error-codes'] ?? [],
      },
      400,
    );
  }

  return jsonResponse({
    ok: true,
    action: result.action,
    challenge_ts: result.challenge_ts,
    hostname: result.hostname,
    score: result.score,
  });
});
