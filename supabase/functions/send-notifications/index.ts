// Flushes queued notification_events through Resend.
//
// Why an Edge Function rather than the Go worker: the worker can do this too,
// but it needs a direct Postgres connection string and is not deployed, so
// emails were queuing forever — an NGO applied for a badge and heard nothing.
// This needs no database password, costs nothing idle, and runs on pg_cron.
//
// ONLY ONE SENDER MAY BE LIVE or members get duplicates. If cmd/worker is ever
// deployed, unschedule the flush-notification-emails cron job.
//
// ---------------------------------------------------------------------------
// AUTHENTICATION
//
// `verify_jwt` is NOT authentication for this endpoint. It is satisfied by the
// publishable key that ships inside our own JS bundle, so with it alone any
// visitor could read queued recipient addresses through ?dry_run, flush the
// send queue on demand, or send mail from our verified domain through
// ?test_to — an open relay on the exact domain that will carry 29,229 invites,
// which is also the fastest way to destroy its deliverability.
//
// This function therefore authenticates itself, with a shared secret that is
// never shipped to a browser. Two callers are legitimate: pg_cron, which sends
// X-Worker-Key, and an operator holding the service-role key.
// ---------------------------------------------------------------------------

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

// The verified Resend domain is contact.ngoreality.com, NOT the apex. Sending
// from an unverified domain is rejected by Resend with a 4xx, which this
// function parks as 'failed' — so getting this wrong means every email silently
// dies. Keep in step with what is verified in the Resend dashboard.
const DEFAULT_FROM = "NGOreality <notifications@contact.ngoreality.com>";

interface NotificationEvent {
  id: string;
  recipient_email: string;
  subject: string;
  body_text: string;
  template: string;
  category: string;
  attempts: number;
}

