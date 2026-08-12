/*
  In-app notification feed (staff CRM + NGO portal).
  Separate from notification_events (outbound email queue).
*/

CREATE TABLE IF NOT EXISTS portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL CHECK (audience IN ('staff', 'ngo')),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link_path text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_staff_feed
  ON portal_notifications (created_at DESC)
  WHERE audience = 'staff';

CREATE INDEX IF NOT EXISTS idx_portal_notifications_ngo_feed
  ON portal_notifications (organization_id, created_at DESC)
  WHERE audience = 'ngo';

CREATE INDEX IF NOT EXISTS idx_portal_notifications_staff_unread
  ON portal_notifications (created_at DESC)
  WHERE audience = 'staff' AND read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_portal_notifications_ngo_unread
  ON portal_notifications (organization_id, created_at DESC)
  WHERE audience = 'ngo' AND read_at IS NULL;

ALTER TABLE portal_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read portal notifications"
  ON portal_notifications FOR SELECT
  TO authenticated
  USING (audience = 'staff' AND public.is_staff_user());

CREATE POLICY "Staff update portal notifications"
  ON portal_notifications FOR UPDATE
  TO authenticated
  USING (audience = 'staff' AND public.is_staff_user())
  WITH CHECK (audience = 'staff' AND public.is_staff_user());

CREATE POLICY "Members read org portal notifications"
  ON portal_notifications FOR SELECT
  TO authenticated
  USING (
    audience = 'ngo'
    AND organization_id IN (SELECT public.user_organization_ids())
  );

CREATE POLICY "Members update org portal notifications"
  ON portal_notifications FOR UPDATE
  TO authenticated
  USING (
    audience = 'ngo'
    AND organization_id IN (SELECT public.user_organization_ids())
  )
  WITH CHECK (
    audience = 'ngo'
    AND organization_id IN (SELECT public.user_organization_ids())
  );

