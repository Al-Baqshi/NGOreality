/*
  # SECURITY — close self-service badge forgery and registry tampering

  Applied to the live project on 2026-07-28.

  Before this, the anon key — which ships inside every browser bundle and is
  public by design — held ALL on verification_badges, verification_criteria,
  contacts and activity_log, plus INSERT/UPDATE on organizations. Any visitor
  could issue themselves a Reality Badge, mark it active, and edit any of the
  ~29,000 charity records. A parallel set of `authenticated` policies used a
  literal `true`, so every signed-up NGO user could do the same.

  The badge's only value is that it cannot be self-awarded.

  Replacements are created BEFORE the permissive policies are dropped, so there
  is no window in which staff lose access.

  Verified against the live API afterwards: badge forgery and org insertion
  return 401; contacts and activity_log return []; the public directory, badge
  verification page, blog and contact form all still work.
*/

-- 1. Staff-scoped replacements ------------------------------------------------

DROP POLICY IF EXISTS "Staff manage organizations" ON organizations;
CREATE POLICY "Staff manage organizations"
  ON organizations FOR ALL TO authenticated
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

-- Self-signup may still create an organisation, but never a pre-verified one.
DROP POLICY IF EXISTS "Authenticated can create unverified organization" ON organizations;
CREATE POLICY "Authenticated can create unverified organization"
  ON organizations FOR INSERT TO authenticated
  WITH CHECK (
    coalesce(status, 'onboarding') IN ('onboarding', 'prospect', 'inbound')
    AND coalesce(verification_level, 'none') = 'none'
  );

DROP POLICY IF EXISTS "Staff manage verification badges" ON verification_badges;
CREATE POLICY "Staff manage verification badges"
  ON verification_badges FOR ALL TO authenticated
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "Staff read all badges" ON verification_badges;
CREATE POLICY "Staff read all badges"
  ON verification_badges FOR SELECT TO authenticated
  USING (public.is_staff_user());

DROP POLICY IF EXISTS "Staff manage verification criteria" ON verification_criteria;
CREATE POLICY "Staff manage verification criteria"
  ON verification_criteria FOR ALL TO authenticated
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "Staff manage contacts" ON contacts;
CREATE POLICY "Staff manage contacts"
  ON contacts FOR ALL TO authenticated
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "Staff read activity log" ON activity_log;
CREATE POLICY "Staff read activity log"
  ON activity_log FOR SELECT TO authenticated
  USING (public.is_staff_user());

DROP POLICY IF EXISTS "Staff insert activity log" ON activity_log;
CREATE POLICY "Staff insert activity log"
  ON activity_log FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "Staff manage blog posts" ON blog_posts;
CREATE POLICY "Staff manage blog posts"
  ON blog_posts FOR ALL TO authenticated
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "Staff manage inquiries" ON inquiry_submissions;
CREATE POLICY "Staff manage inquiries"
  ON inquiry_submissions FOR ALL TO authenticated
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

-- 2. Drop every anon write policy ---------------------------------------------
-- KEPT deliberately: "Public can read directory organizations",
-- "Public can read active badges", "Public can read published posts",
-- "Anyone can submit inquiries" (INSERT only). The public site needs these.

DROP POLICY IF EXISTS "Anon CRM activity_log"          ON activity_log;
DROP POLICY IF EXISTS "Anon CRM blog"                  ON blog_posts;
DROP POLICY IF EXISTS "Anon CRM contacts"              ON contacts;
DROP POLICY IF EXISTS "Anon CRM inquiries read"        ON inquiry_submissions;
DROP POLICY IF EXISTS "Anon CRM inquiries update"      ON inquiry_submissions;
DROP POLICY IF EXISTS "Anon CRM read organizations"    ON organizations;
DROP POLICY IF EXISTS "Anon CRM write organizations"   ON organizations;
DROP POLICY IF EXISTS "Anon CRM update organizations"  ON organizations;
DROP POLICY IF EXISTS "Anon CRM verification_badges"   ON verification_badges;
DROP POLICY IF EXISTS "Anon CRM verification_criteria" ON verification_criteria;

-- 3. Drop every always-true `authenticated` policy -----------------------------

DROP POLICY IF EXISTS "Authenticated users can insert activity log"           ON activity_log;
DROP POLICY IF EXISTS "Authenticated users can read activity log"             ON activity_log;
DROP POLICY IF EXISTS "Authenticated can delete posts"                        ON blog_posts;
DROP POLICY IF EXISTS "Authenticated can insert posts"                        ON blog_posts;
DROP POLICY IF EXISTS "Authenticated can update posts"                        ON blog_posts;
DROP POLICY IF EXISTS "Authenticated can read all posts"                      ON blog_posts;
DROP POLICY IF EXISTS "Authenticated users can delete contacts"               ON contacts;
DROP POLICY IF EXISTS "Authenticated users can insert contacts"               ON contacts;
DROP POLICY IF EXISTS "Authenticated users can update contacts"               ON contacts;
DROP POLICY IF EXISTS "Authenticated users can read contacts"                 ON contacts;
DROP POLICY IF EXISTS "Authenticated users can read inquiries"                ON inquiry_submissions;
DROP POLICY IF EXISTS "Authenticated users can update inquiries"              ON inquiry_submissions;
DROP POLICY IF EXISTS "Authenticated can create organization for signup"      ON organizations;
DROP POLICY IF EXISTS "Authenticated users can insert organizations"          ON organizations;
DROP POLICY IF EXISTS "Authenticated users can read all organizations"        ON organizations;
DROP POLICY IF EXISTS "Authenticated users can update organizations"          ON organizations;
DROP POLICY IF EXISTS "Authenticated users can insert badges"                 ON verification_badges;
DROP POLICY IF EXISTS "Authenticated users can update badges"                 ON verification_badges;
DROP POLICY IF EXISTS "Authenticated users can read all badges"               ON verification_badges;
DROP POLICY IF EXISTS "Authenticated users can delete verification criteria"  ON verification_criteria;
DROP POLICY IF EXISTS "Authenticated users can insert verification criteria"  ON verification_criteria;
DROP POLICY IF EXISTS "Authenticated users can update verification criteria"  ON verification_criteria;
DROP POLICY IF EXISTS "Authenticated users can read verification criteria"    ON verification_criteria;

-- 4. Members may edit their own organisation, but not their own trust status.
--
-- RLS cannot express "these columns are off limits", and WITH CHECK sees only
-- the NEW row, so a policy alone cannot stop a member flipping status to
-- 'verified'. A trigger can compare OLD and NEW.
--
-- NOTE: the first version of this function referenced organizations.verified_at,
-- which does not exist, so it raised 42703 on every non-staff UPDATE. It also
-- treated "not staff" as "end user", but auth.uid() is NULL for the service
-- role, migrations and background jobs. Both are corrected below.

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

DROP TRIGGER IF EXISTS trg_guard_organization_trust_columns ON organizations;
CREATE TRIGGER trg_guard_organization_trust_columns
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_organization_trust_columns();

-- 5. Staff may manage memberships; see 029 for the claim policy itself.

DROP POLICY IF EXISTS "Staff manage organization members" ON organization_members;
CREATE POLICY "Staff manage organization members"
  ON organization_members FOR ALL TO authenticated
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

-- 6. The one ERROR-level linter finding.
ALTER VIEW IF EXISTS public.business_plan_actuals SET (security_invoker = true);
