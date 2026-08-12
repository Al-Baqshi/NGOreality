/*
  # Registry imports & listed organizations

  - `listed` status: imported from official registers, public on directory, not NGOreality verified
  - Registry provenance + outreach tracking for staff CRM
  - Link inquiries to an existing organization (claim / verify flow)
*/

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS source_registry text DEFAULT '',
  ADD COLUMN IF NOT EXISTS external_id text DEFAULT '',
  ADD COLUMN IF NOT EXISTS registry_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS charity_registration_number text DEFAULT '',
  ADD COLUMN IF NOT EXISTS nzbn text DEFAULT '',
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS outreach_status text NOT NULL DEFAULT 'not_contacted';

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_outreach_status_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_outreach_status_check
  CHECK (outreach_status IN ('not_contacted', 'contacted', 'responded', 'declined', 'not_applicable'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_registry_external
  ON organizations (source_registry, external_id)
  WHERE source_registry <> '' AND external_id <> '';

CREATE INDEX IF NOT EXISTS idx_organizations_listed_outreach
  ON organizations (status, outreach_status)
  WHERE status = 'listed';

ALTER TABLE inquiry_submissions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inquiry_submissions_organization_id
  ON inquiry_submissions (organization_id);

-- Public directory: listed (registry) + NGOreality verified
DROP POLICY IF EXISTS "Public can read verified organizations" ON organizations;

CREATE POLICY "Public can read directory organizations"
  ON organizations FOR SELECT
  TO anon
  USING (status IN ('listed', 'verified', 'active'));
