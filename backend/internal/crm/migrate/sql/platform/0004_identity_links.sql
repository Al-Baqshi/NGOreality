-- Central identities: maps a subject from the central Baqshi auth service
-- (auth.baqshi.com) to the Supabase-era user id that workspace seats are
-- keyed by.
--
-- Rows are written by the CRM itself the first time a central token arrives
-- whose VERIFIED email matches exactly one seat-holder (auth/central.go).
-- Seats, roles and everything downstream keep the original user id — this
-- table only teaches the API that two subjects are one person.
CREATE TABLE IF NOT EXISTS platform.identity_links (
  central_subject text PRIMARY KEY,
  user_id         uuid NOT NULL,
  email           text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_links_user ON platform.identity_links(user_id);
