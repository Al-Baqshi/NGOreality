-- Per-tenant CRM schema.
--
-- Every statement is UNQUALIFIED on purpose. The migration runner sets
-- `search_path` to the tenant's schema for the transaction, so the same SQL
-- creates an isolated copy of these tables inside tenant_<slug>. Nothing here
-- interpolates a schema name, so a tenant slug can never reach the SQL text.
--
-- There is no tenant_id column anywhere: tenancy IS the schema. Cross-tenant
-- access requires a wrong search_path, which is one narrow, tested code path
-- rather than a policy on every table.

-- Beneficiaries -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code text UNIQUE,
  given_name     text NOT NULL DEFAULT '',
  family_name    text NOT NULL DEFAULT '',
  preferred_name text,
  date_of_birth  date,
  contact_email  text,
  contact_phone  text,
  address_line1  text,
  address_line2  text,
  city           text,
  region         text,
  postcode       text,
  country        text,
  status         text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'inactive', 'closed')),
  custom         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(family_name, given_name);
CREATE INDEX IF NOT EXISTS idx_clients_created ON clients(created_at DESC);

-- Sensitive attributes: separate table so the API can withhold it by role
-- without ever selecting the columns.
CREATE TABLE IF NOT EXISTS client_sensitive (
  client_id       uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  ethnicity       text,
  iwi_affiliation text,
  gender          text,
  health_notes    text,
  legal_status    text,
  risk_flags      text[] NOT NULL DEFAULT '{}',
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Consent (Privacy Act 2020 — IPP3 / IPP11) ---------------------------------

CREATE TABLE IF NOT EXISTS consents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  purpose      text NOT NULL,
  method       text NOT NULL DEFAULT 'verbal'
               CHECK (method IN ('verbal', 'written', 'digital')),
  evidence     text,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,
  withdrawn_at timestamptz,
  collected_by uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consents_client ON consents(client_id);

-- Cases ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  reference_code text UNIQUE,
  title          text NOT NULL DEFAULT '',
  service_type   text,
  status         text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'on_hold', 'closed')),
  priority       text NOT NULL DEFAULT 'normal'
                 CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to    uuid,
  opened_at      timestamptz NOT NULL DEFAULT now(),
  due_at         timestamptz,
  closed_at      timestamptz,
  closure_reason text,
  outcome        text,
  custom         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cases_client ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_assigned ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cases_due ON cases(due_at) WHERE status = 'open';

-- Case notes — append only. Enforced by a trigger rather than an RLS policy,
-- because within a tenant schema there is one database role.
CREATE TABLE IF NOT EXISTS case_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  author_id  uuid,
  body       text NOT NULL,
  visibility text NOT NULL DEFAULT 'team'
             CHECK (visibility IN ('team', 'restricted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_notes_case ON case_notes(case_id, created_at DESC);

/*
  Append-only, with one deliberate door.

  Notes can never be EDITED. That is the point of the table and it has no
  exception: a correction is a new note, so the record of what was believed at
  the time survives.

  DELETE is different, and treating it the same was a bug. clients -> cases ->
  case_notes all cascade, and this trigger fires on cascade-deleted rows, so
  "delete this client" raised restrict_violation for any client who had ever
  been written about — which is every real client. Erasure was impossible while
  docs/PRIVACY_AND_RESIDENCY.md promised it, and nothing tested it.

  So DELETE is permitted only inside a transaction that has explicitly declared
  itself an erasure by setting app.tenant_purge. Reusing the pattern
  guard_organization_trust_columns already uses for ngoreality.claim_flow: a
  local GUC is transaction-scoped, cannot be set by a PostgREST caller, and
  makes the intent legible in the code that performs the deletion rather than
  implicit in a cascade.

  This widens what a compromised service can destroy, and that is the honest
  trade: a Privacy Act erasure request must be answerable. It is narrowed by
  permitting DELETE only, never UPDATE — history cannot be quietly rewritten,
  only removed wholesale and deliberately.
*/
CREATE OR REPLACE FUNCTION reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.tenant_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'case_notes is append-only: notes cannot be edited, and deletion requires an explicit erasure (set app.tenant_purge)'
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_case_notes_no_update ON case_notes;
CREATE TRIGGER trg_case_notes_no_update
  BEFORE UPDATE OR DELETE ON case_notes
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- Service delivery ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  case_id          uuid REFERENCES cases(id) ON DELETE SET NULL,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  service_type     text,
  delivery_mode    text CHECK (delivery_mode IS NULL OR delivery_mode IN
                     ('in_person', 'phone', 'video', 'email', 'other')),
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  attendees        integer CHECK (attendees IS NULL OR attendees >= 0),
  outcome          text,
  notes            text,
  custom           jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_occurred ON sessions(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_client ON sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_sessions_case ON sessions(case_id);

-- Documents (object storage references) -------------------------------------

CREATE TABLE IF NOT EXISTS documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid REFERENCES clients(id) ON DELETE CASCADE,
  case_id      uuid REFERENCES cases(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  filename     text NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  sensitivity  text NOT NULL DEFAULT 'team'
               CHECK (sensitivity IN ('team', 'restricted')),
  uploaded_by  uuid,
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);

-- Customisation — the escape hatch, deliberately not a table builder --------

CREATE TABLE IF NOT EXISTS field_defs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity      text NOT NULL CHECK (entity IN ('client', 'case', 'session')),
  key         text NOT NULL,
  label       text NOT NULL,
  data_type   text NOT NULL DEFAULT 'text'
              CHECK (data_type IN ('text', 'long_text', 'number', 'date',
                                   'boolean', 'select', 'multi_select')),
  options     jsonb NOT NULL DEFAULT '[]'::jsonb,
  required    boolean NOT NULL DEFAULT false,
  sensitive   boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity, key)
);

CREATE INDEX IF NOT EXISTS idx_field_defs_entity ON field_defs(entity, sort_order);

-- Per-tenant service catalogue, so each NGO names its own programmes.
CREATE TABLE IF NOT EXISTS service_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL UNIQUE,
  label      text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Settings & audit ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
  id                      boolean PRIMARY KEY DEFAULT true CHECK (id),
  client_retention_months integer NOT NULL DEFAULT 84 CHECK (client_retention_months > 0),
  collection_notice       text NOT NULL DEFAULT '',
  case_reference_prefix   text NOT NULL DEFAULT 'CASE',
  branding                jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,
  entity_type text NOT NULL,
  entity_id   uuid,
  action      text NOT NULL
              CHECK (action IN ('create', 'read', 'update', 'delete', 'export', 'login')),
  diff        jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

DROP TRIGGER IF EXISTS trg_audit_no_update ON audit_log;
CREATE TRIGGER trg_audit_no_update
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- Shared updated_at triggers ------------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_updated ON clients;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_client_sensitive_updated ON client_sensitive;
CREATE TRIGGER trg_client_sensitive_updated BEFORE UPDATE ON client_sensitive
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_cases_updated ON cases;
CREATE TRIGGER trg_cases_updated BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_sessions_updated ON sessions;
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated ON settings;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
