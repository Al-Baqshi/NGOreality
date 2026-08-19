// One-click unsubscribe. This endpoint is the legal facility itself, so it is
// deliberately the simplest thing in the codebase: no session, no database
// password, no dependency that can be down when someone is trying to make us
// stop emailing them.
//
// Three callers:
//   GET  /unsubscribe?token=...           human opens the link — confirm page first
//   POST /unsubscribe?token=...           mailbox provider RFC 8058 one-click
//   POST /unsubscribe?token=... confirm=1  human clicks Unsubscribe on the page
//
// Provider one-click must stay a fast plain 200. A human clicking the email link
// sees a friendly page with a single button so they do not unsubscribe by accident.
//
// This function must be deployed WITHOUT JWT verification (verify_jwt = false).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://www.ngoreality.com";

const styles = `
  *,*::before,*::after{box-sizing:border-box}
  body{
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
    background:linear-gradient(165deg,#f6f8fa 0%,#eef2f6 45%,#e8eef3 100%);
    color:#041c3c;margin:0;min-height:100vh;
    display:flex;align-items:center;justify-content:center;padding:24px 16px;
    -webkit-font-smoothing:antialiased;
  }
  .shell{width:100%;max-width:28rem}
  .brand{
    display:flex;align-items:center;gap:10px;margin-bottom:20px;
    font-weight:800;font-size:1.05rem;letter-spacing:-.02em;color:#041c3c;
  }
  .brand-mark{
    width:36px;height:36px;border-radius:10px;
    background:linear-gradient(135deg,#0d9488,#041c3c);
    display:grid;place-items:center;color:#fff;font-size:.72rem;font-weight:800;
  }
  .card{
    background:#fff;border:1px solid #d4dee8;border-radius:16px;
    box-shadow:0 12px 40px rgba(4,28,60,.08);padding:28px 24px 24px;
  }
  h1{font-size:1.35rem;font-weight:700;line-height:1.25;margin:0 0 10px;color:#041c3c}
  .lead{font-size:.98rem;line-height:1.65;color:#4a6170;margin:0 0 18px}
  .note{
    font-size:.86rem;line-height:1.55;color:#6b8294;
    background:#f4f7fa;border:1px solid #e2e9f0;border-radius:10px;
    padding:12px 14px;margin:0 0 22px;
  }
  .actions{display:flex;flex-direction:column;gap:10px}
  button[type=submit],.btn-primary{
    appearance:none;border:0;border-radius:10px;cursor:pointer;
    background:#041c3c;color:#fff;font:inherit;font-size:.95rem;font-weight:600;
    padding:14px 18px;width:100%;transition:background .15s,transform .1s;
  }
  button[type=submit]:hover{background:#0a2d5c}
  button[type=submit]:active{transform:scale(.99)}
  .btn-ghost{
    display:block;text-align:center;text-decoration:none;
    border-radius:10px;border:1px solid #c8d4df;
    color:#4a6170;font-size:.92rem;font-weight:600;padding:12px 18px;
    background:#fff;transition:border-color .15s,background .15s;
  }
  .btn-ghost:hover{border-color:#94a8b8;background:#fafbfc}
  .success-icon{
    width:52px;height:52px;border-radius:50%;margin:0 auto 16px;
    background:#ecfdf5;color:#0d9488;display:grid;place-items:center;
    font-size:1.5rem;line-height:1;
  }
  .footer{margin-top:18px;text-align:center;font-size:.78rem;color:#8fa3b0}
  .footer a{color:#0d9488;text-decoration:none;font-weight:600}
  .footer a:hover{text-decoration:underline}
  @media (prefers-color-scheme:dark){
    body{background:linear-gradient(165deg,#0b1220 0%,#0f1724 100%);color:#e5eef5}
    .brand{color:#e5eef5}
    .card{background:#141c24;border-color:#243042;box-shadow:0 12px 40px rgba(0,0,0,.35)}
    h1{color:#f1f5f9}
    .lead{color:#b8c5d0}
    .note{background:#101820;border-color:#243042;color:#94a8b8}
    button[type=submit],.btn-primary{background:#0d9488}
    button[type=submit]:hover{background:#0f766e}
    .btn-ghost{background:#101820;border-color:#334155;color:#b8c5d0}
    .btn-ghost:hover{background:#172030;border-color:#475569}
    .footer{color:#64748b}
  }
`;

function layout(title: string, body: string) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title} · NGOreality</title>
<style>${styles}</style>
</head><body>
<div class="shell">
  <div class="brand">
    <div class="brand-mark" aria-hidden="true">NGO</div>
    <span>NGOreality</span>
  </div>
  <div class="card">${body}</div>
  <p class="footer"><a href="${SITE}/public">Visit NGOreality</a> · <a href="${SITE}/public/privacy">Privacy</a></p>
</div>
</body></html>`;
}

function confirmPage(token: string) {
  const action = `?token=${encodeURIComponent(token)}`;
  return layout(
    "Email preferences",
    `<h1>Unsubscribe from outreach email?</h1>
     <p class="lead">You opened the unsubscribe link from an NGOreality outreach message. Click below only if you no longer want invitation or follow-up emails from us.</p>
     <p class="note">Badge decisions, receipts, and monitoring alerts for sites you registered are handled separately and are not affected by this preference.</p>
     <div class="actions">
       <form method="POST" action="${action}">
         <input type="hidden" name="confirm" value="1">
         <button type="submit">Unsubscribe from outreach emails</button>
       </form>
       <a class="btn-ghost" href="${SITE}/public">Keep receiving emails — go to NGOreality</a>
     </div>`,
  );
}

function successPage() {
  return layout(
    "Unsubscribed",
    `<div class="success-icon" aria-hidden="true">✓</div>
     <h1 style="text-align:center">You are unsubscribed</h1>
     <p class="lead" style="text-align:center;margin-bottom:22px">We will not send you any more outreach email from NGOreality.</p>
     <a class="btn-ghost" href="${SITE}/public">Back to NGOreality</a>`,
  );
}

function errorPage() {
  return layout(
    "Link incomplete",
    `<h1>This link is incomplete</h1>
     <p class="lead">The unsubscribe link is missing its token. Please use the link exactly as it appears in the email, or reply to the message and we will remove you manually.</p>
     <a class="btn-ghost" href="${SITE}/public">Go to NGOreality</a>`,
  );
}

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

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";

  if (!token) {
    return html(errorPage(), 400);
  }

  if (req.method === "POST") {
    const rawBody = await req.text();
    const params = new URLSearchParams(rawBody);
    const humanConfirmed = params.get("confirm") === "1";

    await suppressByToken(token);

    // RFC 8058 one-click from Gmail/Outlook — fast plain 200, no HTML.
    if (!humanConfirmed) {
      return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    return html(successPage());
  }

  // GET — show confirm page; do not unsubscribe until they click the button.
  return html(confirmPage(token));
});
