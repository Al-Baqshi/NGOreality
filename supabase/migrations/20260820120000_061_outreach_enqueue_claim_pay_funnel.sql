/*
  # Phase 1 outreach → claim → bank pay funnel

  1. outreach_enqueue_emails — server-side bulk insert into notification_events
     from a worklist filter (or explicit ids), with suppression + dedupe.
  2. claim_organization — flip outreach_status to 'registered' so staff can
     measure invite response.
  3. ensure_payment_period — one-off landing_standards_package must not invent
     a year-long membership period.
  4. Cron flush — authenticate with X-Worker-Key from Vault (NOTIFY_WORKER_KEY),
     not the anon Bearer token (send-notifications rejects anon alone).
*/

-- ---------------------------------------------------------------------------
-- 1. Bulk enqueue
-- ---------------------------------------------------------------------------

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

CREATE OR REPLACE FUNCTION public.outreach_email_subject(
  p_template text,
  p_org_name text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_template
    WHEN 'outreach_cold_invite' THEN format('[NGOreality] Claim your organisation profile — %s', p_org_name)
    WHEN 'outreach_no_website' THEN format('[NGOreality] A simple web presence for %s', p_org_name)
    WHEN 'outreach_website_help' THEN format('[NGOreality] Website help for %s', p_org_name)
    ELSE 'NGOreality'
  END;
$$;

CREATE OR REPLACE FUNCTION public.outreach_enqueue_emails(
  p_template   text,
  p_segment    text DEFAULT 'all',
  p_outreach   text DEFAULT NULL,
  p_q          text DEFAULT NULL,
  p_exclude    uuid[] DEFAULT '{}',
  p_ids        uuid[] DEFAULT NULL,
  p_site_url   text DEFAULT 'https://www.ngoreality.com',
  p_subject    text DEFAULT NULL,
  p_body       text DEFAULT NULL,
  p_dedupe_days integer DEFAULT 14,
  p_max        integer DEFAULT 25000
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_cap integer := least(greatest(coalesce(p_max, 25000), 1), 25000);
  v_base text := rtrim(coalesce(nullif(trim(p_site_url), ''), 'https://www.ngoreality.com'), '/');
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

  SELECT coalesce(nullif(u.email, ''), 'staff') INTO v_actor
    FROM auth.users u WHERE u.id = auth.uid();
  v_actor := coalesce(v_actor, 'staff');

  WITH candidates AS (
    SELECT o.id, o.name, lower(trim(o.email)) AS email_norm, trim(o.email) AS email
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
           AND ne.status IN ('pending', 'sending', 'sent')
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
          replace(replace(p_subject, '{name}', t.name), '{organizationName}', t.name)
        ELSE public.outreach_email_subject(p_template, t.name)
      END,
      CASE
        WHEN nullif(trim(p_body), '') IS NOT NULL THEN
          replace(replace(p_body, '{name}', t.name), '{organizationName}', t.name)
        ELSE public.outreach_email_body(
          p_template,
          t.name,
          v_base || '/ngo/signup?org=' || t.id::text
        )
      END,
      'pending'
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
    RETURNING o.id
  ),
  logged AS (
    INSERT INTO activity_log (organization_id, action, description, performed_by, metadata)
    SELECT i.organization_id,
           'outreach_email_queued',
           format('Queued %s email', p_template),
           v_actor,
           jsonb_build_object('template', p_template, 'bulk', true)
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
    'cap', v_cap
  );
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_email_body(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outreach_email_subject(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outreach_enqueue_emails(text, text, text, text, uuid[], uuid[], text, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.outreach_enqueue_emails(text, text, text, text, uuid[], uuid[], text, text, text, integer, integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Claim → registered outreach status
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_organization(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_org record;
  v_existing_role text;
  v_managers jsonb;
  v_email_match boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT id, name, email, status, outreach_status INTO v_org
    FROM organizations
   WHERE id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT role INTO v_existing_role
    FROM organization_members
   WHERE organization_id = p_organization_id AND user_id = v_uid;

  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already_member', 'role', v_existing_role);
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'email', coalesce(nullif(pr.email, ''), '(email unavailable)'),
           'full_name', coalesce(pr.full_name, ''),
           'role', m.role
         ) ORDER BY m.created_at)
    INTO v_managers
    FROM organization_members m
    LEFT JOIN profiles pr ON pr.id = m.user_id
   WHERE m.organization_id = p_organization_id;

  IF v_managers IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_managed', 'managers', v_managers);
  END IF;

  v_email_match :=
    v_email IS NOT NULL
    AND coalesce(nullif(trim(v_org.email), ''), '') <> ''
    AND lower(trim(v_org.email)) = lower(trim(v_email));

  INSERT INTO organization_members (user_id, organization_id, role, verified_at, verified_by)
  VALUES (
    v_uid,
    p_organization_id,
    'owner',
    CASE WHEN v_email_match THEN now() ELSE NULL END,
    CASE WHEN v_email_match THEN 'claim_organization:email_match' ELSE '' END
  );

  IF coalesce(v_org.email, '') = '' AND v_email IS NOT NULL THEN
    UPDATE organizations SET email = v_email WHERE id = p_organization_id;
  END IF;

  IF coalesce(v_org.status, '') = 'listed' THEN
    PERFORM set_config('ngoreality.claim_flow', 'on', true);
    UPDATE organizations
       SET onboarding_stage = coalesce(nullif(onboarding_stage, ''), 'intake'),
           outreach_status = CASE
             WHEN outreach_status IN (
               'not_contacted', 'cold_email', 'no_website', 'website_issues',
               'contacted', 'follow_up', 'responded'
             ) THEN 'registered'
             ELSE outreach_status
           END,
           last_outreach_at = now(),
           updated_at = now()
     WHERE id = p_organization_id;
    PERFORM set_config('ngoreality.claim_flow', 'off', true);
  END IF;

  PERFORM public.seed_verification_criteria(p_organization_id);

  INSERT INTO activity_log (organization_id, action, description, performed_by)
  VALUES (p_organization_id, 'ngo_claim',
          'Organization claimed via NGO portal signup', coalesce(v_email, 'portal user'));

  PERFORM public.insert_portal_notification_staff(
    'ngo_claim',
    'Directory organisation claimed',
    format('%s was claimed by %s (owner)', v_org.name, coalesce(v_email, 'a portal user')),
    '/organizations/' || p_organization_id,
    p_organization_id
  );

  RETURN jsonb_build_object('status', 'claimed', 'role', 'owner', 'organization_id', p_organization_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. One-off package periods
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_payment_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' THEN
    IF NEW.product_type = 'landing_standards_package' THEN
      -- One-off product: stamp start, leave end null (not a subscription).
      IF NEW.period_start IS NULL THEN
        NEW.period_start := coalesce(NEW.paid_at, now());
      END IF;
      NEW.period_end := NULL;
    ELSE
      IF NEW.period_start IS NULL THEN
        NEW.period_start := coalesce(NEW.paid_at, now());
      END IF;
      IF NEW.period_end IS NULL THEN
        NEW.period_end := NEW.period_start
          + CASE WHEN NEW.product_type = 'monitoring_monthly'
                 THEN interval '1 month'
                 ELSE interval '1 year'
            END;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Cron: X-Worker-Key from Vault
-- ---------------------------------------------------------------------------
-- Ops must create the secret once:
--   select vault.create_secret('<NOTIFY_WORKER_KEY value>', 'notify_worker_key');
-- Same value as Edge Function secret NOTIFY_WORKER_KEY.

DO $$
DECLARE
  v_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets
     WHERE name = 'notify_worker_key'
     LIMIT 1;
  EXCEPTION WHEN undefined_table OR insufficient_privilege OR OTHERS THEN
    v_key := NULL;
  END;

  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE NOTICE
      '061: vault secret notify_worker_key missing — flush-notification-emails cron NOT re-keyed. Create the vault secret and re-run the cron schedule block, or set X-Worker-Key manually.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('flush-notification-emails')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flush-notification-emails');

  PERFORM cron.schedule(
    'flush-notification-emails',
    '*/2 * * * *',
    format(
$cron$
  SELECT net.http_post(
    url     := 'https://cpbilbskfbzqlynjhdvm.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Worker-Key', %L
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
$cron$,
      v_key
    )
  );
END;
$$;
