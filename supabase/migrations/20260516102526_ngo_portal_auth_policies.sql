-- RESCUED FROM PRODUCTION during the A0 migration-history reconciliation.
-- Applied as version 20260516102526 with no source in git.
--
-- HISTORICAL RECORD — do not read this as current state. This is the policy
-- half of 006, and it is where several later-fixed holes originate:
--
--   * the "Anon CRM *" policies below are USING (true) for the anon role, i.e.
--     the whole CRM was once world-writable. Dropped by 007_staff_crm_rls.
--   * "Users can link themselves to an org" let any authenticated user attach
--     themselves to ANY organisation. Dropped by 034.
--   * "Members can update own organization" is still live and is what lets a
--     claimer edit a charity's public listing — the reason A3 adds proof of
--     control before a claim is granted.
--   * "Authenticated can create organization for signup" WITH CHECK (true).

CREATE POLICY "Members can read own memberships" ON organization_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff_user());
CREATE POLICY "Users can link themselves to an org" ON organization_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Members can read own org memberships" ON organization_memberships FOR SELECT TO authenticated USING (organization_id IN (SELECT public.user_organization_ids()) OR public.is_staff_user());
CREATE POLICY "Members can insert membership for own org" ON organization_memberships FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.user_organization_ids()) OR public.is_staff_user());
CREATE POLICY "Staff can update memberships" ON organization_memberships FOR UPDATE TO authenticated USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());
CREATE POLICY "Members can read own org badge requests" ON badge_requests FOR SELECT TO authenticated USING (organization_id IN (SELECT public.user_organization_ids()) OR public.is_staff_user());
CREATE POLICY "Members can create badge requests for own org" ON badge_requests FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.user_organization_ids()) AND requested_by = auth.uid());
CREATE POLICY "Staff can update badge requests" ON badge_requests FOR UPDATE TO authenticated USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());
CREATE POLICY "Members can read own organization" ON organizations FOR SELECT TO authenticated USING (id IN (SELECT public.user_organization_ids()));
CREATE POLICY "Members can update own organization" ON organizations FOR UPDATE TO authenticated USING (id IN (SELECT public.user_organization_ids())) WITH CHECK (id IN (SELECT public.user_organization_ids()));
CREATE POLICY "Members can read own verification badges" ON verification_badges FOR SELECT TO authenticated USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY "Members can read own verification criteria" ON verification_criteria FOR SELECT TO authenticated USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY "Members can insert own verification criteria" ON verification_criteria FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY "Members can read own activity log" ON activity_log FOR SELECT TO authenticated USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY "Authenticated can create organization for signup" ON organizations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon CRM read organizations" ON organizations FOR SELECT TO anon USING (true);
CREATE POLICY "Anon CRM write organizations" ON organizations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon CRM update organizations" ON organizations FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon CRM contacts" ON contacts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon CRM verification_criteria" ON verification_criteria FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon CRM verification_badges" ON verification_badges FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon CRM activity_log" ON activity_log FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon CRM inquiries read" ON inquiry_submissions FOR SELECT TO anon USING (true);
CREATE POLICY "Anon CRM inquiries update" ON inquiry_submissions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon CRM blog" ON blog_posts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Staff read all badge requests" ON badge_requests FOR SELECT TO authenticated USING (public.is_staff_user());
