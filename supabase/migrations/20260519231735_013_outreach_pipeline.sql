/*
  # Outreach pipeline: follow-up, registered (inbound), customers

  - follow_up: still in outreach, needs another touch
  - registered: inbound interest (off main kanban → Inbound queue)
  - is_customer: paying / active NGOreality relationship
*/

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_customer boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_organizations_customers
  ON organizations (is_customer)
  WHERE is_customer = true;

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_outreach_status_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_outreach_status_check
  CHECK (outreach_status IN (
    'not_contacted',
    'contacted',
    'follow_up',
    'registered',
    'responded',
    'declined',
    'not_applicable'
  ));

-- Legacy: responded → registered (inbound)
UPDATE organizations
SET outreach_status = 'registered'
WHERE outreach_status = 'responded';

COMMENT ON COLUMN organizations.is_customer IS 'True when org has become an NGOreality customer (onboarding or beyond)';
