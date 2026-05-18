/*
  # Staff-only CRM access

  Removes anonymous CRM policies and broad authenticated CRM policies.
  CRM tables are writable by staff (profiles.is_staff) only.
  NGO members retain scoped access via existing member policies.
*/

-- Remove legacy anon CRM access
DROP POLICY IF EXISTS "Anon CRM read organizations" ON organizations;
DROP POLICY IF EXISTS "Anon CRM write organizations" ON organizations;
DROP POLICY IF EXISTS "Anon CRM update organizations" ON organizations;
DROP POLICY IF EXISTS "Anon CRM contacts" ON contacts;
DROP POLICY IF EXISTS "Anon CRM verification_criteria" ON verification_criteria;
DROP POLICY IF EXISTS "Anon CRM verification_badges" ON verification_badges;
DROP POLICY IF EXISTS "Anon CRM activity_log" ON activity_log;
DROP POLICY IF EXISTS "Anon CRM inquiries read" ON inquiry_submissions;
DROP POLICY IF EXISTS "Anon CRM inquiries update" ON inquiry_submissions;
DROP POLICY IF EXISTS "Anon CRM blog" ON blog_posts;

-- Replace permissive authenticated CRM policies
DROP POLICY IF EXISTS "Authenticated users can read all organizations" ON organizations;
DROP POLICY IF EXISTS "Authenticated users can insert organizations" ON organizations;
DROP POLICY IF EXISTS "Authenticated users can update organizations" ON organizations;

DROP POLICY IF EXISTS "Authenticated users can read contacts" ON contacts;
DROP POLICY IF EXISTS "Authenticated users can insert contacts" ON contacts;
DROP POLICY IF EXISTS "Authenticated users can update contacts" ON contacts;
DROP POLICY IF EXISTS "Authenticated users can delete contacts" ON contacts;

DROP POLICY IF EXISTS "Authenticated users can read verification criteria" ON verification_criteria;
DROP POLICY IF EXISTS "Authenticated users can insert verification criteria" ON verification_criteria;
DROP POLICY IF EXISTS "Authenticated users can update verification criteria" ON verification_criteria;
DROP POLICY IF EXISTS "Authenticated users can delete verification criteria" ON verification_criteria;

DROP POLICY IF EXISTS "Authenticated users can read all badges" ON verification_badges;
DROP POLICY IF EXISTS "Authenticated users can insert badges" ON verification_badges;
DROP POLICY IF EXISTS "Authenticated users can update badges" ON verification_badges;

DROP POLICY IF EXISTS "Authenticated users can read activity log" ON activity_log;
DROP POLICY IF EXISTS "Authenticated users can insert activity log" ON activity_log;

DROP POLICY IF EXISTS "Authenticated users can read inquiries" ON inquiry_submissions;
DROP POLICY IF EXISTS "Authenticated users can update inquiries" ON inquiry_submissions;

DROP POLICY IF EXISTS "Authenticated can read all posts" ON blog_posts;
DROP POLICY IF EXISTS "Authenticated can insert posts" ON blog_posts;
DROP POLICY IF EXISTS "Authenticated can update posts" ON blog_posts;
DROP POLICY IF EXISTS "Authenticated can delete posts" ON blog_posts;

-- Staff CRM policies
CREATE POLICY "Staff manage organizations"
  ON organizations FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff manage contacts"
  ON contacts FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff manage verification criteria"
  ON verification_criteria FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff manage verification badges"
  ON verification_badges FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff manage activity log"
  ON activity_log FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff manage inquiries"
  ON inquiry_submissions FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff manage blog posts"
  ON blog_posts FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());
