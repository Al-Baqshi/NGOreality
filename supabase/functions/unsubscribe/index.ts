// One-click unsubscribe. This endpoint is the legal facility itself, so it is
// deliberately the simplest thing in the codebase: no session, no database
// password, no dependency that can be down when someone is trying to make us
// stop emailing them.
//
// Three callers:
//   GET  /unsubscribe?token=...            human opens the link
//   POST /unsubscribe?token=...            mailbox provider RFC 8058 one-click
//   POST /unsubscribe?token=... confirm=1  human confirms on the website page
//
// Safari (especially iOS Mail → Safari) treats HTML from this function as a
// file download — the gateway does not reliably pass Content-Type: text/html.
// GET therefore 302s to the website confirm page. Provider one-click stays a
// fast plain 200. A confirmed POST 303s back to the website success page.
//
// This function must be deployed WITHOUT JWT verification (verify_jwt = false).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = (Deno.env.get("NOTIFY_PUBLIC_SITE_URL") ?? "https://www.ngoreality.com").replace(/\/$/, "");

async function suppressByToken(token: string): Promise<void> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    // Succeeds for an unknown token too. Distinguishing them would turn this
    // into an oracle for testing whether an address is on our list.
    await supabase.rpc("unsubscribe_by_token", { p_token: token });
  } catch {
    // Never surface an error to someone asking not to be emailed.
  }
}

function redirect(pathAndQuery: string, status: 302 | 303) {
  return new Response(null, {
    status,
    headers: {
      Location: `${SITE}${pathAndQuery}`,
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req: Request) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";

  if (req.method === "POST") {
    if (token) await suppressByToken(token);

    const rawBody = await req.text();
    const params = new URLSearchParams(rawBody);
    const humanConfirmed = params.get("confirm") === "1";

    // RFC 8058 one-click from Gmail/Outlook — fast plain 200, no HTML.
    if (!humanConfirmed) {
      return new Response("OK", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    return redirect("/unsubscribe?done=1", 303);
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD, POST" } });
  }

  // GET — never unsubscribe until they confirm. Send them to the website page
  // so the browser actually renders a button instead of downloading source.
  if (!token) return redirect("/unsubscribe", 302);
  return redirect(`/unsubscribe?token=${encodeURIComponent(token)}`, 302);
});