CREATE OR REPLACE FUNCTION public.insert_portal_notification_staff(
  p_event_type text,
  p_title text,
  p_body text,
  p_link_path text,
  p_organization_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO portal_notifications (
    audience, organization_id, event_type, title, body, link_path, metadata
  ) VALUES (
    'staff', p_organization_id, p_event_type, p_title, left(coalesce(p_body, ''), 500), p_link_path, p_metadata
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_portal_notification_ngo(
  p_organization_id uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_link_path text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO portal_notifications (
    audience, organization_id, event_type, title, body, link_path, metadata
  ) VALUES (
    'ngo', p_organization_id, p_event_type, p_title, left(coalesce(p_body, ''), 500), p_link_path, p_metadata
  );
END;
$$;

-- Extend staff portal RPC to also create an in-app alert
CREATE OR REPLACE FUNCTION public.notify_staff_ngo_portal_event(
  p_organization_id uuid,
  p_action text,
  p_description text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_organization_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a member of this organization';
  END IF;

  SELECT name INTO v_org_name FROM organizations WHERE id = p_organization_id;

  INSERT INTO activity_log (organization_id, action, description, performed_by)
  VALUES (p_organization_id, p_action, p_description, 'ngo_portal');

  INSERT INTO staff_tasks (organization_id, title, task_type, notes, due_date)
  VALUES (
    p_organization_id,
    COALESCE(v_org_name, 'Organization') || ' — ' || p_action,
    'review',
    p_description,
    current_date
  );

  PERFORM public.insert_portal_notification_staff(
    p_action,
    COALESCE(v_org_name, 'Organization') || ': ' || p_action,
    p_description,
    '/organizations/' || p_organization_id::text,
    p_organization_id,
    jsonb_build_object('action', p_action)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_inquiry_submission_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.insert_portal_notification_staff(
    'inquiry_new',
    'New inquiry: ' || NEW.organization_name,
    coalesce(NEW.message, '') || CASE WHEN NEW.email <> '' THEN E'\n' || NEW.email ELSE '' END,
    '/inquiries',
    NEW.organization_id,
    jsonb_build_object('inquiry_id', NEW.id, 'contact_name', NEW.contact_name)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_inquiry_submission_created ON inquiry_submissions;
CREATE TRIGGER on_inquiry_submission_created
  AFTER INSERT ON inquiry_submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_inquiry_submission_insert();

CREATE OR REPLACE FUNCTION public.notify_staff_system(
  p_organization_id uuid,
  p_action text,
  p_description text,
  p_link_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_name text;
  v_link text;
BEGIN
  SELECT name INTO v_org_name FROM organizations WHERE id = p_organization_id;
  v_link := coalesce(nullif(p_link_path, ''), '/organizations/' || p_organization_id::text);

  INSERT INTO activity_log (organization_id, action, description, performed_by)
  VALUES (p_organization_id, p_action, p_description, 'system');

  INSERT INTO staff_tasks (organization_id, title, task_type, notes, due_date)
  VALUES (
    p_organization_id,
    COALESCE(v_org_name, 'Organization') || ' — ' || p_action,
    'review',
    p_description,
    current_date
  );

  PERFORM public.insert_portal_notification_staff(
    p_action,
    COALESCE(v_org_name, 'Organization') || ': ' || p_action,
    p_description,
    v_link,
    p_organization_id,
    jsonb_build_object('action', p_action)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_ngo_setup_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desc text;
BEGIN
  v_desc := CASE
    WHEN NEW.wants_landing_package THEN 'Setup request: landing + standards package'
    WHEN NEW.request_kind = 'brand_assets' THEN 'Setup request: brand assets (logo / colours)'
    ELSE 'Setup request: NGO portal'
  END;

  IF NEW.notes <> '' THEN
    v_desc := v_desc || ' — ' || left(NEW.notes, 200);
  END IF;

  PERFORM public.notify_staff_system(NEW.organization_id, 'ngo_setup_request', v_desc);

  PERFORM public.insert_portal_notification_ngo(
    NEW.organization_id,
    'setup_request_submitted',
    'Setup request received',
    'Our team will review your request and follow up by email.',
    '/ngo/setup-request',
    jsonb_build_object('setup_request_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_ngo_setup_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  PERFORM public.insert_portal_notification_ngo(
    NEW.organization_id,
    'setup_request_updated',
    'Setup request: ' || replace(NEW.status, '_', ' '),
    'Your setup request status was updated by the NGOreality team.',
    '/ngo/setup-request',
    jsonb_build_object('setup_request_id', NEW.id, 'status', NEW.status)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_ngo_setup_request_status_change ON ngo_setup_requests;
CREATE TRIGGER on_ngo_setup_request_status_change
  AFTER UPDATE OF status ON ngo_setup_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_ngo_setup_request_status_change();

CREATE OR REPLACE FUNCTION public.handle_badge_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_name text;
BEGIN
  SELECT name INTO v_org_name FROM organizations WHERE id = NEW.organization_id;

  IF NEW.status = 'pending' THEN
    PERFORM public.insert_portal_notification_staff(
      'badge_request',
      'Badge request: ' || COALESCE(v_org_name, 'Organization'),
      NEW.request_type || coalesce(' — ' || nullif(NEW.notes, ''), ''),
      '/organizations/' || NEW.organization_id::text,
      NEW.organization_id,
      jsonb_build_object('badge_request_id', NEW.id)
    );
  END IF;

  PERFORM public.insert_portal_notification_ngo(
    NEW.organization_id,
    'badge_request_submitted',
    'Request submitted',
    'Your ' || replace(NEW.request_type, '_', ' ') || ' request is with our team for review.',
    '/ngo/requests',
    jsonb_build_object('badge_request_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_badge_request_created ON badge_requests;
CREATE TRIGGER on_badge_request_created
  AFTER INSERT ON badge_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_badge_request_insert();

CREATE OR REPLACE FUNCTION public.handle_badge_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  PERFORM public.insert_portal_notification_ngo(
    NEW.organization_id,
    'badge_request_updated',
    'Request update: ' || replace(NEW.status, '_', ' '),
    'Your badge or renewal request status changed to ' || NEW.status || '.',
    '/ngo/requests',
    jsonb_build_object('badge_request_id', NEW.id, 'status', NEW.status)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_badge_request_status_change ON badge_requests;
CREATE TRIGGER on_badge_request_status_change
  AFTER UPDATE OF status ON badge_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_badge_request_status_change();

CREATE OR REPLACE FUNCTION public.handle_membership_insert_ngo_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.insert_portal_notification_ngo(
    NEW.organization_id,
    'membership_updated',
    'Membership on file',
    'A membership period was recorded for your organisation. Check renewal dates in the portal.',
    '/ngo/membership',
    jsonb_build_object('membership_id', NEW.id, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_membership_insert_notify ON organization_memberships;
CREATE TRIGGER on_membership_insert_notify
  AFTER INSERT ON organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.handle_membership_insert_ngo_notify();

CREATE OR REPLACE FUNCTION public.handle_verification_criterion_update_ngo_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  PERFORM public.insert_portal_notification_ngo(
    NEW.organization_id,
    'standards_updated',
    'Trust standard updated',
    NEW.criterion_label || ' is now marked ' || NEW.status || '.',
    '/ngo/standards',
    jsonb_build_object('criterion_id', NEW.id, 'status', NEW.status)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_criterion_status_change_notify ON verification_criteria;
CREATE TRIGGER on_criterion_status_change_notify
  AFTER UPDATE OF status ON verification_criteria
  FOR EACH ROW EXECUTE FUNCTION public.handle_verification_criterion_update_ngo_notify();
