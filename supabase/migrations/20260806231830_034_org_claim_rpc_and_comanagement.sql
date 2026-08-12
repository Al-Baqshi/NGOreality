/*
  # Signup → organisation linking done server-side, co-management opened up

  Product decisions (2026-07-30):

  1. Claiming a directory organisation no longer requires the signup email to
     match the registry email. Anyone may claim and manage an organisation; the
     Reality Badge itself is still only issued by staff after payment and
     criteria review, so an impostor gains nothing they can show publicly.
  2. An organisation that already has portal managers is NOT locked. A second
     person signing up against it is told who already manages it (their email)
     and may either contact them or join as an additional manager. Every join
     is disclosed: the existing managers get a portal notification and staff
     get a CRM notification, and the activity log records it. This deliberately
     supersedes the never-reclaim rule from migration 029 — the silent-takeover
     hole 029 closed stays closed because joins are never silent and never
     grant the CRM workspace (the Go service seats owners/admins explicitly).
  3. All linking now flows through SECURITY DEFINER RPCs so the multi-step
     client-side sequence (member row, status flip, criteria seed, log) cannot
     half-complete, and so the anon/authenticated INSERT policies on
     organization_members can be dropped entirely — including the permissive
     "Users can link themselves to an org" from 006, which was never dropped
     and let any authenticated user attach themselves to ANY organisation.

  New functions (all EXECUTE-granted to authenticated only; 030 already
  revoked default grants):
    - claim_organization(uuid)        → claim as owner, or report managers
    - join_organization(uuid)         → join an already-managed org as admin
    - register_new_organization(...)  → atomic new-org provisioning
    - get_organization_portal_members(uuid) → member list for staff/co-members
*/

-- ---------------------------------------------------------------------------
-- 1. profiles.email — so managers can be named to a would-be co-manager and
--    to staff without touching auth.users from the client.
-- ---------------------------------------------------------------------------

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';

UPDATE profiles p
   SET email = u.email
  FROM auth.users u
 WHERE u.id = p.id
   AND coalesce(p.email, '') = '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- Staff can read every profile (CRM needs to show who manages an org).
DROP POLICY IF EXISTS "Staff read all profiles" ON profiles;
CREATE POLICY "Staff read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

