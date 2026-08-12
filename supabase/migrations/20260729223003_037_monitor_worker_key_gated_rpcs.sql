-- RESCUED FROM PRODUCTION 2026-08-07. This migration was applied to the live
-- project but had no source in git — which meant the credential check for the
-- Railway monitor worker existed only inside the database. Recovered verbatim
-- from supabase_migrations.schema_migrations (version 20260729223003). Do not
-- renumber: the version prefix is what stops `supabase db push` re-applying it.
--
-- The value stored below is a SHA-256 digest, not the key. The key itself is
-- MONITOR_WORKER_KEY in the monitor-worker service environment on Railway.

-- Let an external monitoring worker read and write monitor state WITHOUT a
-- Postgres superuser connection string.
--
-- Why this exists: the monitoring worker has to run somewhere with reliable
-- outbound HTTP (Supabase Edge Functions cannot do it — proven: sites that
-- return 200 from an ordinary host time out there). Railway can. But the
-- standard way to give a Railway worker access to Supabase is DATABASE_URL,
-- and Supabase never exposes the database password through its API — it can
-- only be reset in the dashboard.
--
-- So instead of a credential that can run any SQL as the database owner, the
-- worker gets a key that can call exactly two functions. That is a better
-- security posture than the "normal" approach, not a workaround for a missing
-- one: a compromised monitoring worker can record check results and nothing
-- else. It cannot read a member's beneficiary data, cannot issue a badge,
-- cannot touch payments.

CREATE TABLE IF NOT EXISTS platform_worker_keys (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  key_sha256 text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_worker_keys ENABLE ROW LEVEL SECURITY;
-- No policies at all: unreachable via PostgREST by anyone. Only the
-- SECURITY DEFINER functions below can read it.
REVOKE ALL ON TABLE platform_worker_keys FROM PUBLIC, anon, authenticated;

-- Only the hash is stored. The key itself lives in the worker's environment.
INSERT INTO platform_worker_keys (name, key_sha256)
VALUES ('monitor-worker', 'd8ee1e22e7a1f6bd3b497a56bf6d97cf451578c765e98b3b89e8beb75b22f482')
ON CONFLICT (name) DO UPDATE
  SET key_sha256 = EXCLUDED.key_sha256, active = true;

CREATE OR REPLACE FUNCTION public.verify_worker_key(p_key text, p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ok boolean;
BEGIN
  SELECT true INTO ok
    FROM platform_worker_keys
   WHERE name = p_name
     AND active
     AND key_sha256 = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');

  IF ok THEN
    UPDATE platform_worker_keys SET last_used_at = now() WHERE name = p_name;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_worker_key(text, text) FROM PUBLIC, anon, authenticated;

-- Fetch the monitors due for a check. Paying members first.
CREATE OR REPLACE FUNCTION public.monitor_fetch_due(p_key text, p_limit integer DEFAULT 50)
RETURNS TABLE (
  organization_id uuid,
  url text,
  tier text,
  consecutive_failures integer,
  last_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.verify_worker_key(p_key, 'monitor-worker') THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT m.organization_id, m.url, m.tier, m.consecutive_failures, m.last_status
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
   LIMIT greatest(coalesce(p_limit, 50), 1);
END;
$$;

-- Record one check. Delegates to the existing incident/alert logic.
CREATE OR REPLACE FUNCTION public.monitor_record(
  p_key text,
  p_organization_id uuid,
  p_status text,
  p_status_code integer,
  p_latency_ms integer,
  p_error text,
  p_consecutive_failures integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.verify_worker_key(p_key, 'monitor-worker') THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public.record_monitor_check(
    p_organization_id, p_status, p_status_code, p_latency_ms,
    p_error, p_consecutive_failures, 2
  );
END;
$$;

-- These two are the ONLY things the worker key can reach, and they are the only
-- functions here granted to anon. Without a valid key they raise immediately.
REVOKE ALL ON FUNCTION public.monitor_fetch_due(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_record(text, uuid, text, integer, integer, text, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.monitor_fetch_due(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.monitor_record(text, uuid, text, integer, integer, text, integer) TO anon;