/** Constant-time compare, so a wrong key cannot be found a byte at a time. */
function secretsMatch(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  // --- authenticate before anything else is read or revealed ---------------
  const workerKey = Deno.env.get("NOTIFY_WORKER_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const presentedWorker = req.headers.get("X-Worker-Key") ?? "";
  const presentedBearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");

  const authorised =
    (workerKey !== "" && secretsMatch(presentedWorker, workerKey)) ||
    (serviceKey !== "" && secretsMatch(presentedBearer, serviceKey));

  if (!authorised) {
    // No detail, no environment listing, no hint about which key was wrong.
    return json({ error: "unauthorized" }, 401);
  }

  if (workerKey === "") {
    // Reachable only with the service-role key, so it is safe to be explicit.
    return json({
      error: "NOTIFY_WORKER_KEY is not set",
      note:
        "pg_cron cannot authenticate without it. Set it in Edge Function secrets " +
        "and include it in the flush-notification-emails cron headers.",
    }, 503);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("NOTIFY_FROM_EMAIL") ?? DEFAULT_FROM;
  const replyTo = Deno.env.get("NOTIFY_REPLY_TO") ?? "";
  // Required on commercial mail by the Unsolicited Electronic Messages Act
  // 2007. Deliberately has no default: inventing a postal address would be
  // worse than refusing to send, so outreach is blocked until it is set.
  const postalAddress = Deno.env.get("NOTIFY_POSTAL_ADDRESS") ?? "";
  const siteUrl = Deno.env.get("NOTIFY_SITE_URL") ?? "https://www.ngoreality.com";
  const unsubBase = Deno.env.get("NOTIFY_UNSUBSCRIBE_URL") ??
    `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/unsubscribe`;

  if (!resendKey) {
    return json({
      error: "RESEND_API_KEY is not set",
      where_to_set:
        "Supabase Dashboard -> Project Settings -> Edge Functions -> Secrets.",
      note: "Until it is set, nothing is delivered and events stay 'pending', which is the safe state.",
    }, 503);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const testTo = url.searchParams.get("test_to");

  if (testTo) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [testTo],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: "[NGOreality] Email delivery test",
        text:
          "This is a delivery test from the NGOreality notification pipeline.\n\n" +
          `Sent from: ${fromEmail}\n` +
          "If you received this, queued notifications will now reach members.\n\n" +
          "— NGOreality",
      }),
    });
    const detail = (await res.text()).slice(0, 500);
    return json({ test_to: testTo, from: fromEmail, ok: res.ok, status: res.status, detail },
      res.ok ? 200 : 502);
  }

  const { data: pending, error: readErr } = await supabase
    .from("notification_events")
    .select("id, recipient_email, subject, body_text, template, category, attempts")
    .eq("status", "pending")
    .eq("channel", "email")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (readErr) {
    return json({ error: "could not read the queue", detail: readErr.message }, 500);
  }

  const events = (pending ?? []) as NotificationEvent[];
  if (events.length === 0) {
    return json({ sent: 0, failed: 0, skipped: 0, from: fromEmail, message: "queue empty" });
  }
  if (dryRun) {
    return json({
      dry_run: true,
      from: fromEmail,
      would_send: events.length,
      by_category: events.reduce((acc: Record<string, number>, e) => {
        acc[e.category] = (acc[e.category] ?? 0) + 1;
        return acc;
      }, {}),
    });
  }

  let sent = 0, failed = 0, skipped = 0, suppressed = 0;

  for (const ev of events) {
    const to = (ev.recipient_email ?? "").trim().toLowerCase();

    if (!to || !to.includes("@")) {
      await supabase.from("notification_events")
        .update({ status: "failed", error_message: "no valid recipient address" })
        .eq("id", ev.id).eq("status", "pending");
      skipped++;
      continue;
    }

    // Suppression is also enforced by trigger at enqueue time. Re-checking here
    // catches anyone who unsubscribed AFTER their message was queued — with a
    // cohort of 500 and a multi-hour drain, that window is very real.
    const { data: isSupp } = await supabase.rpc("is_email_suppressed", { p_email: to });
    if (isSupp === true) {
      await supabase.from("notification_events")
        .update({ status: "suppressed", error_message: "recipient unsubscribed or bounced" })
        .eq("id", ev.id).eq("status", "pending");
      suppressed++;
      continue;
    }

    const isOutreach = ev.category === "outreach";

    // Commercial mail without a functional unsubscribe facility and an
    // identifying postal address is the contravention itself. Refuse to send
    // rather than send unlawfully; transactional mail is unaffected.
    if (isOutreach && postalAddress === "") {
      await supabase.from("notification_events")
        .update({
          status: "pending",
          error_message: "NOTIFY_POSTAL_ADDRESS is not set; outreach withheld",
        })
        .eq("id", ev.id).eq("status", "pending");
      skipped++;
      continue;
    }

    // Claim BEFORE sending. A second concurrent invocation claims zero rows and
    // skips — a duplicate email is worse than a delayed one. claimed_at is what
    // requeue_stuck_notifications measures; without it, it asked how old the
    // ROW was and requeued rows claimed seconds ago.
    const { data: claimed, error: claimErr } = await supabase
      .from("notification_events")
      .update({
        status: "sending",
        claimed_at: new Date().toISOString(),
        attempts: (ev.attempts ?? 0) + 1,
      })
      .eq("id", ev.id)
      .eq("status", "pending")
      .select("id");

    if (claimErr || !claimed || claimed.length === 0) {
      skipped++;
      continue;
    }

    try {
      let token: string | null = null;
      if (isOutreach) {
        const { data: tok } = await supabase.rpc("unsubscribe_token_for", { p_email: to });
        token = (tok as string | null) ?? null;
      }
      const unsubUrl = token ? `${unsubBase}?token=${token}` : null;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      };

      const payload: Record<string, unknown> = {
        from: fromEmail,
        to: [to],
        subject: ev.subject,
        text: isOutreach && unsubUrl
          ? `${ev.body_text}\n\n` +
            `—\nYou received this because ${to} is listed on the public New Zealand ` +
            `charities register. To stop receiving these, unsubscribe here:\n${unsubUrl}\n\n` +
            `${postalAddress}\n${siteUrl}`
          : ev.body_text,
      };
      if (replyTo) payload.reply_to = replyTo;

      // RFC 8058 one-click. Mailbox providers surface this as a native
      // "unsubscribe" control, and its absence on bulk mail is itself a
      // spam signal — so this protects deliverability as well as compliance.
      if (isOutreach && unsubUrl) {
        payload.headers = {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        };
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = (await res.text()).slice(0, 400);
        const retryable = res.status >= 500 || res.status === 429;
        const exhausted = (ev.attempts ?? 0) + 1 >= MAX_ATTEMPTS;
        await supabase.from("notification_events")
          .update({
            status: retryable && !exhausted ? "pending" : "failed",
            claimed_at: null,
            error_message: `resend ${res.status}: ${detail}`,
          })
          .eq("id", ev.id);
        failed++;
        continue;
      }

      await supabase.from("notification_events")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          claimed_at: null,
          error_message: "",
        })
        .eq("id", ev.id);
      sent++;
    } catch (err) {
      const exhausted = (ev.attempts ?? 0) + 1 >= MAX_ATTEMPTS;
      await supabase.from("notification_events")
        .update({
          status: exhausted ? "failed" : "pending",
          claimed_at: null,
          error_message: `network: ${err instanceof Error ? err.message : String(err)}`,
        })
        .eq("id", ev.id);
      failed++;
    }
  }

  return json({ sent, failed, skipped, suppressed, considered: events.length, from: fromEmail });
});
