/*
  # Outreach v2: campaign columns + outreach email templates

  - cold_email, no_website, website_issues kanban lanes
  - notification_events templates for bulk CRM outreach
*/

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_outreach_status_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_outreach_status_check
  CHECK (outreach_status IN (
    'not_contacted',
    'cold_email',
    'no_website',
    'website_issues',
    'contacted',
    'follow_up',
    'registered',
    'responded',
    'declined',
    'not_applicable'
  ));

ALTER TABLE notification_events
  DROP CONSTRAINT IF EXISTS notification_events_template_check;

ALTER TABLE notification_events
  ADD CONSTRAINT notification_events_template_check
  CHECK (template IN (
    'site_down',
    'badge_issued',
    'membership_welcome',
    'outreach_cold_invite',
    'outreach_no_website',
    'outreach_website_help'
  ));

CREATE INDEX IF NOT EXISTS idx_notification_events_org_template
  ON notification_events (organization_id, template, created_at DESC);

COMMENT ON COLUMN organizations.outreach_status IS
  'Lead pipeline: not_contacted → cold_email / no_website / website_issues → contacted → follow_up → registered (inbound) or declined';
