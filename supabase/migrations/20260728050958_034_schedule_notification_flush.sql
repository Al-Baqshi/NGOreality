-- RESCUED FROM PRODUCTION 2026-08-07. This migration was applied to the live
-- project but had no source in git. Recovered from
-- supabase_migrations.schema_migrations (version 20260728050958).
--
-- ONE DEVIATION FROM WHAT RAN: the Authorization header below contained the
-- project's anon key inline. It is replaced here with a placeholder. The anon
-- key is public by design (it ships in the frontend bundle), but a credential
-- pasted into a cron.job row is invisible to every normal review path, so it is
-- not reproduced in git. Read the live value with:
--   SELECT command FROM cron.job WHERE jobname = 'flush-notification-emails';
--
-- This job must be re-keyed when Supabase Auth is removed — see
-- docs/AUTH_AND_DATA_MIGRATION_PLAN.md, Phase 4 step 5.

-- Schedule the email flush.
--
-- AUTH CHOICE, deliberate: the cron job authenticates with the ANON key, not the
-- service role key. Edge Function verify_jwt only requires *a* valid project JWT,
-- and the anon key is one.
--
-- That means anyone holding the public anon key can trigger a flush. This is
-- acceptable because the function takes no input, drains only what the platform
-- itself queued, and claims each row atomically before sending — so an extra
-- invocation sends nothing that was not already going to be sent, and cannot
-- send anything twice. The alternative was embedding a service-role key in a
-- database row, which is a far worse trade.
--
-- To harden later: put the service role key in Supabase Vault and read it here
-- with vault.decrypted_secrets, or give the function a shared-secret header.

SELECT cron.unschedule('flush-notification-emails')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flush-notification-emails');

SELECT cron.schedule(
  'flush-notification-emails',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://cpbilbskfbzqlynjhdvm.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Recover anything stranded mid-send by a crash.
SELECT cron.unschedule('requeue-stuck-notifications')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'requeue-stuck-notifications');

SELECT cron.schedule(
  'requeue-stuck-notifications',
  '*/15 * * * *',
  $$ SELECT public.requeue_stuck_notifications(); $$
);
