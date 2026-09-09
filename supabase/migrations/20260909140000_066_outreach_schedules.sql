/*
  # Daily NZ outreach schedules (auto-send)

  Armed schedules release the next daily_cap of queued roster recipients as
  pending notification_events at send_time in Pacific/Auckland, once per NZ day
  while starts_on ≤ today ≤ ends_on. New recipients only: unique per schedule,
  and add/run skip recent same-template outreach.
*/

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.outreach_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Outreach schedule',
  send_time time NOT NULL DEFAULT '09:00',
  timezone text NOT NULL DEFAULT 'Pacific/Auckland',
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  daily_cap integer NOT NULL DEFAULT 100
    CHECK (daily_cap >= 1 AND daily_cap <= 25000),
  template text NOT NULL
    CHECK (template IN (
      'outreach_cold_invite', 'outreach_no_website', 'outreach_website_help'
    )),
  subject text,
  body text,
  site_url text NOT NULL DEFAULT 'https://www.ngoreality.com',
  segment text NOT NULL DEFAULT 'all',
  outreach_status text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'armed', 'paused', 'completed', 'cancelled')),
  last_run_on date,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS public.outreach_schedule_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.outreach_schedules(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'released', 'sent', 'skipped', 'cancelled')),
  notification_event_id uuid REFERENCES public.notification_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  UNIQUE (schedule_id, organization_id)
);

CREATE INDEX IF NOT EXISTS outreach_schedule_recipients_queue_idx
  ON public.outreach_schedule_recipients (schedule_id, status, sort_order);

CREATE INDEX IF NOT EXISTS outreach_schedules_armed_idx
  ON public.outreach_schedules (status, starts_on, ends_on)
  WHERE status = 'armed';

ALTER TABLE public.outreach_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_schedule_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outreach_schedules_staff ON public.outreach_schedules;
CREATE POLICY outreach_schedules_staff ON public.outreach_schedules
  FOR ALL TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS outreach_schedule_recipients_staff ON public.outreach_schedule_recipients;
CREATE POLICY outreach_schedule_recipients_staff ON public.outreach_schedule_recipients
  FOR ALL TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- ---------------------------------------------------------------------------
