/*
  # Claiming stays open. Editing a real charity's public entry does not.

  PRODUCT DECISION (2026-08-12): anyone may claim an organisation. That is
  deliberate and it is the market model — a claim gives mission control: the
  monitoring dashboard, uptime alerts, and the ability for a third party to
  sponsor a charity's subscription. None of that harms the charity, and
  requiring proof before it would kill the funnel for no benefit.

  What a claim must NOT give, because none of it is mission control:

    1. Editing the public listing. name, description, logo_url and above all
       website_url appear in a PUBLIC TRUST DIRECTORY. Repointing website_url
       is donation diversion on a site whose entire product is trust.
    2. Capturing organizations.email — that is where badge and payment mail is
       sent (see 032), so setting it redirects the charity's correspondence.
    3. Requesting a Reality Badge. A badge displayed against a charity you do
       not run is the product's central claim, falsified.

  So membership becomes two tiers rather than one:

    CLAIMED   (anyone, no proof)  — read, monitoring, alerts, sponsorship
    STEWARD   (verified_at set)   — edit the listing, request badges

  Stewardship is granted by staff today (set_org_stewardship). A registry-email
  token can become a self-serve fast path later without changing this shape:
  it would set the same column.

  Claims already notify staff (034's insert_portal_notification_staff), and
  joins notify the incumbent managers, so the dispute route — "that is my
  charity" — already has a signal. This migration makes the window between
  claim and dispute harmless rather than merely observable.
*/

-- ---------------------------------------------------------------------------
-- 1. The tier marker
-- ---------------------------------------------------------------------------

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by text NOT NULL DEFAULT '';

COMMENT ON COLUMN organization_members.verified_at IS
  'NULL = claimed (mission control only). Set = steward: may edit the public listing and request badges. Granted by staff via set_org_stewardship.';

-- Existing members predate the distinction and were created when claiming was
-- the only tier. There is one, and it is the genuine manager, so it carries
-- across as a steward rather than silently losing access it already had.
UPDATE organization_members
   SET verified_at = coalesce(verified_at, created_at),
       verified_by = 'migration:042 (pre-existing member)'
 WHERE verified_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. The predicate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_org_steward(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_staff_user() OR EXISTS (
    SELECT 1 FROM organization_members m
     WHERE m.organization_id = p_organization_id
       AND m.user_id = auth.uid()
       AND m.verified_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_steward(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_steward(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Gate the two surfaces that matter
-- ---------------------------------------------------------------------------

-- Editing the public listing. The trust-guard trigger (028b/034) already blocks
-- status, verification_level and the registry identifiers; this closes the rest
-- — name, slug, description, logo_url, website_url, email, phone.
DROP POLICY IF EXISTS "Members can update own organization" ON organizations;
CREATE POLICY "Stewards can update own organization"
  ON organizations FOR UPDATE TO authenticated
  USING (public.is_org_steward(id))
  WITH CHECK (public.is_org_steward(id));

-- Badge requests. 032's trigger emails bank details to the organisation's
-- address on file, so an unverified claimer requesting a badge both falsifies
-- the badge and sends a payment demand in the charity's name.
DROP POLICY IF EXISTS "Members can create badge requests for own org" ON badge_requests;
CREATE POLICY "Stewards can create badge requests for own org"
  ON badge_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_org_steward(organization_id) AND requested_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Granting stewardship — staff only, and it leaves a trail
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_org_stewardship(
  p_organization_id uuid,
  p_user_id uuid,
  p_verified boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_org   text;
  v_email text;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT coalesce(nullif(u.email, ''), 'staff') INTO v_actor FROM auth.users u WHERE u.id = auth.uid();
  SELECT name INTO v_org FROM organizations WHERE id = p_organization_id;
  SELECT coalesce(nullif(pr.email, ''), '(unknown)') INTO v_email FROM profiles pr WHERE pr.id = p_user_id;

  UPDATE organization_members
     SET verified_at = CASE WHEN p_verified THEN now() ELSE NULL END,
         verified_by = CASE WHEN p_verified THEN coalesce(v_actor, 'staff') ELSE '' END
   WHERE organization_id = p_organization_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_member');
  END IF;

  INSERT INTO activity_log (organization_id, action, description, performed_by)
  VALUES (p_organization_id,
          CASE WHEN p_verified THEN 'stewardship_granted' ELSE 'stewardship_revoked' END,
          format('%s stewardship for %s', CASE WHEN p_verified THEN 'Granted' ELSE 'Revoked' END, v_email),
          coalesce(v_actor, 'staff'));

  -- Tell the person, so a grant is not silent and a revoke is not a mystery.
  PERFORM public.insert_portal_notification_ngo(
    p_organization_id,
    CASE WHEN p_verified THEN 'stewardship_granted' ELSE 'stewardship_revoked' END,
    CASE WHEN p_verified THEN 'You can now manage this listing'
         ELSE 'Your management access was withdrawn' END,
    CASE WHEN p_verified
         THEN format('NGOreality confirmed you manage %s. You can now edit the public listing and apply for a Reality Badge.', coalesce(v_org, 'this organisation'))
         ELSE format('Editing and badge applications for %s are no longer available to this account. Monitoring is unaffected. Contact us if this is wrong.', coalesce(v_org, 'this organisation')) END,
    '/ngo'
  );

  RETURN jsonb_build_object('status', 'ok', 'verified', p_verified);
END;
$$;

REVOKE ALL ON FUNCTION public.set_org_stewardship(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_org_stewardship(uuid, uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Let the portal and the CRM see the tier
-- ---------------------------------------------------------------------------

-- Return type gains two columns, so CREATE OR REPLACE is not enough.
DROP FUNCTION IF EXISTS public.get_organization_portal_members(uuid);

CREATE OR REPLACE FUNCTION public.get_organization_portal_members(p_organization_id uuid)
RETURNS TABLE (
  user_id uuid, email text, full_name text, member_role text,
  joined_at timestamptz, verified_at timestamptz, verified_by text
)
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
         m.created_at,
         m.verified_at,
         m.verified_by
    FROM organization_members m
    LEFT JOIN profiles pr ON pr.id = m.user_id
   WHERE m.organization_id = p_organization_id
   ORDER BY m.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_portal_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_portal_members(uuid) TO authenticated;
