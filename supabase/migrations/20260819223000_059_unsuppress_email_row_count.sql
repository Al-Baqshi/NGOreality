-- Staff "Allow email again" treated a falsy RPC payload as failure, so a
-- successful delete still showed "not on the suppression list" and left the
-- queue row as suppressed. Return an integer row count (reliable over
-- PostgREST) and disable RLS inside the definer so the delete cannot be
-- silently filtered.
--
-- Postgres cannot CREATE OR REPLACE a function to change boolean → integer;
-- drop the 058 signature first.

DROP FUNCTION IF EXISTS public.unsuppress_email(text);

CREATE FUNCTION public.unsuppress_email(p_email text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_count integer;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_email = '' THEN
    RETURN 0;
  END IF;

  DELETE FROM email_suppressions WHERE email = v_email;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.unsuppress_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unsuppress_email(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.email_suppression_info(p_email text)
 RETURNS TABLE(reason text, detail text, suppressed_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
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
$function$;
