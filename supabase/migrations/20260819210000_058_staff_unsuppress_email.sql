-- Staff may resubscribe an address that opted out, bounced, or was blocked manually.
-- The suppression table has no RLS policies (service role + SECURITY DEFINER only);
-- these RPCs are the only browser-reachable path to undo a suppression.

CREATE OR REPLACE FUNCTION public.email_suppression_info(p_email text)
 RETURNS TABLE(reason text, detail text, suppressed_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.reason, s.detail, s.created_at AS suppressed_at
    FROM email_suppressions s
   WHERE s.email = lower(trim(p_email))
   LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unsuppress_email(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_email = '' THEN
    RETURN false;
  END IF;

  DELETE FROM email_suppressions WHERE email = v_email;
  RETURN FOUND;
END;
$function$
;

REVOKE ALL ON FUNCTION public.email_suppression_info(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unsuppress_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_suppression_info(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unsuppress_email(text) TO authenticated;
