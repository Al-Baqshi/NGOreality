/*
  # REVENUE LEAK — any NGO could grant itself a free membership

  Applied to the live project on 2026-07-28.

  Migration 006 shipped:

    CREATE POLICY "Members can insert membership for own org"
      ON organization_memberships FOR INSERT TO authenticated
      WITH CHECK (organization_id IN (SELECT user_organization_ids())
                  OR is_staff_user());

  organization_memberships is what has_active_membership() reads, which drives
  badge eligibility, paid_live monitoring cadence and the member-only checklist.
  So any signed-in NGO user could POST one row to
  /rest/v1/organization_memberships with status='active' and expires_at a year
  out, and receive the entire $70/year product for nothing.

  There is no legitimate caller. Membership is activated in
  src/lib/membershipBenefits.ts, reached only from
  src/components/crm/OrganizationPayments.tsx — the STAFF CRM, after a payment
  is recorded. No NGO-facing code path inserts a membership or a payment.

  Members keep SELECT on both tables: they need to see their expiry date and
  their NGR- payment reference.
*/

DROP POLICY IF EXISTS "Members can insert membership for own org" ON organization_memberships;

DROP POLICY IF EXISTS "Staff manage organization memberships" ON organization_memberships;
CREATE POLICY "Staff manage organization memberships"
  ON organization_memberships FOR ALL TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "Members can insert own organization payments" ON organization_payments;
DROP POLICY IF EXISTS "Members insert own organization payments" ON organization_payments;

DROP POLICY IF EXISTS "Staff manage organization payments" ON organization_payments;
CREATE POLICY "Staff manage organization payments"
  ON organization_payments FOR ALL TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());
