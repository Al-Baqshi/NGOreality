-- RESCUED FROM PRODUCTION during the A0 migration-history reconciliation.
-- Applied as version 20260516102634 with no source in git.
--
-- NOTE for the security work that follows: both policies below let a member
-- write rows that staff later read as fact — activity_log.performed_by is free
-- text, so a member can forge an entry attributed to staff. Revisited in A1.

CREATE POLICY "Members can insert own activity log" ON activity_log FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY "Members can insert own contacts" ON contacts FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
