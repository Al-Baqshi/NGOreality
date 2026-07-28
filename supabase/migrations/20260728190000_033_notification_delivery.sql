/*
  # Email delivery — claim-before-send, and a schedule

  Applied to the live project on 2026-07-28.

  Nothing had ever sent a queued email. The Go worker can, but it needs a direct
  Postgres connection string and is not deployed, so every badge-request
  confirmation would sit in notification_events as 'pending' forever — an NGO
  applies and hears nothing.

  Delivery now runs as the `send-notifications` Edge Function, invoked by
  pg_cron every 2 minutes. It needs no database password and costs nothing idle.

  The function claims a row by moving it to 'sending' BEFORE calling Resend, so
  two concurrent invocations cannot both send the same email — the second claim
  affects zero rows and skips. That requires 'sending' to be a legal status,
  which it was not: the claim would have failed the CHECK constraint and
  silently delivered nothing.

  ONLY ONE SENDER MAY BE LIVE. If backend/cmd/worker is ever deployed, unschedule
  the cron job or members receive duplicates.
*/

ALTER TABLE notification_events
  DROP CONSTRAINT IF EXISTS notification_events_status_check;

ALTER TABLE notification_events
  ADD CONSTRAINT notification_events_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped'));

-- A crash between claim and send would strand a row in 'sending' forever.
CREATE OR REPLACE FUNCTION public.requeue_stuck_notifications()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requeued AS (
    UPDATE notification_events
       SET status = 'pending',
           error_message = 'requeued after being stuck in sending'
     WHERE status = 'sending'
       AND created_at < now() - interval '15 minutes'
    RETURNING 1
  )
  SELECT count(*)::int FROM requeued;
$$;

REVOKE ALL ON FUNCTION public.requeue_stuck_notifications() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

/*
  Cron jobs are created separately (see migration 034 applied via MCP) because
  they embed the project URL and an invocation key.

  AUTH CHOICE: the flush job authenticates with the ANON key, not the service
  role key. verify_jwt only requires *a* valid project JWT. That means anyone
  holding the public anon key can trigger a flush — acceptable, because the
  function takes no input, drains only what the platform queued, and claims each
  row atomically, so an extra invocation sends nothing that was not already
  going to be sent and cannot send anything twice. The alternative was storing a
  service-role key in a database row, which is a far worse trade.
*/
