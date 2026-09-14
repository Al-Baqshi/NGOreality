/*
  # Keep multi-day schedules editable after daily send

  Problem: runner auto-completed when the held/queued roster emptied, so staff
  could not add the next day's recipients ("schedule not found or not editable").

  Fix:
  - Complete only when ends_on has passed (not when queue is empty).
  - Allow save / add / re-arm on completed schedules still inside the window.
  - Re-open existing in-window completed schedules to armed.
*/

-- ---------------------------------------------------------------------------
-- Upsert: allow editing completed (not cancelled)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.outreach_schedule_upsert(
  p_id uuid DEFAULT NULL,
  p_name text DEFAULT 'Outreach schedule',
  p_send_time time DEFAULT '09:00',
  p_starts_on date DEFAULT CURRENT_DATE,
  p_ends_on date DEFAULT (CURRENT_DATE + 6),
  p_daily_cap integer DEFAULT 100,
  p_template text DEFAULT 'outreach_cold_invite',
  p_subject text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_site_url text DEFAULT 'https://www.ngoreality.com',
  p_segment text DEFAULT 'all',
  p_outreach_status text DEFAULT NULL
) RETURNS public.outreach_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_row public.outreach_schedules;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_template IS NULL OR p_template NOT IN (
    'outreach_cold_invite', 'outreach_no_website', 'outreach_website_help'
  ) THEN
    RAISE EXCEPTION 'unsupported outreach template: %', p_template;
  END IF;

  IF p_ends_on < p_starts_on THEN
    RAISE EXCEPTION 'ends_on must be on or after starts_on';
  END IF;

  SELECT coalesce(nullif(u.email, ''), 'staff') INTO v_actor
    FROM auth.users u WHERE u.id = auth.uid();
  v_actor := coalesce(v_actor, 'staff');

  IF p_id IS NULL THEN
    INSERT INTO outreach_schedules (
      name, send_time, starts_on, ends_on, daily_cap, template,
      subject, body, site_url, segment, outreach_status, created_by
    ) VALUES (
      coalesce(nullif(trim(p_name), ''), 'Outreach schedule'),
      coalesce(p_send_time, '09:00'::time),
      p_starts_on,
      p_ends_on,
      least(greatest(coalesce(p_daily_cap, 100), 1), 25000),
      p_template,
      p_subject,
      p_body,
      rtrim(coalesce(nullif(trim(p_site_url), ''), 'https://www.ngoreality.com'), '/'),
      coalesce(nullif(trim(p_segment), ''), 'all'),
      nullif(trim(p_outreach_status), ''),
      v_actor
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE outreach_schedules s
       SET name = coalesce(nullif(trim(p_name), ''), s.name),
           send_time = coalesce(p_send_time, s.send_time),
           starts_on = coalesce(p_starts_on, s.starts_on),
           ends_on = coalesce(p_ends_on, s.ends_on),
           daily_cap = least(greatest(coalesce(p_daily_cap, s.daily_cap), 1), 25000),
           template = coalesce(p_template, s.template),
           subject = p_subject,
           body = p_body,
           site_url = rtrim(coalesce(nullif(trim(p_site_url), ''), s.site_url), '/'),
           segment = coalesce(nullif(trim(p_segment), ''), s.segment),
           outreach_status = nullif(trim(p_outreach_status), ''),
           updated_at = now()
     WHERE s.id = p_id
       AND s.status IN ('draft', 'paused', 'armed', 'completed')
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'schedule not found or not editable';
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Status: allow re-opening completed → draft / paused / armed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.outreach_schedule_set_status(
  p_schedule_id uuid,
  p_status text
) RETURNS public.outreach_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.outreach_schedules;
  v_queued int;
  v_today date;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_status NOT IN ('draft', 'armed', 'paused', 'cancelled') THEN
    RAISE EXCEPTION 'unsupported status transition: %', p_status;
  END IF;

  SELECT * INTO v_row FROM outreach_schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'schedule not found';
  END IF;

  IF v_row.status = 'cancelled' AND p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'schedule is cancelled and cannot be changed to %', p_status;
  END IF;

  IF v_row.status = 'completed' AND p_status IN ('draft', 'paused', 'armed') THEN
    v_today := (now() AT TIME ZONE coalesce(nullif(v_row.timezone, ''), 'Pacific/Auckland'))::date;
    IF v_today > v_row.ends_on THEN
      RAISE EXCEPTION 'schedule window ended on %; create a new schedule', v_row.ends_on;
    END IF;
  END IF;

  IF p_status = 'armed' THEN
    SELECT count(*)::int INTO v_queued
      FROM outreach_schedule_recipients
     WHERE schedule_id = p_schedule_id AND status = 'queued';
    IF v_queued < 1 THEN
      RAISE EXCEPTION 'arm requires at least one queued recipient';
    END IF;
  END IF;

  UPDATE outreach_schedules
     SET status = p_status,
         updated_at = now()
   WHERE id = p_schedule_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Add recipients: reopen completed (in window) to armed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.outreach_schedule_add_recipients(
  p_schedule_id uuid,
  p_ids uuid[] DEFAULT NULL,
  p_segment text DEFAULT NULL,
  p_outreach text DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_exclude uuid[] DEFAULT '{}',
  p_max integer DEFAULT 500,
  p_dedupe_days integer DEFAULT 365
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sched public.outreach_schedules;
  v_cap integer := least(greatest(coalesce(p_max, 500), 1), 25000);
  v_next_order integer;
  v_added integer := 0;
  v_skipped_no_email integer := 0;
  v_skipped_suppressed integer := 0;
  v_skipped_dedupe integer := 0;
  v_skipped_on_roster integer := 0;
  v_skips jsonb := '[]'::jsonb;
  v_base text;
  v_dedupe_days integer := coalesce(p_dedupe_days, 365);
  v_today date;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_sched FROM outreach_schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_sched.id IS NULL THEN
    RAISE EXCEPTION 'schedule not found';
  END IF;
  IF v_sched.status = 'cancelled' THEN
    RAISE EXCEPTION 'cannot add recipients to a cancelled schedule';
  END IF;

  IF v_sched.status = 'completed' THEN
    v_today := (now() AT TIME ZONE coalesce(nullif(v_sched.timezone, ''), 'Pacific/Auckland'))::date;
    IF v_today > v_sched.ends_on THEN
      RAISE EXCEPTION 'schedule window ended on %; create a new schedule', v_sched.ends_on;
    END IF;
    UPDATE outreach_schedules
       SET status = 'armed', updated_at = now()
     WHERE id = p_schedule_id
    RETURNING * INTO v_sched;
  END IF;

  v_base := rtrim(coalesce(nullif(trim(v_sched.site_url), ''), 'https://www.ngoreality.com'), '/');

  SELECT coalesce(max(sort_order), 0) + 1 INTO v_next_order
    FROM outreach_schedule_recipients WHERE schedule_id = p_schedule_id;

  WITH candidates AS (
    SELECT DISTINCT ON (o.id)
           o.id, o.name, o.slug, trim(o.email) AS email
      FROM organizations o
      LEFT JOIN website_monitors m
        ON m.organization_id = o.id AND m.enabled
     WHERE o.status = 'listed'
       AND o.is_customer = false
       AND (
         CASE
           WHEN p_ids IS NOT NULL THEN
             o.id = ANY (p_ids)
           ELSE
             (coalesce(p_outreach, v_sched.outreach_status) IS NULL
               OR coalesce(p_outreach, v_sched.outreach_status) = ''
               OR o.outreach_status = coalesce(p_outreach, v_sched.outreach_status))
             AND (p_q IS NULL OR p_q = '' OR o.name ILIKE '%' || p_q || '%')
             AND public.outreach_segment_matches(
               coalesce(nullif(trim(p_segment), ''), v_sched.segment, 'all'),
               o.website_url,
               m.last_status
             )
             AND NOT (o.id = ANY (coalesce(p_exclude, '{}'::uuid[])))
         END
       )
     ORDER BY o.id
  ),
  scored AS (
    SELECT
      c.*,
      (c.email IS NULL OR c.email = '') AS no_email,
      (c.email IS NOT NULL AND c.email <> '' AND public.is_email_suppressed(c.email)) AS suppressed,
      EXISTS (
        SELECT 1 FROM outreach_schedule_recipients r
         WHERE r.schedule_id = p_schedule_id AND r.organization_id = c.id
      ) AS on_roster,
      (
        v_dedupe_days > 0
        AND EXISTS (
          SELECT 1 FROM notification_events ne
           WHERE ne.organization_id = c.id
             AND ne.template = v_sched.template
             AND ne.status IN ('pending', 'sending', 'sent', 'held')
             AND ne.created_at > now() - make_interval(days => v_dedupe_days)
        )
      ) AS recent_dupe
    FROM candidates c
  ),
  counts AS (
    SELECT
      count(*) FILTER (WHERE no_email) AS skipped_no_email,
      count(*) FILTER (WHERE NOT no_email AND suppressed) AS skipped_suppressed,
      count(*) FILTER (WHERE NOT no_email AND NOT suppressed AND on_roster) AS skipped_on_roster,
      count(*) FILTER (WHERE NOT no_email AND NOT suppressed AND NOT on_roster AND recent_dupe) AS skipped_dedupe
    FROM scored
  ),
  skip_rows AS (
    SELECT
      s.id,
      s.name,
      CASE
        WHEN s.no_email THEN 'no_email'
        WHEN s.suppressed THEN 'suppressed'
        WHEN s.on_roster THEN 'on_roster'
        WHEN s.recent_dupe THEN 'already_emailed'
      END AS reason,
      CASE
        WHEN s.no_email THEN 'No email address on the organisation record'
        WHEN s.suppressed THEN 'Email is on the suppression list (unsubscribed or bounced)'
        WHEN s.on_roster THEN 'Already on this schedule roster'
        WHEN s.recent_dupe THEN
          CASE
            WHEN v_dedupe_days = 365 THEN
              'Already has a held/pending/sent email for this template in the last 365 days'
            ELSE
              format(
                'Already has a held/pending/sent email for this template in the last %s days',
                v_dedupe_days
              )
          END
      END AS detail
    FROM scored s
    WHERE s.no_email OR s.suppressed OR s.on_roster OR s.recent_dupe
    ORDER BY s.name
    LIMIT 40
  ),
  skips_agg AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'organization_id', sr.id,
          'name', sr.name,
          'reason', sr.reason,
          'detail', sr.detail
        )
        ORDER BY sr.name
      ),
      '[]'::jsonb
    ) AS skips
    FROM skip_rows sr
  ),
  to_add AS (
    SELECT s.*, row_number() OVER (ORDER BY s.name) AS rn
      FROM scored s
     WHERE NOT s.no_email
       AND NOT s.suppressed
       AND NOT s.on_roster
       AND NOT s.recent_dupe
     ORDER BY s.name
     LIMIT v_cap
  ),
  events AS (
    INSERT INTO notification_events (
      organization_id, template, recipient_email, subject, body_text, status, error_message
    )
    SELECT
      t.id,
      v_sched.template,
      t.email,
      CASE
        WHEN nullif(trim(v_sched.subject), '') IS NOT NULL THEN
          public.outreach_personalize_draft(
            v_sched.subject, t.name, v_base || '/public/org/' || coalesce(t.slug, '')
          )
        ELSE public.outreach_email_subject(v_sched.template, t.name)
      END,
      CASE
        WHEN nullif(trim(v_sched.body), '') IS NOT NULL THEN
          public.outreach_personalize_draft(
            v_sched.body, t.name, v_base || '/public/org/' || coalesce(t.slug, '')
          )
        ELSE public.outreach_email_body(
          v_sched.template,
          t.name,
          CASE
            WHEN v_sched.template = 'outreach_cold_invite' THEN
              v_base || '/public/org/' || coalesce(t.slug, '')
            ELSE
              v_base || '/ngo/signup?org=' || t.id::text
          END
        )
      END,
      'held',
      format('Scheduled outreach %s — waiting for NZ send time', v_sched.id::text)
    FROM to_add t
    RETURNING id, organization_id
  ),
  inserted AS (
    INSERT INTO outreach_schedule_recipients (
      schedule_id, organization_id, sort_order, status, notification_event_id
    )
    SELECT
      p_schedule_id,
      e.organization_id,
      v_next_order + t.rn - 1,
      'queued',
      e.id
    FROM events e
    JOIN to_add t ON t.id = e.organization_id
    ON CONFLICT (schedule_id, organization_id) DO NOTHING
    RETURNING organization_id
  )
  SELECT
    (SELECT count(*) FROM inserted),
    (SELECT skipped_no_email FROM counts),
    (SELECT skipped_suppressed FROM counts),
    (SELECT skipped_dedupe FROM counts),
    (SELECT skipped_on_roster FROM counts),
    (SELECT skips FROM skips_agg)
  INTO
    v_added,
    v_skipped_no_email,
    v_skipped_suppressed,
    v_skipped_dedupe,
    v_skipped_on_roster,
    v_skips;

  UPDATE outreach_schedules SET updated_at = now() WHERE id = p_schedule_id;

  RETURN jsonb_build_object(
    'added', v_added,
    'skipped_no_email', v_skipped_no_email,
    'skipped_suppressed', v_skipped_suppressed,
    'skipped_dedupe', v_skipped_dedupe,
    'skipped_on_roster', v_skipped_on_roster,
    'cap', v_cap,
    'skips', coalesce(v_skips, '[]'::jsonb),
    'skips_truncated', (
      v_skipped_no_email + v_skipped_suppressed + v_skipped_dedupe + v_skipped_on_roster
      > coalesce(jsonb_array_length(v_skips), 0)
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Runner: do not complete merely because the queue is empty
-- ---------------------------------------------------------------------------

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

    -- Intentionally do NOT complete when the queue is empty — staff may top up
    -- the roster for later days in the window. Completion is ends_on only.

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

-- Re-open completed schedules that are still inside their NZ date window
UPDATE public.outreach_schedules s
   SET status = 'armed',
       updated_at = now()
 WHERE s.status = 'completed'
   AND (now() AT TIME ZONE coalesce(nullif(s.timezone, ''), 'Pacific/Auckland'))::date <= s.ends_on;
