/*
  # Staff is no longer something you can grant yourself

  THE HOLE THIS CLOSES

  `authenticated` (and `anon`) held column-level UPDATE on public.profiles, and
  the policy "Users can update own profile" permits updating your own row. RLS
  restricts ROWS, not COLUMNS — so "you may edit your own profile" silently
  included "you may set your own is_staff".

      PATCH /rest/v1/profiles?id=eq.<my-own-id>
      apikey: <the anon key from the public JS bundle>
      {"is_staff": true}

  is_staff_user() gates 28 of the 57 live policies, so that one request granted:
  every organisation record, badge issuance, the money tables, every user's
  email, the blog, and the company's own financial planning tables. Migration
  028's header says "the badge's only value is that it cannot be self-awarded";
  this made it self-awardable in a single call.

  It has never been exploited — there are 3 accounts and 1 staff member — but it
  becomes a one-line exploit the moment public signup opens.

  THE FIX

  Authorization stops living in a table the subject can write.

  public.staff_members is the source of truth. It has RLS enabled and NO
  policies, and every grant is revoked, so PostgREST cannot reach it at all:
  there is no code path from a browser to this table, which is the property
  profiles.is_staff never had. Only SECURITY DEFINER functions (running as the
  owner) and the service role can see it.

  profiles.is_staff survives as a READ-ONLY MIRROR, because the SPA reads it to
  decide which nav to render. It is deliberately not load-bearing: is_staff_user()
  reads staff_members, so tampering with the mirror changes what a compromised
  client draws on screen and grants nothing. Two independent guards keep it
  honest anyway — column privileges revoked, and a trigger — because a future
  `GRANT ALL ON profiles` would silently undo the first on its own.

  Granting staff is now a service-role or SQL operation that leaves an audit row.
  There is no self-serve path, by design.
*/

-- ---------------------------------------------------------------------------
-- 1. The source of truth
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_members (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by text NOT NULL DEFAULT 'migration',
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  note       text NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.staff_members IS
  'Who is NGOreality staff. Deny-by-default: RLS on, zero policies, zero grants. Reachable only from SECURITY DEFINER functions and the service role. Never expose this over PostgREST.';

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- No policies are created on purpose. RLS with no policy denies everything,
-- and the revoke below means PostgREST will not even list the table.
REVOKE ALL ON TABLE public.staff_members FROM PUBLIC, anon, authenticated;

-- Carry the existing staff across before anything starts reading the new table,
-- or the one staff account loses the CRM mid-migration.
INSERT INTO public.staff_members (user_id, granted_by, note)
SELECT p.id, 'migration:040', 'Backfilled from profiles.is_staff'
  FROM public.profiles p
 WHERE p.is_staff
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Authorization reads the protected table, not the mirror
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_staff_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_members
     WHERE user_id = auth.uid()
       AND revoked_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.is_staff_user() IS
  'Reads staff_members, never profiles.is_staff. The latter is a display mirror the user could once write.';

-- 030b revoked default EXECUTE; this function is referenced inside 28 policies,
-- and policy evaluation fails without it.
GRANT EXECUTE ON FUNCTION public.is_staff_user() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Keep the mirror in step
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_profile_staff_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
     SET is_staff = EXISTS (
           SELECT 1 FROM staff_members s
            WHERE s.user_id = profiles.id AND s.revoked_at IS NULL)
   WHERE id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_members_sync_mirror ON public.staff_members;
CREATE TRIGGER trg_staff_members_sync_mirror
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_staff_mirror();

-- ---------------------------------------------------------------------------
-- 4. Two independent guards on the mirror
-- ---------------------------------------------------------------------------

-- (a) Column privileges. anon has no business on this table at all — the public
--     site never reads profiles, and claim_organization reads it as SECURITY
--     DEFINER, so it is unaffected.
--
--     NOTE: the second statement below is a NO-OP and 041 is the real fix.
--     Postgres will not carve a column out of a TABLE-level grant, and
--     `authenticated` held UPDATE/INSERT on the whole table. Kept as applied.
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE UPDATE (is_staff), INSERT (is_staff) ON public.profiles FROM authenticated;

-- (b) A trigger, because a future `GRANT ALL ON profiles TO authenticated` would
--     quietly undo (a) and nothing would fail loudly. auth.uid() IS NULL means
--     the service role, a migration, or a SECURITY DEFINER function — those are
--     the paths allowed to move it. Anyone holding a session is not.
CREATE OR REPLACE FUNCTION public.guard_profile_is_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND coalesce(NEW.is_staff, false) THEN
    RAISE EXCEPTION 'is_staff cannot be set by the account it applies to'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.is_staff IS DISTINCT FROM OLD.is_staff THEN
    RAISE EXCEPTION 'is_staff is managed in staff_members and cannot be changed here'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_is_staff ON public.profiles;
CREATE TRIGGER trg_profiles_guard_is_staff
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_is_staff();

REVOKE ALL ON FUNCTION public.sync_profile_staff_mirror() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_is_staff() FROM PUBLIC, anon, authenticated;
