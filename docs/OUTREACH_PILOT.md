# Outreach pilot & ops checklist (Phase 1)

Before blasting a large cohort of the ~29k listed charities, run this checklist.

## Prerequisites

1. **Apply migration** `061_outreach_enqueue_claim_pay_funnel` (`npx supabase db push` or MCP).
2. **Email drain auth**
   - Edge Function secret `NOTIFY_WORKER_KEY` is set.
   - Vault secret `notify_worker_key` matches it (migration re-keys cron when present).
   - Confirm: `SELECT jobname, command FROM cron.job WHERE jobname = 'flush-notification-emails';` includes `X-Worker-Key`.
3. **Resend**
   - Domain `contact.ngoreality.com` verified.
   - Webhook for bounce/complaint → `email-webhook` function live.
4. **Frontend**
   - `VITE_SITE_URL` points at the live site (invite deep-links use it).
   - Optional: `VITE_MONITOR_API_URL` + key for CRM “Send pending now”.

## Pilot send (do this first)

1. Outreach worklist → segment **No website** (or a tight Stage filter).
2. Select **50–200** specific rows (checkboxes), not “select all matching”.
3. Queue email → watch **Email notifications** pending count drop every ~2 minutes.
4. Click one invite link: `/ngo/signup?org=<uuid>` should prefill the org.
5. Claim → land on `/ngo/services` → create pending bank payment for Badge and/or $650.
6. Staff: mark membership paid (activates badge path) and/or landing package paid (setup request fulfillment). Do **not** expect package pay to activate membership.

## Full cohort

- Prefer drip via “select all matching” on one segment at a time.
- Cap is 25,000 per RPC call; re-run if `capped: true`.
- 14-day dedupe skips re-queue of the same template for the same org.
- Drain rate ~50 emails / 2 min ≈ 36k/day — leave cron running overnight.

## Out of scope (later)

- Paymark / card checkout
- Workspace custom install + custom pricing
