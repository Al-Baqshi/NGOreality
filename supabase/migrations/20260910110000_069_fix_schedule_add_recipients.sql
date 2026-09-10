/*
  # Fix outreach_schedule_add_recipients

  Bugs:
  1. LIMIT was applied to candidates before skip filters, so segment add could
     examine 100 already-emailed/no-email rows and return added=0.
  2. p_dedupe_days=0 still evaluated created_at > now() (almost never true, but
     unclear). Treat <= 0 as "disable dedupe" for explicit staff picks.
  3. LEFT JOIN website_monitors could duplicate orgs when multiple monitors exist.
*/

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
  v_dedupe_days integer := coalesce(p_dedupe_days, 365);
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
