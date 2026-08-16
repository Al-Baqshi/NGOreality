// Public contact form submission, behind Cloudflare Turnstile.
//
// WHY THIS EXISTS
//
// The form used to INSERT into inquiry_submissions straight from the browser,
// with an RLS policy of `WITH CHECK (true)` for anon. Turnstile ran in the page
// first, but that protects nothing: the anon key is public, so a bot skips the
// page entirely and POSTs to /rest/v1/inquiry_submissions. Every piece of spam
// in the inbox arrived that way.
//
// Client-side bot checks cannot secure a server-side write. So the write moves
// here, the Turnstile token is verified with the SECRET key server-side, and
// anon INSERT is revoked. There is no longer a path to the table that does not
// pass a challenge.
//
// verify_jwt is false on purpose: the caller is an anonymous member of the
// public. Turnstile IS the authentication.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_FIELD = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(v: unknown, max = 300): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...cors },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  const token = clean(body.turnstile_token, 4096);

  // FAIL CLOSED. The previous client-side helper returned `true` when its API
  // URL was unset, so a missing variable silently disabled spam protection —
  // which is exactly how the inbox filled up without anyone noticing.
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not set; refusing submissions");
    return json(
      {
        error: "The contact form is temporarily unavailable. Please email us directly.",
        reason: "turnstile_not_configured",
      },
      503,
    );
  }
  if (!token) return json({ error: "Please complete the verification challenge." }, 400);

  const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret,
      response: token,
      remoteip: req.headers.get("cf-connecting-ip") ?? undefined,
    }),
  }).then((r) => r.json()).catch(() => null);

  if (!verify?.success) {
    console.warn("turnstile rejected", verify?.["error-codes"]);
    return json({ error: "Verification failed. Please try again." }, 403);
  }

  const organizationName = clean(body.organization_name);
  const contactName = clean(body.contact_name);
  const email = clean(body.email);
  const phone = clean(body.phone, 60);
  const message = clean(body.message, MAX_FIELD);
  const category = clean(body.category, 60);

  // Set when someone claims a directory listing. Validated rather than trusted:
  // an arbitrary string here would be written straight into a uuid column.
  const rawOrgId = clean(body.organization_id, 64);
  const organizationId = UUID_RE.test(rawOrgId) ? rawOrgId : null;

  if (!email.includes("@") || email.length < 5) {
    return json({ error: "A valid email address is required." }, 400);
  }
  if (!message && !organizationName) {
    return json({ error: "Please tell us a little about your enquiry." }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { error } = await supabase.from("inquiry_submissions").insert({
    organization_name: organizationName,
    contact_name: contactName,
    email,
    phone,
    message,
    category: category || "general",
    organization_id: organizationId,
  });

  if (error) {
    console.error("inquiry insert failed", error.message);
    return json({ error: "We could not record your enquiry. Please try again." }, 500);
  }

  return json({ ok: true });
});
