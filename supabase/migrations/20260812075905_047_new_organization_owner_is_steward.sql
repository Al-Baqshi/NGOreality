-- 047: whoever registers a brand-new organisation is its steward.
--
-- Migration 042 split claiming into two tiers: CLAIMED (monitoring only) and
-- STEWARD (may edit the listing and request badges), because anyone can claim
-- any of the 29,226 registry listings and editing a charity's public details is
-- how donations get diverted.
--
-- That guard was aimed at REGISTRY listings, which already existed before the
-- claimant showed up. It caught register_new_organization by accident, and that
-- case is different in kind: the organisation did not exist until this call
-- created it. There is no rival claimant and nothing for staff to adjudicate —
-- yet the founder landed unverified and could not edit the record they had just
-- typed in, with no way out except a staff member pressing a button.
--
-- So: stamp stewardship at creation. verified_by names the mechanism rather
-- than a staff user id, so the dispute desk can tell self-registration apart
-- from a human decision.
--
-- This function is already live in production at this version; the file was
-- written afterwards to close the gap. Without it, `supabase db reset` or any
-- new environment rebuilds the regression from migration 034's definition.

CREATE OR REPLACE FUNCTION public.register_new_organization(
  p_name text,
  p_contact_name text,
  p_category text DEFAULT ''::text,
  p_location text DEFAULT ''::text,
  p_website_url text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_base text;
  v_slug text;
  v_n int := 0;
  v_org_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF coalesce(trim(p_name), '') = '' THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Enter your organization name.');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  v_base := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  IF v_base = '' THEN v_base := 'organization'; END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = v_slug) AND v_n < 50 LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;

  INSERT INTO organizations (name, slug, email, category, location, website_url,
                             status, verification_level, onboarding_stage, claimed_at)
  VALUES (trim(p_name), v_slug, v_email, p_category, p_location, p_website_url,
          'onboarding', 'none', 'intake', now())
  RETURNING id INTO v_org_id;

  -- Steward, not merely claimed: they created this organisation, so there is
  -- no ownership question for staff to adjudicate.
  INSERT INTO organization_members (user_id, organization_id, role, verified_at, verified_by)
  VALUES (v_uid, v_org_id, 'owner', now(), 'register_new_organization');

  PERFORM public.seed_verification_criteria(v_org_id);

  INSERT INTO contacts (organization_id, name, email, is_primary, role)
  VALUES (v_org_id, coalesce(nullif(trim(p_contact_name), ''), 'Primary contact'),
          coalesce(v_email, ''), true, 'Primary contact');

  INSERT INTO activity_log (organization_id, action, description, performed_by)
  VALUES (v_org_id, 'ngo_signup', 'Organization registered via NGO portal',
          coalesce(nullif(trim(p_contact_name), ''), v_email, 'portal user'));

  PERFORM public.insert_portal_notification_staff(
    'ngo_portal_registration',
    'New organisation registered via portal',
    format('%s registered by %s', trim(p_name), coalesce(v_email, 'a portal user')),
    '/organizations/' || v_org_id,
    v_org_id
  );

  RETURN jsonb_build_object('status', 'created', 'organization_id', v_org_id);
END;
$function$;
