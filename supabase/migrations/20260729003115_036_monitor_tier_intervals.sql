-- RESCUED FROM PRODUCTION 2026-08-07. This migration was applied to the live
-- project but had no source in git. Recovered verbatim from
-- supabase_migrations.schema_migrations (version 20260729003115) so that the
-- repository matches the database. Do not renumber: the version prefix is what
-- stops `supabase db push` re-applying it.

-- Give each tier an interval that matches what was actually promised.
--
-- Every monitor defaulted to check_interval_minutes = 60, so all ~14,700
-- registry organisations were permanently "due". That is 14,700 hourly checks
-- for organisations that are not customers, which no batch size can keep up
-- with, and it starves the handful of monitors that are actually paid for.
--
-- What is sold:
--   paid_live  members            "~daily checks", alerting  -> hourly is generous
--   active     verified, unpaid                              -> daily
--   passive    registry, outreach statistics only            -> weekly
--
-- Weekly for the passive bulk is honest: nobody is promised anything for those,
-- they exist so we can say what share of the sector has a working website.

UPDATE website_monitors SET check_interval_minutes = 60    WHERE tier = 'paid_live';
UPDATE website_monitors SET check_interval_minutes = 1440  WHERE tier = 'active';
UPDATE website_monitors SET check_interval_minutes = 10080 WHERE tier = 'passive';

ALTER TABLE website_monitors ALTER COLUMN check_interval_minutes SET DEFAULT 10080;

-- Paying members must never queue behind the registry backlog.
CREATE OR REPLACE FUNCTION public.monitors_due_for_check(p_limit integer DEFAULT 25)
RETURNS TABLE (
  organization_id uuid,
  url text,
  tier text,
  check_interval_minutes integer,
  consecutive_failures integer,
  last_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.organization_id, m.url, m.tier, m.check_interval_minutes,
         m.consecutive_failures, m.last_status
    FROM website_monitors m
   WHERE m.enabled
     AND coalesce(trim(m.url), '') <> ''
     AND m.url ~* '^https?://'
     AND (
       m.last_checked_at IS NULL
       OR m.last_checked_at < now() - make_interval(mins => greatest(m.check_interval_minutes, 5))
     )
   ORDER BY
     CASE m.tier WHEN 'paid_live' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
     m.last_checked_at ASC NULLS FIRST
   LIMIT greatest(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.monitors_due_for_check(integer) FROM PUBLIC, anon, authenticated;

SELECT tier, count(*), min(check_interval_minutes) AS interval_mins
  FROM website_monitors GROUP BY tier ORDER BY tier;
