/*
  NGO portal claim flow: authenticated users must search listed organizations
  and detect if an org already has a portal member before linking.
*/

CREATE POLICY "Authenticated can read listed orgs for claim search"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    status IN ('listed', 'verified', 'active')
    OR id IN (SELECT public.user_organization_ids())
    OR public.is_staff_user()
  );

CREATE POLICY "Authenticated can read members on directory orgs for claim guard"
  ON organization_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_staff_user()
    OR organization_id IN (
      SELECT id FROM organizations WHERE status IN ('listed', 'verified', 'active')
    )
  );
