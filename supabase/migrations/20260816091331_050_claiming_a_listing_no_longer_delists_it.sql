-- Claiming a charity deleted it from the public directory.
--
-- claim_organization() moved status 'listed' -> 'onboarding', and
-- directory_listings shows status IN ('listed','verified','active'). So every
-- charity that accepted an invite and claimed its listing vanished from the
-- directory, with no way for the claimant to undo it. This fires on the
-- LEGITIMATE flow -- it is not merely an abuse vector, though it is that too:
-- a free account could delist in bulk, and 29,225 listings are reachable.
--
-- The root cause is two questions sharing one column. `status` is public
-- lifecycle -- is this organisation visible, and at what trust level.
-- `onboarding_stage` is the private funnel -- how far through setup are they.
-- Claiming changes the second and must not touch the first: the organisation
-- was already public before anyone claimed it, and a claim grants monitoring,
-- not a change in public standing.
--
-- register_new_organization() legitimately still opens at status 'onboarding',
-- because an organisation that self-registered has never been vetted and has
-- not earned a directory listing. That asymmetry is the point.
--
-- crm_dashboard_stats is updated in the same migration because its "pending"
-- count only saw claimed organisations by way of the delisting bug; counting
-- the funnel column keeps the staff pipeline honest once the bug is gone.

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT id, name, email, status INTO v_org
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

  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES (v_uid, p_organization_id, 'owner');

  IF coalesce(v_org.email, '') = '' AND v_email IS NOT NULL THEN
    UPDATE organizations SET email = v_email WHERE id = p_organization_id;
  END IF;

  -- Enter the onboarding funnel WITHOUT leaving the directory. The claim_flow
  -- GUC still wraps the write because guard_organization_trust_columns treats
  -- onboarding_stage as staff-managed.
  IF coalesce(v_org.status, '') = 'listed' THEN
    PERFORM set_config('ngoreality.claim_flow', 'on', true);
    UPDATE organizations
       SET onboarding_stage = coalesce(nullif(onboarding_stage, ''), 'intake')
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
$function$
;

CREATE OR REPLACE FUNCTION public.crm_dashboard_stats()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only';
  END IF;

  SELECT json_build_object(
    'total', (SELECT count(*)::int FROM organizations),
    'listed', (SELECT count(*)::int FROM organizations WHERE status = 'listed'),
    'verified', (SELECT count(*)::int FROM organizations WHERE status IN ('verified', 'active')),
    'pending', (SELECT count(*)::int FROM organizations
                 WHERE status IN ('onboarding', 'under_review')
                    OR coalesce(nullif(onboarding_stage, ''), '') <> ''),
    'outreach_due', (SELECT count(*)::int FROM organizations WHERE status = 'listed' AND outreach_status = 'not_contacted'),
    'listed_with_website', (SELECT count(*)::int FROM organizations WHERE status = 'listed' AND coalesce(trim(website_url), '') <> ''),
    'listed_without_website', (SELECT count(*)::int FROM organizations WHERE status = 'listed' AND coalesce(trim(website_url), '') = ''),
    'nz_registry', (SELECT count(*)::int FROM organizations WHERE source_registry = 'nz_charities_register'),
    'badges_active', (SELECT count(*)::int FROM verification_badges WHERE is_active = true),
    'badges_expiring_30d', (SELECT count(*)::int FROM verification_badges WHERE is_active = true AND expires_at IS NOT NULL AND expires_at > now() AND expires_at <= now() + interval '30 days'),
    'badges_expired', (SELECT count(*)::int FROM verification_badges WHERE is_active = true AND expires_at IS NOT NULL AND expires_at < now()),
    'badge_requests_pending', (SELECT count(*)::int FROM badge_requests WHERE status = 'pending'),
    'ngo_setup_requests_pending', (SELECT count(*)::int FROM ngo_setup_requests WHERE status = 'pending'),
    'monitors_total', (SELECT count(*)::int FROM website_monitors WHERE enabled = true),
    'monitors_up', (SELECT count(*)::int FROM website_monitors WHERE enabled = true AND last_status = 'up'),
    'monitors_down', (SELECT count(*)::int FROM website_monitors WHERE enabled = true AND last_status = 'down'),
    'incidents_open', (SELECT count(*)::int FROM website_incidents WHERE closed_at IS NULL),
    'engagements_active', (SELECT count(*)::int FROM service_engagements WHERE status = 'active'),
    'engagements_lead', (SELECT count(*)::int FROM service_engagements WHERE status = 'lead'),
    'follow_ups_due', (SELECT count(*)::int FROM service_engagements WHERE status IN ('lead', 'active') AND next_follow_up_at IS NOT NULL AND next_follow_up_at::date <= current_date),
    'tasks_due_today', (SELECT count(*)::int FROM staff_tasks WHERE status = 'open' AND due_date <= current_date),
    'pipeline', (SELECT coalesce(json_object_agg(status, cnt), '{}'::json) FROM (SELECT status, count(*)::int AS cnt FROM organizations WHERE status IN ('listed', 'onboarding', 'under_review', 'verified', 'active', 'lapsed') GROUP BY status) s),
    'outreach_pipeline', (SELECT coalesce(json_object_agg(outreach_status, cnt), '{}'::json) FROM (SELECT outreach_status, count(*)::int AS cnt FROM organizations WHERE status = 'listed' GROUP BY outreach_status) o)
  ) INTO result;

  RETURN result;
END;
$function$
;
