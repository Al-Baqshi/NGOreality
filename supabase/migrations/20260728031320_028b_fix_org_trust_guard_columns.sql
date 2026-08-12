-- RESCUED FROM PRODUCTION 2026-08-07. This migration was applied to the live
-- project but had no source in git. Recovered verbatim from
-- supabase_migrations.schema_migrations (version 20260728031320) so that the
-- repository matches the database. Do not renumber: the version prefix is what
-- stops `supabase db push` re-applying it.

-- Fix for the guard added in 028.
--
-- Two defects, both found by the next migration failing rather than by review:
--
-- 1. It referenced organizations.verified_at, which does not exist. The trigger
--    therefore raised 42703 on EVERY non-staff UPDATE — including an NGO
--    editing its own profile, and including plain data migrations.
-- 2. It treated "not a staff user" as "an end user", but auth.uid() is NULL for
--    the service role, migrations and background jobs. Those must pass through;
--    they are not the thing being guarded against.

CREATE OR REPLACE FUNCTION public.guard_organization_trust_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No end-user context: service role, migration, or background job. RLS did
  -- not gate this write, so neither should the guard.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_staff_user() THEN
    RETURN NEW;
  END IF;

  -- Columns that decide whether the public should trust this charity, plus the
  -- registry identifiers that tie it to the official Charities Register.
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.verification_level IS DISTINCT FROM OLD.verification_level
     OR NEW.onboarding_stage IS DISTINCT FROM OLD.onboarding_stage
     OR NEW.is_customer IS DISTINCT FROM OLD.is_customer
     OR NEW.source_registry IS DISTINCT FROM OLD.source_registry
     OR NEW.external_id IS DISTINCT FROM OLD.external_id
     OR NEW.charity_registration_number IS DISTINCT FROM OLD.charity_registration_number
     OR NEW.nzbn IS DISTINCT FROM OLD.nzbn
  THEN
    RAISE EXCEPTION
      'Only NGOreality staff can change verification status or registry identifiers'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;
