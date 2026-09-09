/*
  # Cold invite CTA → public org page

  Default outreach_cold_invite body links to /public/org/<slug> instead of
  /ngo/signup, matching the staff draft `{page}` bracket.
*/

CREATE OR REPLACE FUNCTION public.outreach_email_body(
  p_template text,
  p_org_name text,
  p_signup_url text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_template
    WHEN 'outreach_cold_invite' THEN
      RETURN format(
$msg$Kia ora,

We are reaching out from NGOreality because %s is listed on the New Zealand charities register and may benefit from a verified public profile, optional website support, and trust standards that funders recognise.

Claim and onboard your organisation here (free to start):
%s

Once claimed, you can pay by bank transfer for:
• Reality Badge membership — NZD $70 / year (badge + website monitoring)
• Trust landing page package — NZD $650 one-off (we build a standards-ready page)

Reply to this email if you have questions — we are happy to walk you through it.

— NGOreality outreach$msg$,
        p_org_name, p_signup_url
      );
    WHEN 'outreach_no_website' THEN
      RETURN format(
$msg$Kia ora,

We noticed %s does not currently have a public website listed. Many charities use NGOreality for a lightweight trust landing page (NZD $650), verified registry details, and optional Reality Badge membership (NZD $70 / year) with monitoring.

Start here when it suits you:
%s

There is no obligation — reply if you would like a short call about options.

— NGOreality$msg$,
        p_org_name, p_signup_url
      );
    WHEN 'outreach_website_help' THEN
      RETURN format(
$msg$Kia ora,

Our systems flagged that the website for %s may be unreachable or returning errors.

NGOreality members receive monitoring alerts with Reality Badge membership (NZD $70 / year). We can also help fix or replace a site with our trust landing page package (NZD $650).

If you would like support, reply to this email or claim your profile:
%s

— NGOreality$msg$,
        p_org_name, p_signup_url
      );
    ELSE
      RETURN '';
  END CASE;
END;
$$;

-- Enqueue: cold invite uses public page URL; other templates keep signup deep-link
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
          public.outreach_personalize_draft(p_subject, t.name, v_base || '/public/org/' || coalesce(t.slug, ''))
        ELSE public.outreach_email_subject(p_template, t.name)
      END,
      CASE
        WHEN nullif(trim(p_body), '') IS NOT NULL THEN
          public.outreach_personalize_draft(p_body, t.name, v_base || '/public/org/' || coalesce(t.slug, ''))
        ELSE public.outreach_email_body(
          p_template,
          t.name,
          CASE
            WHEN p_template = 'outreach_cold_invite' THEN
              v_base || '/public/org/' || coalesce(t.slug, '')
            ELSE
              v_base || '/ngo/signup?org=' || t.id::text
          END
        )
      END,
      v_status
    FROM to_queue t
    RETURNING organization_id
  ),
  touched AS (
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

-- Schedule runner: default cold invite body uses public page URL
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
            v_sched.template,
            p.name,
            CASE
              WHEN v_sched.template = 'outreach_cold_invite' THEN
                v_base || '/public/org/' || coalesce(p.slug, '')
              ELSE
                v_base || '/ngo/signup?org=' || p.organization_id::text
            END
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
