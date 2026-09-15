/*
  # Website-help outreach copy

  Same friendly, conversation-first voice as no-website.
  CTA is the public directory page. Website price NZD $650 one-off.
*/

CREATE OR REPLACE FUNCTION public.outreach_email_subject(
  p_template text,
  p_org_name text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_template
    WHEN 'outreach_cold_invite' THEN format('[NGOreality] Claim your organisation profile — %s', p_org_name)
    WHEN 'outreach_no_website' THEN format('[NGOreality] A note for %s', p_org_name)
    WHEN 'outreach_website_help' THEN format('[NGOreality] A note for %s', p_org_name)
    ELSE 'NGOreality'
  END;
$$;

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

—
NGOreality is New Zealand owned and operated.
Phone: +64 27 338 8500$msg$,
        p_org_name, p_signup_url
      );
    WHEN 'outreach_no_website' THEN
      RETURN format(
$msg$Kia ora %1$s,

We came across %1$s while looking at New Zealand charities and noticed there isn't a public website listed.

We're not suggesting you need an expensive new website.

Sometimes a clear public profile, updated organisation information, and a simple trust-focused page are enough to make it much easier for people to understand who you are and what your organisation does.

If that would help %1$s, a trust landing page with us is NZD $650, one-off. We build it at that fixed price.

You can claim your NGOreality profile here:
%2$s

If you'd like, reply to this email and we can explain what we would recommend for %1$s and what it would cost.

No pressure — we're happy to have a conversation first.

—
NGOreality is New Zealand owned and operated.

Learn more:
https://www.ngoreality.com/public/about

CEO: Al Baqshi
Phone: +64 27 338 8500$msg$,
        p_org_name, p_signup_url
      );
    WHEN 'outreach_website_help' THEN
      RETURN format(
$msg$Kia ora %1$s,

We came across %1$s while looking at New Zealand charities and noticed your website does not appear to be loading at the moment.

That happens more often than people think, and it is not a criticism. When a site is down, it is simply harder for people to find you and understand the work you do.

We're not suggesting you need an expensive new website.

Sometimes a clear public profile and a simple trust-focused page are enough — and if you would like us to build that for %1$s, a trust landing page is NZD $650, one-off. We build it at that fixed price.

You can claim your NGOreality profile here:
%2$s

If you'd like, reply to this email and we can explain what we would recommend for %1$s and what it would cost.

No pressure — we're happy to have a conversation first.

—
NGOreality is New Zealand owned and operated.

Learn more:
https://www.ngoreality.com/public/about

CEO: Al Baqshi
Phone: +64 27 338 8500$msg$,
        p_org_name, p_signup_url
      );
    ELSE
      RETURN '';
  END CASE;
END;
$$;

-- Bulk enqueue: all outreach templates link to the public directory page.
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
          v_base || '/public/org/' || coalesce(t.slug, '')
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
