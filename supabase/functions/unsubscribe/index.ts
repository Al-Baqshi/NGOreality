// One-click unsubscribe. This endpoint is the legal facility itself, so it is
// deliberately the simplest thing in the codebase: no session, no database
// password, no dependency that can be down when someone is trying to make us
// stop emailing them.
//
// Two callers:
//   GET  /unsubscribe?token=...  a human clicking the link in the footer
//   POST /unsubscribe?token=...  a mailbox provider honouring RFC 8058
//                                (List-Unsubscribe-Post: List-Unsubscribe=One-Click)
//
// Both suppress and both answer 200. Gmail and Outlook send the POST with no
// user interaction and no credentials; anything other than a fast 200 makes
// them stop offering the native unsubscribe button, which pushes recipients
// toward "report spam" instead — worse for the recipient and far worse for the
// deliverability of the domain carrying 29,229 invitations.
//
// This function must be deployed WITHOUT JWT verification (verify_jwt = false).
// A recipient clicking "unsubscribe" has no account and no token of ours, and
// requiring one would make the facility non-functional, which is the
// contravention it exists to prevent.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const page = (title: string, message: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
       background:#f6f6f4;color:#0b1020;margin:0;min-height:100vh;
       display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border:3px solid #0b1020;box-shadow:6px 6px 0 #0b1020;
        max-width:34rem;padding:28px 32px}
  h1{font-size:1.25rem;text-transform:uppercase;letter-spacing:-.01em;margin:0 0 12px}
  p{line-height:1.6;margin:0 0 10px;font-size:.95rem}
  a{color:#0b1020}
  @media (prefers-color-scheme:dark){
    body{background:#0b1020;color:#f6f6f4}
    .card{background:#141a2e;border-color:#f6f6f4;box-shadow:6px 6px 0 #f6f6f4}
    a{color:#f6f6f4}}
</style></head>
<body><div class="card"><h1>${title}</h1>${message}</div></body></html>`;

Deno.serve(async (req: Request) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";

  const html = (body: string, status = 200) =>
    new Response(body, {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });

  if (!token) {
    return html(page("Link incomplete",
      `<p>That unsubscribe link is missing its token. Please use the link exactly as it
        appears in the email, or reply to the message and we will remove you by hand.</p>`), 400);
  }

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
    // Never surface an error to someone asking not to be emailed. The address
    // is far more likely already suppressed than not, and a failure page
    // invites a spam complaint. Failures are visible in function logs.
  }

  // RFC 8058 one-click: the provider wants a fast 200 and does not render HTML.
  if (req.method === "POST") {
    return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return html(page("You have been unsubscribed",
    `<p>We will not send you any more outreach email.</p>
     <p>Messages about something you asked us for — a badge decision, a receipt,
        a monitoring alert for a site you registered — are separate and are not
        affected by this.</p>
     <p><a href="https://www.ngoreality.com/public">Back to NGOreality</a></p>`));
});
