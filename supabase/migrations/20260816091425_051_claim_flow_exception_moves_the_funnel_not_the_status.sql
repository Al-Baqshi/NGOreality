-- Follow-on to 050. guard_organization_trust_columns() carved out an exception
-- for the claim flow written against the delisting behaviour: it permitted a
-- non-staff caller to move status 'listed' -> 'onboarding'. Now that claiming
-- must not touch status, that exception is both wrong and wider than needed --
-- it was the only path by which a non-staff caller could change `status` at all.
--
-- Replaced with a strictly tighter rule: during a claim, onboarding_stage may
-- move and every other guarded column, status included, must be identical.

CREATE OR REPLACE FUNCTION public.guard_organization_trust_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- service role / migration / background job
  END IF;

  IF public.is_staff_user() THEN
    RETURN NEW;
  END IF;

  -- The claim RPC enters a listed org into the onboarding funnel. It changes
  -- the funnel and nothing else: the organisation stays exactly as public as
  -- it was, which is the whole point of migration 050.
  IF current_setting('ngoreality.claim_flow', true) = 'on'
     AND OLD.status = 'listed'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.verification_level IS NOT DISTINCT FROM OLD.verification_level
     AND NEW.is_customer IS NOT DISTINCT FROM OLD.is_customer
     AND NEW.source_registry IS NOT DISTINCT FROM OLD.source_registry
     AND NEW.external_id IS NOT DISTINCT FROM OLD.external_id
     AND NEW.charity_registration_number IS NOT DISTINCT FROM OLD.charity_registration_number
     AND NEW.nzbn IS NOT DISTINCT FROM OLD.nzbn
  THEN
    RETURN NEW;
  END IF;

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
$function$
;
