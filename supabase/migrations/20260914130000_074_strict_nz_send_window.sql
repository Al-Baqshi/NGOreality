/*
  # Strict NZ send-time window

  Previously: release any time after send_time on that NZ day (so arming at noon
  sent immediately). Now: only release inside [send_time, send_time + 20 minutes)
  New Zealand local time. Cron is every 5 minutes, so 9:00–9:20 covers several ticks.
  Outside that window (including later the same day), wait for the next day's slot.
*/

CREATE OR REPLACE FUNCTION public.outreach_schedule_summary(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text := 'Pacific/Auckland';
  v_today date;
  v_local_time time;
  v_sched public.outreach_schedules;
  v_window_end time;
  v_next date;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_sched FROM outreach_schedules WHERE id = p_schedule_id;
  IF v_sched.id IS NULL THEN
    RAISE EXCEPTION 'schedule not found';
  END IF;

  v_tz := coalesce(nullif(v_sched.timezone, ''), 'Pacific/Auckland');
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_local_time := (now() AT TIME ZONE v_tz)::time;
  v_window_end := v_sched.send_time + interval '20 minutes';

  -- Next calendar day that will get a send attempt
  IF v_sched.status <> 'armed' OR v_today > v_sched.ends_on THEN
    v_next := null;
  ELSIF v_today < v_sched.starts_on THEN
    v_next := v_sched.starts_on;
  ELSIF v_sched.last_run_on IS NOT DISTINCT FROM v_today THEN
    v_next := CASE WHEN (v_today + 1) <= v_sched.ends_on THEN v_today + 1 ELSE null END;
  ELSIF v_window_end > v_sched.send_time THEN
    -- Normal window (e.g. 09:00–09:20)
    IF v_local_time < v_sched.send_time THEN
      v_next := v_today;
    ELSIF v_local_time < v_window_end THEN
      v_next := v_today; -- currently in window
    ELSE
      v_next := CASE WHEN (v_today + 1) <= v_sched.ends_on THEN v_today + 1 ELSE null END;
    END IF;
  ELSE
    -- Window wraps past midnight (rare for late send_time)
    IF v_local_time >= v_sched.send_time OR v_local_time < v_window_end THEN
      v_next := v_today;
    ELSE
      v_next := CASE WHEN (v_today + 1) <= v_sched.ends_on THEN v_today + 1 ELSE null END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'schedule_id', v_sched.id,
    'status', v_sched.status,
    'today_nz', v_today,
    'day_index', CASE
      WHEN v_today < v_sched.starts_on THEN 0
      WHEN v_today > v_sched.ends_on THEN (v_sched.ends_on - v_sched.starts_on) + 1
      ELSE (v_today - v_sched.starts_on) + 1
    END,
    'total_days', (v_sched.ends_on - v_sched.starts_on) + 1,
    'queued', (
      SELECT count(*)::int FROM outreach_schedule_recipients
       WHERE schedule_id = p_schedule_id AND status = 'queued'
    ),
    'released', (
      SELECT count(*)::int FROM outreach_schedule_recipients
       WHERE schedule_id = p_schedule_id AND status IN ('released', 'sent')
    ),
    'released_today', (
      SELECT count(*)::int FROM outreach_schedule_recipients
       WHERE schedule_id = p_schedule_id
         AND status IN ('released', 'sent')
         AND released_at IS NOT NULL
         AND (released_at AT TIME ZONE v_tz)::date = v_today
    ),
    'skipped', (
      SELECT count(*)::int FROM outreach_schedule_recipients
       WHERE schedule_id = p_schedule_id AND status IN ('skipped', 'cancelled')
    ),
    'last_run_on', v_sched.last_run_on,
    'next_send_preview', v_next::text
  );
END;
$$;

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
  v_window_end time;
  v_in_window boolean;
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
    v_window_end := v_sched.send_time + interval '20 minutes';

    IF v_today < v_sched.starts_on OR v_today > v_sched.ends_on THEN
      CONTINUE;
    END IF;

    IF v_sched.last_run_on IS NOT DISTINCT FROM v_today THEN
      CONTINUE;
    END IF;

    -- Strict daily slot: only inside [send_time, send_time+20m) NZ local time.
    -- Arming later the same day waits until tomorrow's slot.
    IF v_window_end > v_sched.send_time THEN
      v_in_window := (v_local_time >= v_sched.send_time AND v_local_time < v_window_end);
    ELSE
      -- Window wraps past midnight
      v_in_window := (v_local_time >= v_sched.send_time OR v_local_time < v_window_end);
    END IF;

    IF NOT v_in_window THEN
      CONTINUE;
    END IF;

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
