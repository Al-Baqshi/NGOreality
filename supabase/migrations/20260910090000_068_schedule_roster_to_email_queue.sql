/*
  # Schedule roster → Email queue pipeline

  When contacts are added to a schedule roster, create notification_events as
  `held` immediately so they appear in the Email queue. At the NZ send time,
  promote those held rows to `pending` (cron delivers). When a notification
  becomes `sent`, mirror that onto the roster row.
*/

-- ---------------------------------------------------------------------------
-- Add recipients: also insert held notification_events
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
  v_base text;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_sched FROM outreach_schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_sched.id IS NULL THEN
    RAISE EXCEPTION 'schedule not found';
  END IF;
  IF v_sched.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'cannot add recipients to a % schedule', v_sched.status;
  END IF;

  v_base := rtrim(coalesce(nullif(trim(v_sched.site_url), ''), 'https://www.ngoreality.com'), '/');

  SELECT coalesce(max(sort_order), 0) + 1 INTO v_next_order
    FROM outreach_schedule_recipients WHERE schedule_id = p_schedule_id;

  WITH candidates AS (
    SELECT o.id, o.name, o.slug, trim(o.email) AS email
      FROM organizations o
      LEFT JOIN website_monitors m
        ON m.organization_id = o.id AND m.enabled
     WHERE o.status = 'listed'
       AND o.is_customer = false
       AND (
         p_ids IS NOT NULL
         OR (
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
         )
       )
       AND (p_ids IS NULL OR o.id = ANY (p_ids))
     LIMIT v_cap
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
      EXISTS (
        SELECT 1 FROM notification_events ne
         WHERE ne.organization_id = c.id
           AND ne.template = v_sched.template
           AND ne.status IN ('pending', 'sending', 'sent', 'held')
           AND ne.created_at > now() - make_interval(days => greatest(coalesce(p_dedupe_days, 365), 0))
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
  to_add AS (
    SELECT s.*, row_number() OVER (ORDER BY s.name) AS rn
      FROM scored s
     WHERE NOT s.no_email
       AND NOT s.suppressed
       AND NOT s.on_roster
       AND NOT s.recent_dupe
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
    (SELECT skipped_on_roster FROM counts)
  INTO v_added, v_skipped_no_email, v_skipped_suppressed, v_skipped_dedupe, v_skipped_on_roster;

  UPDATE outreach_schedules SET updated_at = now() WHERE id = p_schedule_id;

  RETURN jsonb_build_object(
    'added', v_added,
    'skipped_no_email', v_skipped_no_email,
    'skipped_suppressed', v_skipped_suppressed,
    'skipped_dedupe', v_skipped_dedupe,
    'skipped_on_roster', v_skipped_on_roster,
    'cap', v_cap
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Remove: cancel linked held notifications
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.outreach_schedule_remove_recipients(
  p_schedule_id uuid,
  p_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_removed integer := 0;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN jsonb_build_object('removed', 0);
  END IF;

  -- Cancel held emails that were staged for these roster rows
  UPDATE notification_events ne
     SET status = 'skipped',
         error_message = 'Removed from scheduled outreach roster',
         sent_at = null,
         claimed_at = null
    FROM outreach_schedule_recipients r
   WHERE r.schedule_id = p_schedule_id
     AND r.status = 'queued'
     AND r.organization_id = ANY (p_ids)
     AND ne.id = r.notification_event_id
     AND ne.status = 'held';

  WITH deleted AS (
    DELETE FROM outreach_schedule_recipients r
     WHERE r.schedule_id = p_schedule_id
       AND r.status = 'queued'
       AND r.organization_id = ANY (p_ids)
    RETURNING r.id
  )
  SELECT count(*)::int INTO v_removed FROM deleted;

  UPDATE outreach_schedules SET updated_at = now() WHERE id = p_schedule_id;

  RETURN jsonb_build_object('removed', v_removed);
END;
$$;

-- ---------------------------------------------------------------------------
-- Daily runner: promote held → pending (do not insert duplicates)
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

    -- Skip ineligible queued rows (and cancel their held mail)
    UPDATE notification_events ne
       SET status = 'skipped',
           error_message = 'Skipped by schedule runner (no email / suppressed / recent dupe)',
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
       SET status = 'skipped'
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
    -- Legacy roster rows without an event: create pending now
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

-- ---------------------------------------------------------------------------
-- When email is sent, mark roster row sent
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.outreach_schedule_sync_recipient_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'sent' AND (OLD.status IS DISTINCT FROM 'sent') THEN
    UPDATE outreach_schedule_recipients
       SET status = 'sent'
     WHERE notification_event_id = NEW.id
       AND status IN ('queued', 'released');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outreach_schedule_sync_sent ON public.notification_events;
CREATE TRIGGER trg_outreach_schedule_sync_sent
  AFTER UPDATE OF status ON public.notification_events
  FOR EACH ROW
  EXECUTE FUNCTION public.outreach_schedule_sync_recipient_sent();

-- ---------------------------------------------------------------------------
-- Backfill held emails for existing queued roster rows missing an event
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_row record;
  v_base text;
  v_event_id uuid;
BEGIN
  FOR v_row IN
    SELECT r.id AS recipient_id, r.schedule_id, r.organization_id,
           s.template, s.subject, s.body, s.site_url,
           o.name, o.slug, trim(o.email) AS email
      FROM outreach_schedule_recipients r
      JOIN outreach_schedules s ON s.id = r.schedule_id
      JOIN organizations o ON o.id = r.organization_id
     WHERE r.status = 'queued'
       AND r.notification_event_id IS NULL
       AND o.email IS NOT NULL AND trim(o.email) <> ''
  LOOP
    v_base := rtrim(coalesce(nullif(trim(v_row.site_url), ''), 'https://www.ngoreality.com'), '/');
    INSERT INTO notification_events (
      organization_id, template, recipient_email, subject, body_text, status, error_message
    ) VALUES (
      v_row.organization_id,
      v_row.template,
      v_row.email,
      CASE
        WHEN nullif(trim(v_row.subject), '') IS NOT NULL THEN
          public.outreach_personalize_draft(
            v_row.subject, v_row.name, v_base || '/public/org/' || coalesce(v_row.slug, '')
          )
        ELSE public.outreach_email_subject(v_row.template, v_row.name)
      END,
      CASE
        WHEN nullif(trim(v_row.body), '') IS NOT NULL THEN
          public.outreach_personalize_draft(
            v_row.body, v_row.name, v_base || '/public/org/' || coalesce(v_row.slug, '')
          )
        ELSE public.outreach_email_body(
          v_row.template, v_row.name,
          CASE
            WHEN v_row.template = 'outreach_cold_invite' THEN
              v_base || '/public/org/' || coalesce(v_row.slug, '')
            ELSE
              v_base || '/ngo/signup?org=' || v_row.organization_id::text
          END
        )
      END,
      'held',
      format('Scheduled outreach %s — waiting for NZ send time', v_row.schedule_id::text)
    )
    RETURNING id INTO v_event_id;

    UPDATE outreach_schedule_recipients
       SET notification_event_id = v_event_id
     WHERE id = v_row.recipient_id;
  END LOOP;
END;
$$;
