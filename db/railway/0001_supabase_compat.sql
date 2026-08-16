-- Landing zone on Railway for the schema currently living in Supabase.
--
-- Everything here exists to make the dumped `public` schema run unchanged. The
-- dump references exactly two things Supabase provides and a plain Postgres does
-- not: auth.uid(), and an auth.users table that five foreign keys point at and
-- six SECURITY DEFINER functions read an email from. Both are reproduced here,
-- so all 55 policies and 47 functions restore verbatim rather than being
-- rewritten during a migration — the rewrite is a separate, later decision.

BEGIN;

-- ---------------------------------------------------------------------------
-- Roles. PostgREST logs in as `authenticator` and assumes anon/authenticated
-- per request from the JWT's `role` claim, so the request never holds more
-- privilege than the caller does. service_role bypasses RLS and must never be
-- reachable from a browser.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- directory search GIN index depends on this

-- ---------------------------------------------------------------------------
-- auth compatibility
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

-- The local identity mirror. baqshi-auth is the issuer of record; this table
-- exists because the schema has foreign keys to it and reads `email` from it.
-- Rows are keyed by the token's `sub`, which baqshi-auth already mints as a
-- uuid — so a central subject drops straight in with no mapping table.
CREATE TABLE IF NOT EXISTS auth.users (
  id         uuid PRIMARY KEY,
  email      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Byte-for-byte the semantics Supabase gives these: read the verified claims
-- PostgREST puts in a GUC for the duration of the request. Anything that cannot
-- be parsed yields NULL, which every policy already treats as "not signed in".
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true)::json ->> 'role', ''), 'anon')
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- The five accounts the dumped rows point at. Test accounts, kept only so the
-- foreign keys restore; they carry no credential here — baqshi-auth holds those.
INSERT INTO auth.users (id, email) VALUES
  ('e6d6a126-67de-466d-a276-fc8731286ee5'::uuid, 'm.baqshi@ngoreality.com'),
  ('16263d4e-c351-4512-add8-b3089ac4d00a'::uuid, 'e2e-test-1785385656@ngoreality.com'),
  ('209dd887-cf8b-4f1c-9d77-f12ab174daa6'::uuid, 'bitregalo@gmail.com'),
  ('91722c34-faa8-4997-a293-cbf3f84b1a42'::uuid, 'm.baqshi@baqshi.com'),
  ('0beb1e1d-88f1-4e7b-a5e3-a54960993de0'::uuid, 'zahraasharifeh2003@gmail.com')
ON CONFLICT (id) DO NOTHING;

COMMIT;
