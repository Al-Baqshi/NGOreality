/*
  # NGO portal: auth links, membership, badge requests

  - organization_members — links auth.users to organizations
  - organization_memberships — annual membership periods
  - badge_requests — NGO requests for new badge / renewal
  - profiles — user metadata (staff vs ngo)
  - RLS scoped to a member's organization(s)
*/

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text DEFAULT '',
  is_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Organization members (NGO account ↔ organization)
CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_organization_id ON organization_members(organization_id);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Annual membership
CREATE TABLE IF NOT EXISTS organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'pending_renewal')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_memberships_org ON organization_memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_memberships_expires ON organization_memberships(expires_at);

ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;

-- Badge / renewal requests from NGOs
CREATE TABLE IF NOT EXISTS badge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type text NOT NULL DEFAULT 'new_badge'
    CHECK (request_type IN ('new_badge', 'renewal', 'reissue')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_review', 'approved', 'rejected')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_badge_requests_org ON badge_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_badge_requests_status ON badge_requests(status);

ALTER TABLE badge_requests ENABLE ROW LEVEL SECURITY;

-- Helper: organization IDs for the current user
CREATE OR REPLACE FUNCTION public.user_organization_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_staff_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_staff FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- organization_members policies
CREATE POLICY "Members can read own memberships"
  ON organization_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_staff_user());

CREATE POLICY "Users can link themselves to an org"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- organization_memberships policies
CREATE POLICY "Members can read own org memberships"
  ON organization_memberships FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.user_organization_ids()) OR public.is_staff_user());

CREATE POLICY "Members can insert membership for own org"
  ON organization_memberships FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()) OR public.is_staff_user());

CREATE POLICY "Staff can update memberships"
  ON organization_memberships FOR UPDATE
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- badge_requests policies
CREATE POLICY "Members can read own org badge requests"
  ON badge_requests FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.user_organization_ids()) OR public.is_staff_user());

CREATE POLICY "Members can create badge requests for own org"
  ON badge_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND requested_by = auth.uid()
  );

CREATE POLICY "Staff can update badge requests"
  ON badge_requests FOR UPDATE
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- NGOs can read/update their own organization
CREATE POLICY "Members can read own organization"
  ON organizations FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.user_organization_ids()));

CREATE POLICY "Members can update own organization"
  ON organizations FOR UPDATE
  TO authenticated
  USING (id IN (SELECT public.user_organization_ids()))
  WITH CHECK (id IN (SELECT public.user_organization_ids()));

-- NGOs can read their badges and criteria
CREATE POLICY "Members can read own verification badges"
  ON verification_badges FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY "Members can read own verification criteria"
  ON verification_criteria FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY "Members can insert own verification criteria"
  ON verification_criteria FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY "Members can read own activity log"
  ON activity_log FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.user_organization_ids()));

-- NGOs can insert organizations during signup (before member row exists)
CREATE POLICY "Authenticated can create organization for signup"
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Legacy CRM: anon full access (replace with staff auth in production)
CREATE POLICY "Anon CRM read organizations"
  ON organizations FOR SELECT TO anon USING (true);

CREATE POLICY "Anon CRM write organizations"
  ON organizations FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon CRM update organizations"
  ON organizations FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon CRM contacts"
  ON contacts FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon CRM verification_criteria"
  ON verification_criteria FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon CRM verification_badges"
  ON verification_badges FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon CRM activity_log"
  ON activity_log FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon CRM inquiries read"
  ON inquiry_submissions FOR SELECT TO anon USING (true);

CREATE POLICY "Anon CRM inquiries update"
  ON inquiry_submissions FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon CRM blog"
  ON blog_posts FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Staff read all badge requests"
  ON badge_requests FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Members can insert own activity log"
  ON activity_log FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY "Members can insert own contacts"
  ON contacts FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
