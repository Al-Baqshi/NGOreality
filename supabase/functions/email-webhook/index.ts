// Resend delivery webhook: bounces and complaints go straight onto the
// suppression list.
//
// Without this, a cohort of 500 teaches us nothing. Dead registry addresses
// keep being retried, hard bounces accumulate against the sending domain, and
// the first sign of trouble is that transactional mail — badge decisions,
// receipts — stops arriving too, because reputation is per-domain and does not
// distinguish the cold outreach that earned it.
//
// A spam complaint is even more urgent than a bounce: the recipient has said
// so explicitly, and continuing to mail them is both the thing the Unsolicited
// Electronic Messages Act penalises and the fastest route to being blocked.
//
// Deploy WITHOUT JWT verification (verify_jwt = false); Resend authenticates
// with a Svix signature, verified below, not with a Supabase token.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Hard failures only. A soft bounce (full mailbox, greylisting) is temporary,
// and suppressing on one would silently delete a real charity from every future
// cohort over a transient condition.
const SUPPRESS_ON: Record<string, "bounce" | "complaint"> = {
  "email.bounced": "bounce",
  "email.complained": "complaint",
};

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Svix signature check, as Resend sends it.
 *
 * Unverified, this endpoint is a way for anyone to suppress any address —
 * quietly cutting a charity off from every email we send, including the ones
 * they asked for. That is a denial-of-service on our own members, so the
 * signature is required rather than best-effort.
 */
async function signatureValid(req: Request, raw: string, secret: string): Promise<boolean> {
  const id = req.headers.get("svix-id") ?? "";
  const ts = req.headers.get("svix-timestamp") ?? "";
  const sigHeader = req.headers.get("svix-signature") ?? "";
  if (!id || !ts || !sigHeader) return false;

  // Reject anything outside a five-minute window so a captured call cannot be
  // replayed later to re-suppress an address a member has since restored.
  const skew = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(skew) || skew > 300) return false;

  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(key), (c) => c.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(`${id}.${ts}.${raw}`)),
  );

  // The header carries space-separated "v1,<base64>" entries during rotation.
  for (const part of sigHeader.split(" ")) {
    const [version, b64] = part.split(",");
    if (version !== "v1" || !b64) continue;
    try {
      if (timingSafeEqual(mac, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))) return true;
    } catch {
      /* malformed entry; try the next */
    }
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
  const raw = await req.text();

  if (!secret) {
    // Fail closed. An unverified suppression endpoint is worse than no webhook.
    return new Response(JSON.stringify({ error: "RESEND_WEBHOOK_SECRET is not set" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!(await signatureValid(req, raw, secret))) {
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: { type?: string; data?: { to?: string | string[]; email?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: "malformed body" }), { status: 400 });
  }

  const reason = SUPPRESS_ON[event.type ?? ""];
  if (!reason) {
    // Deliveries, opens and soft bounces are acknowledged and ignored. A non-2xx
    // here makes Resend retry, and retries on events we do not act on are noise.
    return new Response(JSON.stringify({ ok: true, ignored: event.type ?? "unknown" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const to = event.data?.to;
  const addresses = (Array.isArray(to) ? to : [to ?? event.data?.email])
    .filter((a): a is string => typeof a === "string" && a.includes("@"));

  if (addresses.length === 0) {
    return new Response(JSON.stringify({ ok: true, ignored: "no address in payload" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  for (const address of addresses) {
    await supabase.rpc("suppress_email", {
      p_email: address,
      p_reason: reason,
      p_detail: `resend:${event.type}`,
    });
  }

  return new Response(JSON.stringify({ ok: true, suppressed: addresses.length, reason }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
