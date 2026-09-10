/*
  # Store clear roster skip reasons

  When the NZ schedule runner marks a recipient skipped, record why on
  outreach_schedule_recipients.skip_reason and on the linked notification.
*/

ALTER TABLE public.outreach_schedule_recipients
  ADD COLUMN IF NOT EXISTS skip_reason text;

CREATE OR REPLACE FUNCTION public.outreach_run_due_schedules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sched record;
  v_tz text;
  v_today date;
  v_local_time time;
  v_released integer;
  v_total_released integer := 0;
  v_schedules_run integer := 0;
  v_actor text := 'schedule-runner';
  v_completed integer := 0;
BEGIN
  UPDATE outreach_schedules s
     SET status = 'completed', updated_at = now()
   WHERE s.status = 'armed'
     AND (now() AT TIME ZONE coalesce(nullif(s.timezone, ''), 'Pacific/Auckland'))::date > s.ends_on;
  GET DIAGNOSTICS v_completed = ROW_COUNT;

  FOR v_sched IN
    SELECT * FROM outreach_schedules
     WHERE status = 'armed'
     ORDER BY created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    v_tz := coalesce(nullif(v_sched.timezone, ''), 'Pacific/Auckland');
    v_today := (now() AT TIME ZONE v_tz)::date;
    v_local_time := (now() AT TIME ZONE v_tz)::time;

    IF v_today < v_sched.starts_on OR v_today > v_sched.ends_on THEN
      CONTINUE;
    END IF;

    IF v_sched.last_run_on IS NOT DISTINCT FROM v_today THEN
      CONTINUE;
    END IF;

    IF v_local_time < v_sched.send_time THEN
      CONTINUE;
    END IF;

    -- Skip ineligible queued rows (and cancel their held mail) with specific reasons
    UPDATE notification_events ne
       SET status = 'skipped',
           error_message = CASE
             WHEN o.email IS NULL OR trim(o.email) = '' THEN
               'Skipped: organisation has no email address'
             WHEN public.is_email_suppressed(o.email) THEN
               'Skipped: email is on the suppression list (unsubscribed or bounced)'
             ELSE
               'Skipped: already has a pending/sent email for this template in the last 365 days'
           END,
           sent_at = null,
           claimed_at = null
      FROM outreach_schedule_recipients r
      JOIN organizations o ON o.id = r.organization_id
     WHERE r.schedule_id = v_sched.id
       AND r.status = 'queued'
       AND ne.id = r.notification_event_id
       AND ne.status = 'held'
       AND (
         o.email IS NULL OR trim(o.email) = ''
         OR public.is_email_suppressed(o.email)
         OR EXISTS (
           SELECT 1 FROM notification_events ne2
            WHERE ne2.organization_id = r.organization_id
              AND ne2.template = v_sched.template
              AND ne2.status IN ('pending', 'sending', 'sent')
              AND ne2.id IS DISTINCT FROM r.notification_event_id
              AND ne2.created_at > now() - interval '365 days'
         )
       );

    UPDATE outreach_schedule_recipients r
       SET status = 'skipped',
           skip_reason = CASE
             WHEN o.email IS NULL OR trim(o.email) = '' THEN
               'Organisation has no email address'
             WHEN public.is_email_suppressed(o.email) THEN
               'Email is on the suppression list (unsubscribed or bounced)'
             ELSE
               'Already has a pending/sent email for this template in the last 365 days'
           END
      FROM organizations o
     WHERE r.schedule_id = v_sched.id
       AND r.status = 'queued'
       AND o.id = r.organization_id
       AND (
         o.email IS NULL OR trim(o.email) = ''
         OR public.is_email_suppressed(o.email)
         OR EXISTS (
           SELECT 1 FROM notification_events ne
            WHERE ne.organization_id = r.organization_id
              AND ne.template = v_sched.template
              AND ne.status IN ('pending', 'sending', 'sent')
              AND ne.id IS DISTINCT FROM r.notification_event_id
              AND ne.created_at > now() - interval '365 days'
         )
       );

    v_released := 0;

    WITH pick AS (
      SELECT r.id AS recipient_id, r.organization_id, r.notification_event_id
        FROM outreach_schedule_recipients r
       WHERE r.schedule_id = v_sched.id
         AND r.status = 'queued'
         AND r.notification_event_id IS NOT NULL
       ORDER BY r.sort_order ASC, r.created_at ASC
       LIMIT v_sched.daily_cap
       FOR UPDATE OF r SKIP LOCKED
    ),
    legacy AS (
      INSERT INTO notification_events (
        organization_id, template, recipient_email, subject, body_text, status
      )
      SELECT
        o.id,
        v_sched.template,
        trim(o.email),
        CASE
          WHEN nullif(trim(v_sched.subject), '') IS NOT NULL THEN
            public.outreach_personalize_draft(
              v_sched.subject, o.name,
              rtrim(coalesce(nullif(trim(v_sched.site_url), ''), 'https://www.ngoreality.com'), '/')
                || '/public/org/' || coalesce(o.slug, '')
            )
          ELSE public.outreach_email_subject(v_sched.template, o.name)
        END,
        CASE
          WHEN nullif(trim(v_sched.body), '') IS NOT NULL THEN
            public.outreach_personalize_draft(
              v_sched.body, o.name,
              rtrim(coalesce(nullif(trim(v_sched.site_url), ''), 'https://www.ngoreality.com'), '/')
                || '/public/org/' || coalesce(o.slug, '')
            )
          ELSE public.outreach_email_body(
            v_sched.template, o.name,
            CASE
              WHEN v_sched.template = 'outreach_cold_invite' THEN
                rtrim(coalesce(nullif(trim(v_sched.site_url), ''), 'https://www.ngoreality.com'), '/')
                  || '/public/org/' || coalesce(o.slug, '')
              ELSE
                rtrim(coalesce(nullif(trim(v_sched.site_url), ''), 'https://www.ngoreality.com'), '/')
                  || '/ngo/signup?org=' || o.id::text
            END
          )
        END,
        'pending'
      FROM outreach_schedule_recipients r
      JOIN organizations o ON o.id = r.organization_id
     WHERE r.schedule_id = v_sched.id
       AND r.status = 'queued'
       AND r.notification_event_id IS NULL
       AND o.email IS NOT NULL AND trim(o.email) <> ''
     ORDER BY r.sort_order ASC, r.created_at ASC
     LIMIT greatest(
       v_sched.daily_cap - (SELECT count(*) FROM pick),
       0
     )
     RETURNING id, organization_id
    ),
    promoted AS (
      UPDATE notification_events ne
         SET status = 'pending',
             error_message = '',
             claimed_at = NULL
        FROM pick p
       WHERE ne.id = p.notification_event_id
         AND ne.status = 'held'
      RETURNING ne.id, ne.organization_id
    ),
    all_released AS (
      SELECT id, organization_id FROM promoted
      UNION ALL
      SELECT id, organization_id FROM legacy
    ),
    marked AS (
      UPDATE outreach_schedule_recipients r
         SET status = 'released',
             released_at = now(),
             notification_event_id = coalesce(r.notification_event_id, a.id)
        FROM all_released a
       WHERE r.schedule_id = v_sched.id
         AND r.organization_id = a.organization_id
         AND r.status = 'queued'
      RETURNING r.id, r.organization_id
    ),
    touched AS (
      UPDATE organizations o
         SET last_outreach_at = now(),
             outreach_status = CASE
               WHEN o.outreach_status = 'not_contacted' THEN
                 CASE v_sched.template
                   WHEN 'outreach_no_website' THEN 'no_website'
                   WHEN 'outreach_website_help' THEN 'website_issues'
                   ELSE 'cold_email'
                 END
               ELSE o.outreach_status
             END,
             updated_at = now()
        FROM marked m
       WHERE o.id = m.organization_id
      RETURNING o.id
    ),
    logged AS (
      INSERT INTO activity_log (organization_id, action, description, performed_by, metadata)
      SELECT m.organization_id,
             'outreach_email_scheduled_release',
             format('Schedule released %s email to pending queue', v_sched.template),
             v_actor,
             jsonb_build_object('template', v_sched.template, 'schedule_id', v_sched.id)
        FROM marked m
      RETURNING organization_id
    )
    SELECT count(*)::int INTO v_released FROM marked;

    UPDATE outreach_schedules
       SET last_run_on = v_today,
           updated_at = now()
     WHERE id = v_sched.id;

    UPDATE outreach_schedules s
       SET status = 'completed', updated_at = now()
     WHERE s.id = v_sched.id
       AND s.status = 'armed'
       AND NOT EXISTS (
         SELECT 1 FROM outreach_schedule_recipients r
          WHERE r.schedule_id = s.id AND r.status = 'queued'
       );

    v_total_released := v_total_released + coalesce(v_released, 0);
    v_schedules_run := v_schedules_run + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'schedules_run', v_schedules_run,
    'released', v_total_released,
    'completed_expired', v_completed
  );
END;
$$;

-- Backfill reasons for rows already skipped
UPDATE public.outreach_schedule_recipients r
   SET skip_reason = CASE
     WHEN ne.error_message ILIKE '%no email%' THEN 'Organisation has no email address'
     WHEN ne.error_message ILIKE '%suppress%' THEN
       'Email is on the suppression list (unsubscribed or bounced)'
     WHEN ne.error_message ILIKE '%dupe%' OR ne.error_message ILIKE '%365%'
       OR ne.error_message ILIKE '%already%' THEN
       'Already has a pending/sent email for this template in the last 365 days'
     WHEN nullif(trim(ne.error_message), '') IS NOT NULL THEN trim(ne.error_message)
     ELSE 'Skipped at send time (no email, suppressed, or already emailed this template)'
   END
  FROM notification_events ne
 WHERE r.status = 'skipped'
   AND r.skip_reason IS NULL
   AND ne.id = r.notification_event_id;

UPDATE public.outreach_schedule_recipients r
   SET skip_reason = 'Skipped at send time (no email, suppressed, or already emailed this template)'
 WHERE r.status = 'skipped'
   AND r.skip_reason IS NULL;