-- Create / update schedule
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
       AND s.status IN ('draft', 'paused', 'armed')
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'schedule not found or not editable';
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_schedule_upsert(
  uuid, text, time, date, date, integer, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_schedule_upsert(
  uuid, text, time, date, date, integer, text, text, text, text, text, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Arm / pause / cancel
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

  IF v_row.status IN ('completed', 'cancelled') AND p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'schedule is % and cannot be changed to %', v_row.status, p_status;
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

REVOKE ALL ON FUNCTION public.outreach_schedule_set_status(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_schedule_set_status(uuid, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Add recipients (ids or filter) — new people only
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

  SELECT coalesce(max(sort_order), 0) + 1 INTO v_next_order
    FROM outreach_schedule_recipients WHERE schedule_id = p_schedule_id;

  WITH candidates AS (
    SELECT o.id, o.name, trim(o.email) AS email
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
  inserted AS (
    INSERT INTO outreach_schedule_recipients (schedule_id, organization_id, sort_order, status)
    SELECT p_schedule_id, t.id, v_next_order + t.rn - 1, 'queued'
      FROM to_add t
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

REVOKE ALL ON FUNCTION public.outreach_schedule_add_recipients(
  uuid, uuid[], text, text, text, uuid[], integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_schedule_add_recipients(
  uuid, uuid[], text, text, text, uuid[], integer, integer
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Remove queued recipients
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

REVOKE ALL ON FUNCTION public.outreach_schedule_remove_recipients(uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_schedule_remove_recipients(uuid, uuid[])
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Summary for UI
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.outreach_schedule_summary(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text := 'Pacific/Auckland';
  v_today date;
  v_sched public.outreach_schedules;
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
    'next_send_preview', CASE
      WHEN v_sched.status <> 'armed' THEN null
      WHEN v_today > v_sched.ends_on THEN null
      WHEN v_sched.last_run_on IS NOT DISTINCT FROM v_today THEN
        CASE WHEN (v_today + 1) <= v_sched.ends_on THEN (v_today + 1)::text ELSE null END
      WHEN v_today < v_sched.starts_on THEN v_sched.starts_on::text
      ELSE v_today::text
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_schedule_summary(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_schedule_summary(uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Daily runner (called by pg_cron; also callable by staff for dry ops)
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
  v_base text;
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

    -- Drop ineligible queued rows so they are never retried forever
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
              AND ne.status IN ('pending', 'sending', 'sent', 'held')
              AND ne.created_at > now() - interval '365 days'
         )
       );

    v_base := rtrim(coalesce(nullif(trim(v_sched.site_url), ''), 'https://www.ngoreality.com'), '/');
    v_released := 0;

    WITH pick AS (
      SELECT r.id AS recipient_id, r.organization_id, o.name, o.slug, trim(o.email) AS email
        FROM outreach_schedule_recipients r
        JOIN organizations o ON o.id = r.organization_id
       WHERE r.schedule_id = v_sched.id
         AND r.status = 'queued'
       ORDER BY r.sort_order ASC, r.created_at ASC
       LIMIT v_sched.daily_cap
       FOR UPDATE OF r SKIP LOCKED
    ),
    inserted AS (
      INSERT INTO notification_events (
        organization_id, template, recipient_email, subject, body_text, status
      )
      SELECT
        p.organization_id,
        v_sched.template,
        p.email,
        CASE
          WHEN nullif(trim(v_sched.subject), '') IS NOT NULL THEN
            public.outreach_personalize_draft(
              v_sched.subject, p.name, v_base || '/public/org/' || coalesce(p.slug, '')
            )
          ELSE public.outreach_email_subject(v_sched.template, p.name)
        END,
        CASE
          WHEN nullif(trim(v_sched.body), '') IS NOT NULL THEN
            public.outreach_personalize_draft(
              v_sched.body, p.name, v_base || '/public/org/' || coalesce(p.slug, '')
            )
          ELSE public.outreach_email_body(
            v_sched.template, p.name, v_base || '/ngo/signup?org=' || p.organization_id::text
          )
        END,
        'pending'
      FROM pick p
      RETURNING id, organization_id
    ),
    marked AS (
      UPDATE outreach_schedule_recipients r
         SET status = 'released',
             released_at = now(),
             notification_event_id = i.id
        FROM inserted i
       WHERE r.schedule_id = v_sched.id
         AND r.organization_id = i.organization_id
         AND r.status = 'queued'
      RETURNING r.id
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
        FROM inserted i
       WHERE o.id = i.organization_id
      RETURNING o.id
    ),
    logged AS (
      INSERT INTO activity_log (organization_id, action, description, performed_by, metadata)
      SELECT i.organization_id,
             'outreach_email_scheduled_release',
             format('Schedule released %s email', v_sched.template),
             v_actor,
             jsonb_build_object(
               'template', v_sched.template,
               'schedule_id', v_sched.id,
               'event_id', i.id
             )
        FROM inserted i
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

REVOKE ALL ON FUNCTION public.outreach_run_due_schedules() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_run_due_schedules() TO postgres, service_role;

-- Guard staff manual invoke
CREATE OR REPLACE FUNCTION public.outreach_run_due_schedules_staff()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.outreach_run_due_schedules();
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_run_due_schedules_staff() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_run_due_schedules_staff() TO authenticated;

-- ---------------------------------------------------------------------------
-- pg_cron every 5 minutes
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM cron.unschedule('outreach-run-due-schedules')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'outreach-run-due-schedules');

  PERFORM cron.schedule(
    'outreach-run-due-schedules',
    '*/5 * * * *',
    $cron$SELECT public.outreach_run_due_schedules();$cron$
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE '066: cron.job missing — schedule runner not registered';
  WHEN OTHERS THEN
    RAISE NOTICE '066: could not schedule outreach-run-due-schedules: %', SQLERRM;
END;
$$;
