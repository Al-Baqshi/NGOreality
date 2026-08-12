-- RESCUED FROM PRODUCTION 2026-08-07. This migration was applied to the live
-- project but had no source in git. Recovered verbatim from
-- supabase_migrations.schema_migrations (version 20260729002444) so that the
-- repository matches the database. Do not renumber: the version prefix is what
-- stops `supabase db push` re-applying it.

-- Fix: record_monitor_check wrote columns that do not exist.
--
-- website_check_results has (organization_id, checked_at, url, is_up,
-- status_code, latency_ms, error_message). The first version inserted a
-- "status" text column, which is not there. Every call raised, the Edge
-- Function caught the error and carried on, and the run reported
-- "checked: 12" having written nothing at all.
--
-- The wrong column name was a five-minute mistake. Reporting success for work
-- that did not happen is the part worth fixing properly, and that is fixed in
-- the function itself, which now counts write failures and fails the run.

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
  v_is_up boolean := (p_status = 'up');
BEGIN
  SELECT url INTO v_url FROM website_monitors WHERE organization_id = p_organization_id;

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
    (organization_id, checked_at, url, is_up, status_code, latency_ms, error_message)
  VALUES
    (p_organization_id, now(), coalesce(v_url, ''), v_is_up, p_status_code, p_latency_ms,
     coalesce(p_error, ''));

  SELECT id INTO v_open_incident
    FROM website_incidents
   WHERE organization_id = p_organization_id AND closed_at IS NULL
   ORDER BY opened_at DESC
   LIMIT 1;

  IF p_status = 'down' AND p_consecutive_failures >= p_failure_threshold AND v_open_incident IS NULL THEN
    INSERT INTO website_incidents (organization_id, opened_at, last_status_code, error_message)
    VALUES (p_organization_id, now(), p_status_code, coalesce(p_error, ''))
    RETURNING id INTO v_open_incident;

    v_result := 'opened';

    -- Alerting is a paid benefit. Nothing is sent for the ~14,700 registry
    -- organisations monitored passively for outreach statistics; emailing them
    -- would be spam, and we have no relationship with them.
    IF public.has_active_membership(p_organization_id) THEN
      SELECT o.name, nullif(trim(o.email), '')
        INTO v_org_name, v_recipient
        FROM organizations o WHERE o.id = p_organization_id;

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
            'This may be a short outage, a hosting problem, or an expired domain. If your',
            ' site loads normally for you, it may still be unreachable from outside your',
            ' network.', E'\n\n',
            'We will email again when it responds. History is in your portal:', E'\n',
            'https://www.ngoreality.com/ngo/monitoring', E'\n\n',
            '— NGOreality'
          ),
          'pending'
        );

        UPDATE website_incidents SET org_notified_at = now() WHERE id = v_open_incident;
      END IF;
    END IF;

  ELSIF p_status = 'up' AND v_open_incident IS NOT NULL THEN
    UPDATE website_incidents SET closed_at = now() WHERE id = v_open_incident;
    v_result := 'resolved';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_monitor_check(uuid, text, integer, integer, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
