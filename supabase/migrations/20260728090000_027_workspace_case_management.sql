/*
  # 027 — SUPERSEDED. Do not apply.

  This migration originally created workspace_* tables (clients, cases, notes,
  sessions, consents, documents, audit log) inside Supabase for beneficiary
  case management.

  That responsibility moved to the dedicated Go CRM service on Railway, which
  holds beneficiary records in its OWN Postgres using schema-per-tenant — see
  docs/CRM_SAAS.md. Keeping a second, unused copy of those tables in Supabase
  would be worse than useless: it would be an empty schema that looks
  authoritative, next to a public directory, tempting a future writer to use it.

  It was never applied to the live project (which was at 024 when this was
  written), so nothing is being dropped here — it is simply not created.

  The one part of 027 that mattered was security hardening of
  organization_members, which closed a privilege-escalation path into any of
  the ~29,000 imported charities. That has been carried into migration 028,
  which IS applied.
*/

-- Intentionally empty.
SELECT 1;
