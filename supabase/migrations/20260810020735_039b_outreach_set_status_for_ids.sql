-- Split out of 039 during the A0 migration-history reconciliation: production
-- recorded this as its own version (20260810020735), so git now mirrors that.
/*
  Explicit-id sibling of outreach_bulk_set_status. 

  Without this, a hand-ticked selection had to be expressed as "the whole filter
  minus everything I did not tick", which is only correct if the browser knows
  every matching row. It does not — it knows one page. Ticking three names on a
  page of a 14,482-row segment would have updated 14,479 organisations.
*/
CREATE OR REPLACE FUNCTION public.outreach_set_status_for_ids(
  p_new_status text,
  p_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   text;
  v_updated bigint;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_new_status IS NULL OR btrim(p_new_status) = '' THEN
    RAISE EXCEPTION 'a target outreach status is required';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('matched', 0, 'updated', 0, 'capped', false);
  END IF;

  IF array_length(p_ids, 1) > 25000 THEN
    RAISE EXCEPTION 'too many ids in one call (max 25000)';
  END IF;

  SELECT coalesce(nullif(u.email, ''), 'staff') INTO v_actor
    FROM auth.users u WHERE u.id = auth.uid();
  v_actor := coalesce(v_actor, 'staff');

  WITH upd AS (
    UPDATE organizations o
       SET outreach_status  = p_new_status,
           last_outreach_at = now()
     WHERE o.id = ANY (p_ids)
       AND o.outreach_status IS DISTINCT FROM p_new_status
    RETURNING o.id
  ),
  logged AS (
    INSERT INTO activity_log (organization_id, action, description, performed_by, metadata)
    SELECT u.id,
           'outreach_updated',
           format('Outreach set to %s', p_new_status),
           v_actor,
           jsonb_build_object('bulk', array_length(p_ids, 1) > 1, 'new_status', p_new_status)
      FROM upd u
    RETURNING organization_id
  )
  SELECT count(*) FROM logged INTO v_updated;

  RETURN jsonb_build_object(
    'matched', array_length(p_ids, 1),
    'updated', v_updated,
    'capped',  false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_set_status_for_ids(text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_set_status_for_ids(text, uuid[]) TO authenticated;
