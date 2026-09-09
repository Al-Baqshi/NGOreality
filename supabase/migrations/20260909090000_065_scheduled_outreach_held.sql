/*
  # Scheduled outreach — hold until staff approves

  Pending rows are drained by pg_cron (~2 min). For a daily "ready to send"
  batch that must wait for an explicit admin release, we need a non-drainable
  status.

  1. Add status `held` (cron / Go / Edge only claim `pending`).
  2. Extend outreach_enqueue_emails with p_status ('pending' | 'held').
     Held inserts skip last_outreach_at / stage bumps until release.
  3. outreach_release_held_emails — promote held → pending (then cron sends).
  4. outreach_cancel_held_emails — held → skipped.
  5. outreach_held_summary — counts for the Scheduled outreach UI.
*/

-- ---------------------------------------------------------------------------
-- 1. Status check
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_events
  DROP CONSTRAINT IF EXISTS notification_events_status_check;

ALTER TABLE public.notification_events
  ADD CONSTRAINT notification_events_status_check
  CHECK (status = ANY (ARRAY[
    'pending', 'sending', 'sent', 'failed', 'skipped', 'suppressed', 'held'
  ]));

-- ---------------------------------------------------------------------------
-- 2. Enqueue with optional held status
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.outreach_enqueue_emails(
  text, text, text, text, uuid[], uuid[], text, text, text, integer, integer
);

