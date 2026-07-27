/*
  # SECURITY FIX — an organisation could be silently re-claimed

  Migration 027 restricted self-claim to organisations with no members:

      CREATE POLICY "Users can claim an unclaimed organization"
        ON organization_members FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid() AND role = 'owner'
                    AND NOT public.organization_has_members(organization_id));

  `organization_has_members` asks "does this organisation have members RIGHT
  NOW", which is not the same question as "has this organisation ever been
  claimed". The two diverge because `organization_members.user_id` is
  `REFERENCES auth.users(id) ON DELETE CASCADE`: when an organisation's last
  portal user deletes their account, every membership row disappears and the
  organisation looks brand new again — while its CRM workspace, its schema and
  every beneficiary record survive untouched in the other database.

  That gave any authenticated user this path into another charity's client
  records:

    1. Wait for (or cause) org B to lose its last membership row.
    2. INSERT themselves as owner of org B — permitted by the policy above.
    3. Call the CRM's POST /v1/signup for org B. The workspace already exists,
       so the handler seated the caller on it.
    4. Read every client, case note and health record; export to CSV.

  Step 3 is fixed in the Go service (signup no longer grants seats on an
  existing workspace). This migration closes step 2, so the two fixes are
  independent — neither relies on the other holding.

  Fix: record when an organisation was first claimed and never allow a second
  self-claim. Re-attaching a user to a previously claimed organisation becomes
  a staff action, which is the correct escalation path for what is really an
  account-recovery request.
*/

-- ---------------------------------------------------------------------------
-- 1. Durable claim marker
-- ---------------------------------------------------------------------------

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

COMMENT ON COLUMN organizations.claimed_at IS
  'When this organisation was first claimed by a portal user. Never cleared, '
  'even if every membership row is later removed — clearing it would re-open '
  'self-claim on an organisation that already has a workspace and client data.';

-- Backfill: any organisation that currently has members has clearly been
-- claimed. Use the earliest membership as the claim time.
UPDATE organizations o
   SET claimed_at = m.first_joined
  FROM (
    SELECT organization_id, min(created_at) AS first_joined
      FROM organization_members
     GROUP BY organization_id
  ) m
 WHERE m.organization_id = o.id
   AND o.claimed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Stamp the marker on first claim
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_organization_claimed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE organizations
     SET claimed_at = COALESCE(claimed_at, now())
   WHERE id = NEW.organization_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_member_added ON organization_members;
CREATE TRIGGER on_organization_member_added
  AFTER INSERT ON organization_members
  FOR EACH ROW EXECUTE FUNCTION public.mark_organization_claimed();

-- ---------------------------------------------------------------------------
-- 3. Self-claim only for organisations that have NEVER been claimed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.organization_is_claimable(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizations
     WHERE id = p_org AND claimed_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM organization_members WHERE organization_id = p_org
  );
$$;

COMMENT ON FUNCTION public.organization_is_claimable IS
  'True only for an organisation that has never been claimed AND has no '
  'members. Both halves matter: claimed_at survives membership deletion, and '
  'the member check still guards the window before the trigger fires.';

DROP POLICY IF EXISTS "Users can claim an unclaimed organization" ON organization_members;

CREATE POLICY "Users can claim a never-claimed organization"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND public.organization_is_claimable(organization_id)
  );

-- `organization_has_members` is left in place: dropping it would break any
-- policy or query still referencing it. It is no longer used for claim checks.
COMMENT ON FUNCTION public.organization_has_members IS
  'DEPRECATED for claim checks — answers "has members now", which returns true '
  'again after an account deletion. Use organization_is_claimable instead.';
