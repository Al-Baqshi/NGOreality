// Send Email Auth Hook — confirmation, recovery, magic link, invite.
//
// WHY THIS EXISTS
//
// `supabase.auth.signUp()` does not send mail itself. GoTrue does, through
// whatever the project's mailer is. The built-in Supabase mailer is rate
// limited and is not our sending domain, so the NGO signup page could show
// "Check your email" while nothing arrived. Transactional mail already goes
// through Resend on contact.ngoreality.com (send-notifications). Auth mail
// has to use the same path or signup is a dead end.
//
// Once this hook is enabled in Authentication → Hooks → Send Email, GoTrue
// stops using its own mailer and POSTs here instead. verify_jwt is false
// because GoTrue is not a logged-in user; Standard Webhooks is the auth.
//
// Enable with the SAME secret in two places:
//   1. Edge Function secret SEND_EMAIL_HOOK_SECRET
//   2. Dashboard hook secret (or Management API hook_send_email_secrets)
// Format: v1,whsec_<base64>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const DEFAULT_FROM = "NGOreality <notifications@contact.ngoreality.com>";
const DEFAULT_REPLY_TO = "hello@ngoreality.com";
const LINKEDIN_COMPANY_URL = "https://www.linkedin.com/company/ngoreality";

type EmailAction =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email"
  | "reauthentication";

interface HookPayload {
  user: {
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: EmailAction | string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
    old_email?: string;
  };
}

const COPY: Record<string, { subject: string; heading: string; body: string; cta: string }> = {
  signup: {
    subject: "Confirm your NGOreality account",
    heading: "Confirm your email",
    body:
      "Click the button below to confirm this address. After that, sign in — your organisation will be set up automatically.",
    cta: "Confirm email",
  },
  invite: {
    subject: "You have been invited to NGOreality",
    heading: "Accept your invitation",
    body: "You have been invited to create an NGOreality account. Click below to accept.",
    cta: "Accept invitation",
  },
  magiclink: {
    subject: "Your NGOreality sign-in link",
    heading: "Sign in",
    body: "Click the button below to sign in. This link expires shortly and can only be used once.",
    cta: "Sign in",
  },
  recovery: {
    subject: "Reset your NGOreality password",
    heading: "Reset your password",
    body: "We received a request to reset your password. Click below to choose a new one. If you did not ask for this, you can ignore this email.",
    cta: "Reset password",
  },
  email_change: {
    subject: "Confirm your new NGOreality email",
    heading: "Confirm your new email",
    body: "Click below to confirm this as your new email address. If you did not ask to change it, you can ignore this email.",
    cta: "Confirm new email",
  },
  email: {
    subject: "Confirm your NGOreality email",
    heading: "Confirm your email",
    body: "Click the button below to confirm this address.",
    cta: "Confirm email",
  },
  reauthentication: {
    subject: "Your NGOreality verification code",
    heading: "Verification code",
    body: "Use this code to verify it is you. It expires shortly.",
    cta: "",
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function confirmationUrl(
  supabaseUrl: string,
  tokenHash: string,
  type: string,
  redirectTo: string,
): string {
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/verify`);
  url.searchParams.set("token", tokenHash);
  url.searchParams.set("type", type);
  if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

function renderEmail(opts: {
  heading: string;
  body: string;
  cta: string;
  actionUrl?: string;
  token?: string;
}): { html: string; text: string } {
  const heading = escapeHtml(opts.heading);
  const body = escapeHtml(opts.body);
  const cta = escapeHtml(opts.cta);
  const token = opts.token ? escapeHtml(opts.token) : "";
  const actionUrl = opts.actionUrl ?? "";

  const button = actionUrl
    ? `<p style="margin:28px 0 8px;">
        <a href="${escapeHtml(actionUrl)}"
           style="display:inline-block;background:#0b1f3a;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border:3px solid #0b1f3a;">
          ${cta}
        </a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#5b6b7c;word-break:break-all;">
        Or paste this link into your browser:<br />${escapeHtml(actionUrl)}
      </p>`
    : "";

  const code = token
    ? `<p style="margin:24px 0;font-size:28px;letter-spacing:6px;font-weight:700;color:#0b1f3a;">${token}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Georgia, 'Times New Roman', serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border:3px solid #0b1f3a;padding:32px 28px;">
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.16em;font-weight:700;text-transform:uppercase;color:#0b1f3a;">NGOreality</p>
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.2;color:#0b1f3a;">${heading}</h1>
              <p style="margin:0;font-size:15px;line-height:1.55;color:#243447;">${body}</p>
              ${code}
              ${button}
              <p style="margin:32px 0 0;font-size:12px;line-height:18px;color:#5b6b7c;">
                NGOreality is New Zealand owned and operated.<br />
                Email: hello@ngoreality.com<br />
                Follow us on LinkedIn:
                <a href="${LINKEDIN_COMPANY_URL}" style="color:#0b1f3a;">${LINKEDIN_COMPANY_URL}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    opts.heading,
    "",
    opts.body,
    opts.token ? `\nCode: ${opts.token}` : "",
    actionUrl ? `\n${opts.cta}: ${actionUrl}` : "",
    "",
    "— NGOreality",
    "hello@ngoreality.com",
    `Follow us on LinkedIn: ${LINKEDIN_COMPANY_URL}`,
  ].filter((line) => line !== "");

  return { html, text: textParts.join("\n") };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const fromEmail = Deno.env.get("NOTIFY_FROM_EMAIL") ?? DEFAULT_FROM;
  const replyTo = (Deno.env.get("NOTIFY_REPLY_TO") ?? "").trim() || DEFAULT_REPLY_TO;

  if (!hookSecret) {
    return json({
      error: {
        http_code: 503,
        message: "SEND_EMAIL_HOOK_SECRET is not set",
      },
    }, 503);
  }
  if (!resendKey) {
    return json({
      error: {
        http_code: 503,
        message: "RESEND_API_KEY is not set",
      },
    }, 503);
  }
  if (!supabaseUrl) {
    return json({
      error: {
        http_code: 503,
        message: "SUPABASE_URL is not set",
      },
    }, 503);
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let event: HookPayload;
  try {
    event = new Webhook(hookSecret).verify(payload, headers) as HookPayload;
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    console.error("auth-send-email: webhook verify failed", message);
    return json({ error: { http_code: 401, message } }, 401);
  }

  const to = event.user.email?.trim() ?? "";
  if (!to) {
    return json({ error: { http_code: 400, message: "missing recipient" } }, 400);
  }

  const action = event.email_data.email_action_type || "signup";
  const copy = COPY[action] ?? COPY.signup;
  const actionUrl = action === "reauthentication"
    ? undefined
    : confirmationUrl(
      supabaseUrl,
      event.email_data.token_hash,
      action,
      event.email_data.redirect_to,
    );

  const { html, text } = renderEmail({
    heading: copy.heading,
    body: copy.body,
    cta: copy.cta,
    actionUrl,
    token: event.email_data.token,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      reply_to: replyTo,
      subject: copy.subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    console.error("auth-send-email: resend failed", action, res.status, detail);
    return json({
      error: {
        http_code: res.status,
        message: `resend ${res.status}: ${detail}`,
      },
    }, 500);
  }

  console.log("auth-send-email: sent", action);
  return json({});
});
