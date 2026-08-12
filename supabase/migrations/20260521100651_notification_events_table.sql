-- RESCUED FROM PRODUCTION during the A0 migration-history reconciliation.
-- Applied as version 20260521100651 with no source in git.
--
-- NOTE: this is the table the A6 email-compliance work extends — it has no
-- attempts column and no unsubscribe/suppression concept, which is why a 429
-- currently parks a row as 'pending' forever at the head of the queue.

CREATE TABLE IF NOT EXISTS notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  incident_id uuid REFERENCES website_incidents(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  template text NOT NULL DEFAULT 'site_down' CHECK (template IN ('site_down', 'badge_issued', 'membership_welcome')),
  recipient_email text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  sent_at timestamptz,
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_events_pending
  ON notification_events (status, created_at) WHERE status = 'pending';

ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage notification events" ON notification_events;
CREATE POLICY "Staff manage notification events" ON notification_events FOR ALL TO authenticated
  USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

-- Backfill monitor tiers from membership state.
UPDATE website_monitors wm
   SET tier = CASE
         WHEN public.has_active_membership(wm.organization_id) THEN 'paid_live'
         WHEN EXISTS (SELECT 1 FROM organizations o WHERE o.id = wm.organization_id AND o.status IN ('verified', 'active')) THEN 'active'
         ELSE 'passive'
       END,
       check_interval_minutes = CASE
         WHEN public.has_active_membership(wm.organization_id) THEN 60
         WHEN EXISTS (SELECT 1 FROM organizations o WHERE o.id = wm.organization_id AND o.status IN ('verified', 'active')) THEN 1440
         ELSE 10080
       END,
       updated_at = now();
