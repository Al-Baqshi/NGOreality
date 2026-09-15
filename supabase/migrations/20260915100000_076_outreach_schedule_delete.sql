/*
  # Delete an outreach schedule

  Staff can permanently remove a schedule. Cancels held emails staged for queued
  roster rows; already-released (pending/sent) notifications are left unchanged.
*/

CREATE OR REPLACE FUNCTION public.outreach_schedule_delete(
  p_schedule_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sched public.outreach_schedules;
  v_held_cancelled integer := 0;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_sched FROM outreach_schedules WHERE id = p_schedule_id FOR UPDATE;
  IF v_sched.id IS NULL THEN
    RAISE EXCEPTION 'schedule not found';
  END IF;

  UPDATE notification_events ne
     SET status = 'skipped',
         error_message = format('Schedule deleted (%s)', v_sched.name),
         sent_at = null,
         claimed_at = null
    FROM outreach_schedule_recipients r
   WHERE r.schedule_id = p_schedule_id
     AND r.status = 'queued'
     AND ne.id = r.notification_event_id
     AND ne.status = 'held';

  GET DIAGNOSTICS v_held_cancelled = ROW_COUNT;

  DELETE FROM outreach_schedules WHERE id = p_schedule_id;

  RETURN jsonb_build_object(
    'deleted', true,
    'schedule_id', p_schedule_id,
    'held_cancelled', v_held_cancelled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_schedule_delete(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.outreach_schedule_delete(uuid)
  TO authenticated;
