-- RESCUED FROM PRODUCTION 2026-08-07. This migration was applied to the live
-- project but had no source in git. Recovered from
-- supabase_migrations.schema_migrations (version 20260729002308). Do not
-- renumber: the version prefix is what stops `supabase db push` re-applying it.
--
-- TWO NOTES ON WHAT THIS FILE IS:
--
-- 1. The anon key that appeared inline in the cron command below is replaced
--    with a placeholder. Read the live value with:
--      SELECT command FROM cron.job WHERE jobname = 'run-website-monitors';
--
-- 2. This is superseded in production. The 'run-website-monitors' job scheduled
--    here is NO LONGER in cron.job — monitoring moved to the Go monitor-worker
--    on Railway (see 037_monitor_worker_key_gated_rpcs), which the Edge Function
--    itself warns about: "If backend/cmd/worker is ever deployed, unschedule
--    this or sites get checked twice." Only flush-notification-emails and
--    requeue-stuck-notifications are scheduled today. Do not re-run this file.
--    Both functions it defines were later corrected by 035 and 036.

-- Website monitoring, revived.
--
-- Members are sold "~daily website checks and an email if your site looks
-- down". The Go worker that performs them was never deployed: the last check
-- ran on 2 June 2026 and nothing has run since. Selling a check that does not
-- happen is the worst possible defect in a product whose subject is trust.
--
-- Delivery moves to an Edge Function on pg_cron, for the same reason email did:
-- no database password needed, nothing to keep running. These two functions
-- hold the logic that must be transactional, so the function stays a thin
-- HTTP-checking loop.

-- Which monitors are due? Never checked, or checked longer ago than their own
-- interval. Oldest first so no tier can starve another.
CREATE OR REPLACE FUNCTION public.monitors_due_for_check(p_limit integer DEFAULT 60)
RETURNS TABLE (
  organization_id uuid,
  url text,
  tier text,
  check_interval_minutes integer,
  consecutive_failures integer,
  last_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.organization_id, m.url, m.tier, m.check_interval_minutes,
         m.consecutive_failures, m.last_status
    FROM website_monitors m
   WHERE m.enabled
     AND coalesce(trim(m.url), '') <> ''
     AND (
       m.last_checked_at IS NULL
       OR m.last_checked_at < now() - make_interval(mins => greatest(m.check_interval_minutes, 5))
     )
   ORDER BY m.last_checked_at ASC NULLS FIRST
   LIMIT greatest(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.monitors_due_for_check(integer) FROM PUBLIC, anon, authenticated;

-- Record one check and move the incident state machine.
--
-- Returns 'opened', 'resolved' or 'recorded' so the caller can report what
-- actually changed rather than guessing.
--
-- A down-alert is queued ONLY for organisations with an active membership:
-- alerting is a paid benefit, and emailing 14,000 charities we have no
-- relationship with would be spam.
CREATE OR REPLACE FUNCTION public.record_monitor_check(
  p_organization_id uuid,
  p_status text,
  p_status_code integer,
  p_latency_ms integer,
  p_error text,
  p_consecutive_failures integer,
  p_failure_threshold integer DEFAULT 2
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open_incident uuid;
  v_result text := 'recorded';
  v_org_name text;
  v_url text;
  v_recipient text;
BEGIN
  UPDATE website_monitors
     SET last_checked_at = now(),
         last_status = p_status,
         last_status_code = p_status_code,
         last_latency_ms = p_latency_ms,
         last_error = coalesce(p_error, ''),
         consecutive_failures = p_consecutive_failures,
         updated_at = now()
   WHERE organization_id = p_organization_id;

  INSERT INTO website_check_results
    (organization_id, status, status_code, latency_ms, error_message, checked_at)
  VALUES
    (p_organization_id, p_status, p_status_code, p_latency_ms, coalesce(p_error, ''), now());

  SELECT id INTO v_open_incident
    FROM website_incidents
   WHERE organization_id = p_organization_id AND closed_at IS NULL
   ORDER BY opened_at DESC
   LIMIT 1;

  -- Down, threshold reached, nothing already open -> open an incident.
  IF p_status = 'down' AND p_consecutive_failures >= p_failure_threshold AND v_open_incident IS NULL THEN
    INSERT INTO website_incidents (organization_id, opened_at, error_message)
    VALUES (p_organization_id, now(), coalesce(p_error, ''))
    RETURNING id INTO v_open_incident;

    v_result := 'opened';

    -- Alerting is a paid benefit. Nothing is sent for the ~14,700 registry
    -- organisations we monitor passively for our own outreach statistics.
    IF public.has_active_membership(p_organization_id) THEN
      SELECT o.name, nullif(trim(o.email), ''), m.url
        INTO v_org_name, v_recipient, v_url
        FROM organizations o
        LEFT JOIN website_monitors m ON m.organization_id = o.id
       WHERE o.id = p_organization_id;

      IF v_recipient IS NOT NULL THEN
        INSERT INTO notification_events
          (organization_id, incident_id, template, recipient_email, subject, body_text, status)
        VALUES (
          p_organization_id,
          v_open_incident,
          'site_down',
          v_recipient,
          '[NGOreality] Your website looks down — ' || coalesce(v_org_name, 'your organisation'),
          concat(
            'Kia ora,', E'\n\n',
            'Our checks could not reach ', coalesce(v_url, 'your website'),
            ' on the last ', p_consecutive_failures, ' attempts.', E'\n\n',
            case when coalesce(p_error, '') <> ''
                 then 'What we saw: ' || p_error || E'\n\n' else '' end,
            'This may be a short outage, a hosting problem, or an expired domain. If your site',
            ' loads normally for you, it may still be unreachable from outside your network.', E'\n\n',
            'We will email again when it responds. You can see the history in your portal:', E'\n',
            'https://www.ngoreality.com/ngo/monitoring', E'\n\n',
            '— NGOreality'
          ),
          'pending'
        );
      END IF;
    END IF;

  -- Back up while an incident is open -> close it.
  ELSIF p_status = 'up' AND v_open_incident IS NOT NULL THEN
    UPDATE website_incidents
       SET closed_at = now()
     WHERE id = v_open_incident;
    v_result := 'resolved';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_monitor_check(uuid, text, integer, integer, text, integer, integer)
  FROM PUBLIC, anon, authenticated;

-- Schedule. Every 2 minutes, 60 monitors a run, cycles ~14,700 monitors well
-- inside 24 hours, which is what "~daily checks" promises.
SELECT cron.unschedule('run-website-monitors')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-website-monitors');

SELECT cron.schedule(
  'run-website-monitors',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://cpbilbskfbzqlynjhdvm.supabase.co/functions/v1/run-monitors',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
