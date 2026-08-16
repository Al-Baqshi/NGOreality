-- RESCUED FROM PRODUCTION 2026-08-07. This migration was applied to the live
-- project but had no source in git. Recovered verbatim from
-- supabase_migrations.schema_migrations (version 20260522135731) so that the
-- repository matches the database. Do not renumber: the version prefix is what
-- stops `supabase db push` re-applying it.
--
-- The statements were stored minified (one per line) and are reproduced as
-- recovered rather than reformatted, so this file is a faithful record of what
-- actually ran. git has 023_portal_notifications.sql, which created the tables
-- and the insert_portal_notification_* helpers; this is the trigger half that
-- was applied separately and never committed.

CREATE OR REPLACE FUNCTION public.handle_inquiry_submission_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN PERFORM public.insert_portal_notification_staff('inquiry_new', 'New inquiry: ' || NEW.organization_name, coalesce(NEW.message, '') || CASE WHEN NEW.email <> '' THEN E'\n' || NEW.email ELSE '' END, '/inquiries', NEW.organization_id, jsonb_build_object('inquiry_id', NEW.id, 'contact_name', NEW.contact_name)); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS on_inquiry_submission_created ON inquiry_submissions;
CREATE TRIGGER on_inquiry_submission_created AFTER INSERT ON inquiry_submissions FOR EACH ROW EXECUTE FUNCTION public.handle_inquiry_submission_insert();

CREATE OR REPLACE FUNCTION public.handle_ngo_setup_request_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_desc text; BEGIN v_desc := CASE WHEN NEW.wants_landing_package THEN 'Setup request: landing + standards package' WHEN NEW.request_kind = 'brand_assets' THEN 'Setup request: brand assets (logo / colours)' ELSE 'Setup request: NGO portal' END; IF NEW.notes <> '' THEN v_desc := v_desc || ' — ' || left(NEW.notes, 200); END IF; PERFORM public.notify_staff_system(NEW.organization_id, 'ngo_setup_request', v_desc); PERFORM public.insert_portal_notification_ngo(NEW.organization_id, 'setup_request_submitted', 'Setup request received', 'Our team will review your request and follow up by email.', '/ngo/setup-request', jsonb_build_object('setup_request_id', NEW.id)); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.handle_ngo_setup_request_status_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF; PERFORM public.insert_portal_notification_ngo(NEW.organization_id, 'setup_request_updated', 'Setup request: ' || replace(NEW.status, '_', ' '), 'Your setup request status was updated by the NGOreality team.', '/ngo/setup-request', jsonb_build_object('setup_request_id', NEW.id, 'status', NEW.status)); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS on_ngo_setup_request_status_change ON ngo_setup_requests;
CREATE TRIGGER on_ngo_setup_request_status_change AFTER UPDATE OF status ON ngo_setup_requests FOR EACH ROW EXECUTE FUNCTION public.handle_ngo_setup_request_status_change();

CREATE OR REPLACE FUNCTION public.handle_badge_request_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_org_name text; BEGIN SELECT name INTO v_org_name FROM organizations WHERE id = NEW.organization_id; IF NEW.status = 'pending' THEN PERFORM public.insert_portal_notification_staff('badge_request', 'Badge request: ' || COALESCE(v_org_name, 'Organization'), NEW.request_type || coalesce(' — ' || nullif(NEW.notes, ''), ''), '/organizations/' || NEW.organization_id::text, NEW.organization_id, jsonb_build_object('badge_request_id', NEW.id)); END IF; PERFORM public.insert_portal_notification_ngo(NEW.organization_id, 'badge_request_submitted', 'Request submitted', 'Your ' || replace(NEW.request_type, '_', ' ') || ' request is with our team for review.', '/ngo/requests', jsonb_build_object('badge_request_id', NEW.id)); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS on_badge_request_created ON badge_requests;
CREATE TRIGGER on_badge_request_created AFTER INSERT ON badge_requests FOR EACH ROW EXECUTE FUNCTION public.handle_badge_request_insert();

CREATE OR REPLACE FUNCTION public.handle_badge_request_status_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF; PERFORM public.insert_portal_notification_ngo(NEW.organization_id, 'badge_request_updated', 'Request update: ' || replace(NEW.status, '_', ' '), 'Your badge or renewal request status changed to ' || NEW.status || '.', '/ngo/requests', jsonb_build_object('badge_request_id', NEW.id, 'status', NEW.status)); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS on_badge_request_status_change ON badge_requests;
CREATE TRIGGER on_badge_request_status_change AFTER UPDATE OF status ON badge_requests FOR EACH ROW EXECUTE FUNCTION public.handle_badge_request_status_change();

CREATE OR REPLACE FUNCTION public.handle_membership_insert_ngo_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN PERFORM public.insert_portal_notification_ngo(NEW.organization_id, 'membership_updated', 'Membership on file', 'A membership period was recorded for your organisation. Check renewal dates in the portal.', '/ngo/membership', jsonb_build_object('membership_id', NEW.id, 'status', NEW.status)); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS on_membership_insert_notify ON organization_memberships;
CREATE TRIGGER on_membership_insert_notify AFTER INSERT ON organization_memberships FOR EACH ROW EXECUTE FUNCTION public.handle_membership_insert_ngo_notify();

CREATE OR REPLACE FUNCTION public.handle_verification_criterion_update_ngo_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF; PERFORM public.insert_portal_notification_ngo(NEW.organization_id, 'standards_updated', 'Trust standard updated', NEW.criterion_label || ' is now marked ' || NEW.status || '.', '/ngo/standards', jsonb_build_object('criterion_id', NEW.id, 'status', NEW.status)); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS on_criterion_status_change_notify ON verification_criteria;
CREATE TRIGGER on_criterion_status_change_notify AFTER UPDATE OF status ON verification_criteria FOR EACH ROW EXECUTE FUNCTION public.handle_verification_criterion_update_ngo_notify();

CREATE OR REPLACE FUNCTION public.handle_verification_criterion_update_staff_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF; PERFORM public.notify_staff_system(NEW.organization_id, 'standards_updated', NEW.criterion_label || ' changed to ' || NEW.status || ' for ' || (SELECT name FROM organizations WHERE id = NEW.organization_id) || '.', '/organizations/' || NEW.organization_id::text); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS on_criterion_status_change_staff_notify ON verification_criteria;
CREATE TRIGGER on_criterion_status_change_staff_notify AFTER UPDATE OF status ON verification_criteria FOR EACH ROW EXECUTE FUNCTION public.handle_verification_criterion_update_staff_notify();