CREATE OR REPLACE FUNCTION public.outreach_enqueue_emails(
  p_template    text,
  p_segment     text DEFAULT 'all',
  p_outreach    text DEFAULT NULL,
  p_q           text DEFAULT NULL,
  p_exclude     uuid[] DEFAULT '{}',
  p_ids         uuid[] DEFAULT NULL,
  p_site_url    text DEFAULT 'https://www.ngoreality.com',
  p_subject     text DEFAULT NULL,
  p_body        text DEFAULT NULL,
  p_dedupe_days integer DEFAULT 14,
  p_max         integer DEFAULT 25000,
  p_status      text DEFAULT 'pending'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_cap integer := least(greatest(coalesce(p_max, 25000), 1), 25000);
  v_base text := rtrim(coalesce(nullif(trim(p_site_url), ''), 'https://www.ngoreality.com'), '/');
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'pending'));
  v_matched bigint := 0;
  v_queued bigint := 0;
  v_skipped_no_email bigint := 0;
  v_skipped_suppressed bigint := 0;
  v_skipped_dedupe bigint := 0;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_template IS NULL OR p_template NOT IN (
    'outreach_cold_invite', 'outreach_no_website', 'outreach_website_help'
  ) THEN
    RAISE EXCEPTION 'unsupported outreach template: %', p_template;
  END IF;

  IF v_status NOT IN ('pending', 'held') THEN
    RAISE EXCEPTION 'unsupported enqueue status: % (use pending or held)', v_status;
  END IF;

  SELECT coalesce(nullif(u.email, ''), 'staff') INTO v_actor
    FROM auth.users u WHERE u.id = auth.uid();
  v_actor := coalesce(v_actor, 'staff');

  WITH candidates AS (
    SELECT o.id, o.name, o.slug, lower(trim(o.email)) AS email_norm, trim(o.email) AS email
      FROM organizations o
      LEFT JOIN website_monitors m
        ON m.organization_id = o.id AND m.enabled
     WHERE o.status = 'listed'
       AND o.is_customer = false
       AND (
         p_ids IS NOT NULL
         OR (
           (p_outreach IS NULL OR p_outreach = '' OR o.outreach_status = p_outreach)
           AND (p_q IS NULL OR p_q = '' OR o.name ILIKE '%' || p_q || '%')
           AND public.outreach_segment_matches(p_segment, o.website_url, m.last_status)
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
        SELECT 1 FROM notification_events ne
         WHERE ne.organization_id = c.id
           AND ne.template = p_template
           AND ne.status IN ('pending', 'sending', 'sent', 'held')
           AND ne.created_at > now() - make_interval(days => greatest(coalesce(p_dedupe_days, 14), 0))
      ) AS recent_dupe
    FROM candidates c
  ),
  counts AS (
    SELECT
      count(*) AS matched,
      count(*) FILTER (WHERE no_email) AS skipped_no_email,
      count(*) FILTER (WHERE NOT no_email AND suppressed) AS skipped_suppressed,
      count(*) FILTER (WHERE NOT no_email AND NOT suppressed AND recent_dupe) AS skipped_dedupe
    FROM scored
  ),
  to_queue AS (
    SELECT s.*
      FROM scored s
     WHERE NOT s.no_email
       AND NOT s.suppressed
       AND NOT s.recent_dupe
  ),
  inserted AS (
    INSERT INTO notification_events (
      organization_id, template, recipient_email, subject, body_text, status
    )
    SELECT
      t.id,
      p_template,
      t.email,
      CASE
        WHEN nullif(trim(p_subject), '') IS NOT NULL THEN
          public.outreach_personalize_draft(p_subject, t.name, v_base || '/public/org/' || t.slug)
        ELSE public.outreach_email_subject(p_template, t.name)
      END,
      CASE
        WHEN nullif(trim(p_body), '') IS NOT NULL THEN
          public.outreach_personalize_draft(p_body, t.name, v_base || '/public/org/' || t.slug)
        ELSE public.outreach_email_body(
          p_template,
          t.name,
          v_base || '/ngo/signup?org=' || t.id::text
        )
      END,
      v_status
    FROM to_queue t
    RETURNING organization_id
  ),
  touched AS (
    -- Only mark the org as contacted when the mail is actually queued to send.
    -- Held batches wait for release before touching last_outreach_at / stage.
    UPDATE organizations o
       SET last_outreach_at = now(),
           outreach_status = CASE
             WHEN o.outreach_status = 'not_contacted' THEN
               CASE p_template
                 WHEN 'outreach_no_website' THEN 'no_website'
                 WHEN 'outreach_website_help' THEN 'website_issues'
                 ELSE 'cold_email'
               END
             ELSE o.outreach_status
           END,
           updated_at = now()
      FROM inserted i
     WHERE o.id = i.organization_id
       AND v_status = 'pending'
    RETURNING o.id
  ),
  logged AS (
    INSERT INTO activity_log (organization_id, action, description, performed_by, metadata)
    SELECT i.organization_id,
           CASE WHEN v_status = 'held' THEN 'outreach_email_held' ELSE 'outreach_email_queued' END,
           CASE
             WHEN v_status = 'held' THEN format('Held %s email for approval', p_template)
             ELSE format('Queued %s email', p_template)
           END,
           v_actor,
           jsonb_build_object('template', p_template, 'bulk', true, 'status', v_status)
      FROM inserted i
    RETURNING organization_id
  )
  SELECT
    (SELECT matched FROM counts),
    (SELECT count(*) FROM inserted),
    (SELECT skipped_no_email FROM counts),
    (SELECT skipped_suppressed FROM counts),
    (SELECT skipped_dedupe FROM counts)
  INTO v_matched, v_queued, v_skipped_no_email, v_skipped_suppressed, v_skipped_dedupe;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'queued', v_queued,
    'skipped_no_email', v_skipped_no_email,
    'skipped_suppressed', v_skipped_suppressed,
    'skipped_dedupe', v_skipped_dedupe,
    'capped', v_matched >= v_cap,
    'cap', v_cap,
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_enqueue_emails(
  text, text, text, text, uuid[], uuid[], text, text, text, integer, integer, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.outreach_enqueue_emails(
  text, text, text, text, uuid[], uuid[], text, text, text, integer, integer, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Release held → pending
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.outreach_release_held_emails(
  p_limit integer DEFAULT 100,
  p_ids   uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_cap integer := least(greatest(coalesce(p_limit, 100), 1), 25000);
  v_released bigint := 0;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT coalesce(nullif(u.email, ''), 'staff') INTO v_actor
    FROM auth.users u WHERE u.id = auth.uid();
  v_actor := coalesce(v_actor, 'staff');

  WITH pick AS (
    SELECT ne.id, ne.organization_id, ne.template
      FROM notification_events ne
     WHERE ne.status = 'held'
       AND ne.template LIKE 'outreach%'
       AND (p_ids IS NULL OR ne.id = ANY (p_ids))
     ORDER BY ne.created_at ASC
     LIMIT v_cap
     FOR UPDATE OF ne SKIP LOCKED
  ),
  released AS (
    UPDATE notification_events ne
       SET status = 'pending',
           error_message = '',
           claimed_at = NULL
      FROM pick p
     WHERE ne.id = p.id
    RETURNING ne.id, ne.organization_id, ne.template
  ),
  touched AS (
    UPDATE organizations o
       SET last_outreach_at = now(),
           outreach_status = CASE
             WHEN o.outreach_status = 'not_contacted' THEN
               CASE r.template
                 WHEN 'outreach_no_website' THEN 'no_website'
                 WHEN 'outreach_website_help' THEN 'website_issues'
                 ELSE 'cold_email'
               END
             ELSE o.outreach_status
           END,
           updated_at = now()
      FROM released r
     WHERE o.id = r.organization_id
    RETURNING o.id
  ),
  logged AS (
    INSERT INTO activity_log (organization_id, action, description, performed_by, metadata)
    SELECT r.organization_id,
           'outreach_email_released',
           format('Released held %s email for send', r.template),
           v_actor,
           jsonb_build_object('template', r.template, 'event_id', r.id)
      FROM released r
    RETURNING organization_id
  )
  SELECT count(*) INTO v_released FROM released;

  RETURN jsonb_build_object(
    'released', v_released,
    'cap', v_cap
  );
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_release_held_emails(integer, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_release_held_emails(integer, uuid[])
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cancel held → skipped
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.outreach_cancel_held_emails(
  p_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 25000
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_cap integer := least(greatest(coalesce(p_limit, 25000), 1), 25000);
  v_cancelled bigint := 0;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT coalesce(nullif(u.email, ''), 'staff') INTO v_actor
    FROM auth.users u WHERE u.id = auth.uid();
  v_actor := coalesce(v_actor, 'staff');

  WITH pick AS (
    SELECT ne.id, ne.organization_id, ne.template
      FROM notification_events ne
     WHERE ne.status = 'held'
       AND ne.template LIKE 'outreach%'
       AND (p_ids IS NULL OR ne.id = ANY (p_ids))
     ORDER BY ne.created_at ASC
     LIMIT v_cap
  ),
  cancelled AS (
    UPDATE notification_events ne
       SET status = 'skipped',
           error_message = 'Held outreach cancelled by staff',
           sent_at = NULL,
           claimed_at = NULL
      FROM pick p
     WHERE ne.id = p.id
    RETURNING ne.id, ne.organization_id, ne.template
  ),
  logged AS (
    INSERT INTO activity_log (organization_id, action, description, performed_by, metadata)
    SELECT c.organization_id,
           'outreach_email_cancelled',
           format('Cancelled held %s email', c.template),
           v_actor,
           jsonb_build_object('template', c.template, 'event_id', c.id)
      FROM cancelled c
    RETURNING organization_id
  )
  SELECT count(*) INTO v_cancelled FROM cancelled;

  RETURN jsonb_build_object('cancelled', v_cancelled);
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_cancel_held_emails(uuid[], integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_cancel_held_emails(uuid[], integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Summary for Scheduled outreach UI
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.outreach_held_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Pacific/Auckland')
    AT TIME ZONE 'Pacific/Auckland';
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'held', (
      SELECT count(*)::int FROM notification_events
       WHERE status = 'held' AND template LIKE 'outreach%'
    ),
    'staged_today', (
      SELECT count(*)::int FROM notification_events
       WHERE template LIKE 'outreach%'
         AND status IN ('held', 'pending', 'sending', 'sent')
         AND created_at >= v_day_start
    ),
    'released_today', (
      SELECT count(*)::int FROM activity_log
       WHERE action = 'outreach_email_released'
         AND created_at >= v_day_start
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_held_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_held_summary() TO authenticated;