-- ---------------------------------------------------------------------------
-- 2. Let the claim RPC (and only it) flip listed → onboarding. The 028 trust
--    trigger blocks non-staff status changes; the RPC marks its transaction
--    with a local GUC the trigger honours. Clients cannot set this: PostgREST
--    exposes only functions in the public schema, not pg_catalog.set_config.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_organization_trust_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- service role / migration / background job
  END IF;

  IF public.is_staff_user() THEN
    RETURN NEW;
  END IF;

  -- The claim RPC moves a listed org into onboarding on first claim.
  IF current_setting('ngoreality.claim_flow', true) = 'on'
     AND OLD.status = 'listed'
     AND NEW.status = 'onboarding'
     AND NEW.verification_level IS NOT DISTINCT FROM OLD.verification_level
     AND NEW.is_customer IS NOT DISTINCT FROM OLD.is_customer
     AND NEW.source_registry IS NOT DISTINCT FROM OLD.source_registry
     AND NEW.external_id IS NOT DISTINCT FROM OLD.external_id
     AND NEW.charity_registration_number IS NOT DISTINCT FROM OLD.charity_registration_number
     AND NEW.nzbn IS NOT DISTINCT FROM OLD.nzbn
  THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.verification_level IS DISTINCT FROM OLD.verification_level
     OR NEW.onboarding_stage IS DISTINCT FROM OLD.onboarding_stage
     OR NEW.is_customer IS DISTINCT FROM OLD.is_customer
     OR NEW.source_registry IS DISTINCT FROM OLD.source_registry
     OR NEW.external_id IS DISTINCT FROM OLD.external_id
     OR NEW.charity_registration_number IS DISTINCT FROM OLD.charity_registration_number
     OR NEW.nzbn IS DISTINCT FROM OLD.nzbn
  THEN
    RAISE EXCEPTION
      'Only NGOreality staff can change verification status or registry identifiers'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Shared criteria seeding (mirrors DEFAULT_CRITERIA in src/types/index.ts)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_verification_criteria(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM verification_criteria WHERE organization_id = p_organization_id) THEN
    RETURN;
  END IF;

  INSERT INTO verification_criteria (organization_id, criterion_key, criterion_label, criterion_tier)
  VALUES
    (p_organization_id, 'website_functional',        'Website is functional and live',                                        'public'),
    (p_organization_id, 'mission_clear',             'Mission / description is clear (what you do)',                          'public'),
    (p_organization_id, 'contact_accessible',        'Contact information is accessible',                                     'public'),
    (p_organization_id, 'legal_pages',               'Privacy policy is present',                                             'public'),
    (p_organization_id, 'mobile_responsive',         'Website is mobile responsive',                                          'public'),
    (p_organization_id, 'communication_clear',       'Communication is clear and professional',                               'public'),
    (p_organization_id, 'code_repository',           'Independent code repository (org-owned)',                               'member'),
    (p_organization_id, 'security_baseline',         'Security baseline (HTTPS, headers, patches)',                           'member'),
    (p_organization_id, 'uptime_monitoring_config',  'Uptime monitoring configured (NGOreality or equivalent)',               'member'),
    (p_organization_id, 'shared_credentials',        'Shared org credentials (not personal email for critical services)',     'member'),
    (p_organization_id, 'donation_transparency',     'Donation usage is clearly explained',                                   'member');
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. claim_organization — the signup "link my charity" path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_organization(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Someone else already manages this organisation: report who, let the
  -- caller decide (contact them, or join via join_organization).
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

  -- First claim: caller becomes owner.
  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES (v_uid, p_organization_id, 'owner');

  IF coalesce(v_org.email, '') = '' AND v_email IS NOT NULL THEN
    UPDATE organizations SET email = v_email WHERE id = p_organization_id;
  END IF;

  IF v_org.status = 'listed' THEN
    PERFORM set_config('ngoreality.claim_flow', 'on', true);
    UPDATE organizations
       SET status = 'onboarding'
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
$$;

-- ---------------------------------------------------------------------------
-- 5. join_organization — "keep going" on an already-managed organisation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_organization(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_org record;
  v_existing_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT id, name INTO v_org
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

  IF NOT EXISTS (SELECT 1 FROM organization_members WHERE organization_id = p_organization_id) THEN
    -- Nobody manages it: this is a first claim, not a join.
    RETURN public.claim_organization(p_organization_id);
  END IF;

  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES (v_uid, p_organization_id, 'admin');

  INSERT INTO activity_log (organization_id, action, description, performed_by)
  VALUES (p_organization_id, 'ngo_join',
          'Additional manager joined via NGO portal', coalesce(v_email, 'portal user'));

  -- Joins are never silent: tell the existing managers and staff.
  PERFORM public.insert_portal_notification_ngo(
    p_organization_id,
    'manager_joined',
    'A new manager joined your organisation',
    format('%s now also manages %s on NGOreality. If you do not recognise them, contact support.',
           coalesce(v_email, 'A new portal user'), v_org.name),
    '/ngo'
  );

  PERFORM public.insert_portal_notification_staff(
    'manager_joined',
    'Additional manager joined an organisation',
    format('%s joined %s as an additional manager', coalesce(v_email, 'a portal user'), v_org.name),
    '/organizations/' || p_organization_id,
    p_organization_id
  );

  RETURN jsonb_build_object('status', 'joined', 'role', 'admin', 'organization_id', p_organization_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. register_new_organization — atomic replacement for the client-side
--    provisioning sequence (org → member → criteria → contact → log).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_new_organization(
  p_name text,
  p_contact_name text,
  p_category text DEFAULT '',
  p_location text DEFAULT '',
  p_website_url text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES (v_uid, v_org_id, 'owner');

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
$$;

-- ---------------------------------------------------------------------------
-- 7. Member list for the CRM and for co-managers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_organization_portal_members(p_organization_id uuid)
RETURNS TABLE (user_id uuid, email text, full_name text, member_role text, joined_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_staff_user()
    OR EXISTS (
      SELECT 1 FROM organization_members
       WHERE organization_id = p_organization_id AND organization_members.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to view members of this organisation'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT m.user_id,
         coalesce(pr.email, ''),
         coalesce(pr.full_name, ''),
         m.role,
         m.created_at
    FROM organization_members m
    LEFT JOIN profiles pr ON pr.id = m.user_id
   WHERE m.organization_id = p_organization_id
   ORDER BY m.created_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. All linking now goes through the RPCs — drop the client INSERT policies.
--    ("Users can link themselves to an org" from 006 was a hole in its own
--    right: it allowed any authenticated user to attach to ANY organisation.)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can link themselves to an org" ON organization_members;
DROP POLICY IF EXISTS "Users can claim a never-claimed organization" ON organization_members;

-- 030 revoked default EXECUTE; hand it back explicitly for the new RPCs.
GRANT EXECUTE ON FUNCTION public.claim_organization(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_organization(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_new_organization(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_portal_members(uuid)    TO authenticated;
REVOKE ALL ON FUNCTION public.claim_organization(uuid)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_organization(uuid)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_new_organization(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_organization_portal_members(uuid)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seed_verification_criteria(uuid)         FROM PUBLIC, anon, authenticated;
