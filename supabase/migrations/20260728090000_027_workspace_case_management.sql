/*
  # Organisation Workspace — beneficiary & case management (v1)

  Adds the tenant-facing case management module sold as
  "Organisation Workspace SaaS" ($25/mo admin + $15/user).

  Design rules (deliberate, see docs/PRIVACY_AND_RESIDENCY.md):

  1. Tenant = existing `organizations` row. Users = existing
     `organization_members`. No new tenancy concept, no `tenant_id`.
  2. NO `anon` policies. Migration 006 grants anon blanket access to the
     legacy CRM tables; beneficiary data must never be reachable that way.
  3. NO staff bypass. `is_staff_user()` does NOT grant access to any
     workspace table. NGOreality staff have no business reading a
     charity's client health notes — this is an IPP11 (disclosure)
     boundary, and it is enforced here rather than by policy documents.
  4. Sensitive attributes live in their own table (`workspace_client_sensitive`)
     with a tighter policy, instead of column-level RBAC — the browser
     talks to PostgREST directly and per-column policies are fragile.
  5. Case notes are append-only at the database level: SELECT + INSERT
     policies only, no UPDATE or DELETE policy.
  6. The audit log records reads and exports, not just writes.
*/

-- ---------------------------------------------------------------------------
-- 1a. Extend organization_members roles
-- ---------------------------------------------------------------------------

ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'admin', 'caseworker', 'volunteer', 'viewer'));

COMMENT ON COLUMN organization_members.role IS
  'owner/admin: full workspace incl. sensitive + settings. caseworker: full '
  'case work incl. sensitive. volunteer: non-sensitive read/write. '
  'viewer: non-sensitive read only.';

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so policies can read organization_members
-- without recursing through its own RLS). Defined before any policy uses them.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.workspace_role(p_org uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM organization_members
  WHERE user_id = auth.uid() AND organization_id = p_org
  LIMIT 1;
$$;

-- Any workspace access at all (read non-sensitive)
CREATE OR REPLACE FUNCTION public.workspace_can_read(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.workspace_role(p_org)
    IN ('owner', 'admin', 'caseworker', 'volunteer', 'viewer');
$$;

-- Create/update client + case data
CREATE OR REPLACE FUNCTION public.workspace_can_write(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.workspace_role(p_org)
    IN ('owner', 'admin', 'caseworker', 'volunteer');
$$;

-- Read/write sensitive attributes and restricted notes
CREATE OR REPLACE FUNCTION public.workspace_can_access_sensitive(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.workspace_role(p_org) IN ('owner', 'admin', 'caseworker');
$$;

-- Manage custom fields, seats, retention, exports
CREATE OR REPLACE FUNCTION public.workspace_is_admin(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.workspace_role(p_org) IN ('owner', 'admin');
$$;

-- ---------------------------------------------------------------------------
-- 1a-bis. SECURITY FIX — close self-serve privilege escalation
--
-- Migration 006 shipped:
--     CREATE POLICY "Users can link themselves to an org"
--       ON organization_members FOR INSERT TO authenticated
--       WITH CHECK (user_id = auth.uid());
--
-- That constrains only WHO, never WHICH ORG or WHAT ROLE. Any authenticated
-- user could insert themselves as 'owner' of any of the ~29k imported
-- charities and gain write access to that organisation. Harmless-ish while
-- the portal only exposed profile fields; unacceptable once beneficiary case
-- records live behind the same membership row.
--
-- Replacement rules:
--   * self-claim allowed only for an UNCLAIMED org, and only as 'owner'
--   * an existing owner/admin may add members to their own org, but may not
--     mint new owners (ownership transfer is a staff action)
--   * staff may add members for support
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.organization_has_members(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members WHERE organization_id = p_org
  );
$$;

DROP POLICY IF EXISTS "Users can link themselves to an org" ON organization_members;

CREATE POLICY "Users can claim an unclaimed organization"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND NOT public.organization_has_members(organization_id)
  );

CREATE POLICY "Org admins can add members"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.workspace_is_admin(organization_id)
    AND role IN ('admin', 'caseworker', 'volunteer', 'viewer')
  );

CREATE POLICY "Staff can add members"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_user());

-- Seat management: admins adjust roles (not ownership) and remove members.
CREATE POLICY "Org admins can update member roles"
  ON organization_members FOR UPDATE
  TO authenticated
  USING (public.workspace_is_admin(organization_id) OR public.is_staff_user())
  WITH CHECK (
    public.is_staff_user()
    OR (
      public.workspace_is_admin(organization_id)
      AND role IN ('admin', 'caseworker', 'volunteer', 'viewer')
    )
  );

CREATE POLICY "Org admins can remove members"
  ON organization_members FOR DELETE
  TO authenticated
  USING (
    public.is_staff_user()
    OR (public.workspace_is_admin(organization_id) AND role <> 'owner')
  );

-- Members need to see their colleagues to assign cases. Migration 006 only
-- allowed reading your own row, which makes an assignee picker impossible.
CREATE POLICY "Org members can read fellow members"
  ON organization_members FOR SELECT
  TO authenticated
  USING (public.workspace_can_read(organization_id));

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.workspace_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1b. Core tables
-- ---------------------------------------------------------------------------

-- Beneficiaries -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workspace_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reference_code text,
  given_name text NOT NULL DEFAULT '',
  family_name text NOT NULL DEFAULT '',
  preferred_name text,
  date_of_birth date,
  contact_email text,
  contact_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postcode text,
  country text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'closed')),
  custom jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, reference_code)
);

CREATE INDEX IF NOT EXISTS idx_workspace_clients_org
  ON workspace_clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspace_clients_org_status
  ON workspace_clients(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_workspace_clients_name
  ON workspace_clients(organization_id, family_name, given_name);

DROP TRIGGER IF EXISTS trg_workspace_clients_updated ON workspace_clients;
CREATE TRIGGER trg_workspace_clients_updated
  BEFORE UPDATE ON workspace_clients
  FOR EACH ROW EXECUTE FUNCTION public.workspace_touch_updated_at();

-- Sensitive attributes (separate table = separate policy) --------------------

CREATE TABLE IF NOT EXISTS workspace_client_sensitive (
  client_id uuid PRIMARY KEY
    REFERENCES workspace_clients(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ethnicity text,
  iwi_affiliation text,
  gender text,
  health_notes text,
  legal_status text,
  risk_flags text[] NOT NULL DEFAULT '{}',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_client_sensitive_org
  ON workspace_client_sensitive(organization_id);

DROP TRIGGER IF EXISTS trg_workspace_client_sensitive_updated
  ON workspace_client_sensitive;
CREATE TRIGGER trg_workspace_client_sensitive_updated
  BEFORE UPDATE ON workspace_client_sensitive
  FOR EACH ROW EXECUTE FUNCTION public.workspace_touch_updated_at();

-- Consent (Privacy Act 2020 — IPP3 collection notice, IPP11 disclosure) ------

CREATE TABLE IF NOT EXISTS workspace_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES workspace_clients(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  method text NOT NULL DEFAULT 'verbal'
    CHECK (method IN ('verbal', 'written', 'digital')),
  evidence text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  withdrawn_at timestamptz,
  collected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_consents_org
  ON workspace_consents(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspace_consents_client
  ON workspace_consents(client_id);

-- Cases ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workspace_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES workspace_clients(id) ON DELETE CASCADE,
  reference_code text,
  title text NOT NULL DEFAULT '',
  service_type text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'on_hold', 'closed')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  closed_at timestamptz,
  closure_reason text,
  outcome text,
  custom jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_cases_org
  ON workspace_cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspace_cases_client
  ON workspace_cases(client_id);
CREATE INDEX IF NOT EXISTS idx_workspace_cases_org_status
  ON workspace_cases(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_workspace_cases_assigned
  ON workspace_cases(organization_id, assigned_to);

DROP TRIGGER IF EXISTS trg_workspace_cases_updated ON workspace_cases;
CREATE TRIGGER trg_workspace_cases_updated
  BEFORE UPDATE ON workspace_cases
  FOR EACH ROW EXECUTE FUNCTION public.workspace_touch_updated_at();

-- Case notes (append-only) --------------------------------------------------

CREATE TABLE IF NOT EXISTS workspace_case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES workspace_cases(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  visibility text NOT NULL DEFAULT 'team'
    CHECK (visibility IN ('team', 'restricted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_case_notes_case
  ON workspace_case_notes(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_case_notes_org
  ON workspace_case_notes(organization_id);

-- Service delivery sessions -------------------------------------------------

CREATE TABLE IF NOT EXISTS workspace_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES workspace_clients(id) ON DELETE CASCADE,
  case_id uuid REFERENCES workspace_cases(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  service_type text,
  delivery_mode text
    CHECK (delivery_mode IS NULL
           OR delivery_mode IN ('in_person', 'phone', 'video', 'email', 'other')),
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  attendees integer CHECK (attendees IS NULL OR attendees >= 0),
  outcome text,
  notes text,
  custom jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_sessions_org_date
  ON workspace_sessions(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_sessions_client
  ON workspace_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_workspace_sessions_case
  ON workspace_sessions(case_id);

DROP TRIGGER IF EXISTS trg_workspace_sessions_updated ON workspace_sessions;
CREATE TRIGGER trg_workspace_sessions_updated
  BEFORE UPDATE ON workspace_sessions
  FOR EACH ROW EXECUTE FUNCTION public.workspace_touch_updated_at();

-- Documents (Supabase Storage object references) ----------------------------

CREATE TABLE IF NOT EXISTS workspace_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES workspace_clients(id) ON DELETE CASCADE,
  case_id uuid REFERENCES workspace_cases(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  sensitivity text NOT NULL DEFAULT 'team'
    CHECK (sensitivity IN ('team', 'restricted')),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_workspace_documents_org
  ON workspace_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspace_documents_client
  ON workspace_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_workspace_documents_case
  ON workspace_documents(case_id);

-- Custom field definitions (escape hatch, NOT a table builder) --------------

CREATE TABLE IF NOT EXISTS workspace_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity text NOT NULL CHECK (entity IN ('client', 'case', 'session')),
  key text NOT NULL,
  label text NOT NULL,
  data_type text NOT NULL DEFAULT 'text'
    CHECK (data_type IN ('text', 'long_text', 'number', 'date', 'boolean', 'select', 'multi_select')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  sensitive boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, entity, key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_field_defs_org
  ON workspace_field_defs(organization_id, entity, sort_order);

-- Retention policy per tenant (Privacy Act IPP9) ----------------------------

CREATE TABLE IF NOT EXISTS workspace_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  client_retention_months integer NOT NULL DEFAULT 84
    CHECK (client_retention_months > 0),
  collection_notice text NOT NULL DEFAULT '',
  data_region text NOT NULL DEFAULT 'ap-southeast-2',
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_workspace_settings_updated ON workspace_settings;
CREATE TRIGGER trg_workspace_settings_updated
  BEFORE UPDATE ON workspace_settings
  FOR EACH ROW EXECUTE FUNCTION public.workspace_touch_updated_at();

-- Audit log (append-only; records reads and exports too) ---------------------

CREATE TABLE IF NOT EXISTS workspace_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL
    CHECK (action IN ('create', 'read', 'update', 'delete', 'export', 'login')),
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_audit_org_time
  ON workspace_audit_log(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_audit_entity
  ON workspace_audit_log(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- RLS — every table, tenant-scoped, no anon, no staff bypass
-- ---------------------------------------------------------------------------

ALTER TABLE workspace_clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_client_sensitive   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_consents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_cases              ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_case_notes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_field_defs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_audit_log          ENABLE ROW LEVEL SECURITY;

-- workspace_clients ---------------------------------------------------------

CREATE POLICY "workspace members read clients"
  ON workspace_clients FOR SELECT TO authenticated
  USING (public.workspace_can_read(organization_id));

CREATE POLICY "workspace members insert clients"
  ON workspace_clients FOR INSERT TO authenticated
  WITH CHECK (public.workspace_can_write(organization_id));

CREATE POLICY "workspace members update clients"
  ON workspace_clients FOR UPDATE TO authenticated
  USING (public.workspace_can_write(organization_id))
  WITH CHECK (public.workspace_can_write(organization_id));

CREATE POLICY "workspace admins delete clients"
  ON workspace_clients FOR DELETE TO authenticated
  USING (public.workspace_is_admin(organization_id));

-- workspace_client_sensitive (owner/admin/caseworker only) ------------------

CREATE POLICY "workspace sensitive read"
  ON workspace_client_sensitive FOR SELECT TO authenticated
  USING (public.workspace_can_access_sensitive(organization_id));

CREATE POLICY "workspace sensitive insert"
  ON workspace_client_sensitive FOR INSERT TO authenticated
  WITH CHECK (public.workspace_can_access_sensitive(organization_id));

CREATE POLICY "workspace sensitive update"
  ON workspace_client_sensitive FOR UPDATE TO authenticated
  USING (public.workspace_can_access_sensitive(organization_id))
  WITH CHECK (public.workspace_can_access_sensitive(organization_id));

CREATE POLICY "workspace sensitive delete"
  ON workspace_client_sensitive FOR DELETE TO authenticated
  USING (public.workspace_is_admin(organization_id));

-- workspace_consents --------------------------------------------------------

CREATE POLICY "workspace members read consents"
  ON workspace_consents FOR SELECT TO authenticated
  USING (public.workspace_can_read(organization_id));

CREATE POLICY "workspace members insert consents"
  ON workspace_consents FOR INSERT TO authenticated
  WITH CHECK (public.workspace_can_write(organization_id));

-- Withdrawal is an update; keep it to sensitive-capable roles.
CREATE POLICY "workspace members update consents"
  ON workspace_consents FOR UPDATE TO authenticated
  USING (public.workspace_can_access_sensitive(organization_id))
  WITH CHECK (public.workspace_can_access_sensitive(organization_id));

-- workspace_cases -----------------------------------------------------------

CREATE POLICY "workspace members read cases"
  ON workspace_cases FOR SELECT TO authenticated
  USING (public.workspace_can_read(organization_id));

CREATE POLICY "workspace members insert cases"
  ON workspace_cases FOR INSERT TO authenticated
  WITH CHECK (public.workspace_can_write(organization_id));

CREATE POLICY "workspace members update cases"
  ON workspace_cases FOR UPDATE TO authenticated
  USING (public.workspace_can_write(organization_id))
  WITH CHECK (public.workspace_can_write(organization_id));

CREATE POLICY "workspace admins delete cases"
  ON workspace_cases FOR DELETE TO authenticated
  USING (public.workspace_is_admin(organization_id));

-- workspace_case_notes — APPEND ONLY (no UPDATE, no DELETE policy) ----------

CREATE POLICY "workspace members read team notes"
  ON workspace_case_notes FOR SELECT TO authenticated
  USING (
    public.workspace_can_read(organization_id)
    AND (
      visibility = 'team'
      OR public.workspace_can_access_sensitive(organization_id)
    )
  );

CREATE POLICY "workspace members append notes"
  ON workspace_case_notes FOR INSERT TO authenticated
  WITH CHECK (
    public.workspace_can_write(organization_id)
    AND author_id = auth.uid()
    AND (
      visibility = 'team'
      OR public.workspace_can_access_sensitive(organization_id)
    )
  );

-- workspace_sessions --------------------------------------------------------

CREATE POLICY "workspace members read sessions"
  ON workspace_sessions FOR SELECT TO authenticated
  USING (public.workspace_can_read(organization_id));

CREATE POLICY "workspace members insert sessions"
  ON workspace_sessions FOR INSERT TO authenticated
  WITH CHECK (public.workspace_can_write(organization_id));

CREATE POLICY "workspace members update sessions"
  ON workspace_sessions FOR UPDATE TO authenticated
  USING (public.workspace_can_write(organization_id))
  WITH CHECK (public.workspace_can_write(organization_id));

CREATE POLICY "workspace admins delete sessions"
  ON workspace_sessions FOR DELETE TO authenticated
  USING (public.workspace_is_admin(organization_id));

-- workspace_documents -------------------------------------------------------

CREATE POLICY "workspace members read documents"
  ON workspace_documents FOR SELECT TO authenticated
  USING (
    public.workspace_can_read(organization_id)
    AND (
      sensitivity = 'team'
      OR public.workspace_can_access_sensitive(organization_id)
    )
  );

CREATE POLICY "workspace members insert documents"
  ON workspace_documents FOR INSERT TO authenticated
  WITH CHECK (
    public.workspace_can_write(organization_id)
    AND (
      sensitivity = 'team'
      OR public.workspace_can_access_sensitive(organization_id)
    )
  );

CREATE POLICY "workspace admins delete documents"
  ON workspace_documents FOR DELETE TO authenticated
  USING (public.workspace_is_admin(organization_id));

-- workspace_field_defs ------------------------------------------------------

CREATE POLICY "workspace members read field defs"
  ON workspace_field_defs FOR SELECT TO authenticated
  USING (public.workspace_can_read(organization_id));

CREATE POLICY "workspace admins manage field defs"
  ON workspace_field_defs FOR ALL TO authenticated
  USING (public.workspace_is_admin(organization_id))
  WITH CHECK (public.workspace_is_admin(organization_id));

-- workspace_settings --------------------------------------------------------

CREATE POLICY "workspace members read settings"
  ON workspace_settings FOR SELECT TO authenticated
  USING (public.workspace_can_read(organization_id));

CREATE POLICY "workspace admins manage settings"
  ON workspace_settings FOR ALL TO authenticated
  USING (public.workspace_is_admin(organization_id))
  WITH CHECK (public.workspace_is_admin(organization_id));

-- workspace_audit_log — append only, admins read ----------------------------

CREATE POLICY "workspace admins read audit log"
  ON workspace_audit_log FOR SELECT TO authenticated
  USING (public.workspace_is_admin(organization_id));

CREATE POLICY "workspace members append audit log"
  ON workspace_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    public.workspace_can_read(organization_id)
    AND actor_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Aggregate stats for funder reporting (mirrors crm_dashboard_stats pattern)
-- SECURITY INVOKER so RLS still applies to the caller.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.workspace_stats(
  p_org uuid,
  p_from timestamptz DEFAULT now() - interval '90 days',
  p_to   timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'clients_total',
      (SELECT count(*) FROM workspace_clients
        WHERE organization_id = p_org),
    'clients_active',
      (SELECT count(*) FROM workspace_clients
        WHERE organization_id = p_org AND status = 'active'),
    'clients_new_in_period',
      (SELECT count(*) FROM workspace_clients
        WHERE organization_id = p_org
          AND created_at >= p_from AND created_at < p_to),
    'cases_open',
      (SELECT count(*) FROM workspace_cases
        WHERE organization_id = p_org AND status = 'open'),
    'cases_closed_in_period',
      (SELECT count(*) FROM workspace_cases
        WHERE organization_id = p_org
          AND closed_at >= p_from AND closed_at < p_to),
    'cases_overdue',
      (SELECT count(*) FROM workspace_cases
        WHERE organization_id = p_org AND status = 'open'
          AND due_at IS NOT NULL AND due_at < now()),
    'sessions_in_period',
      (SELECT count(*) FROM workspace_sessions
        WHERE organization_id = p_org
          AND occurred_at >= p_from AND occurred_at < p_to),
    'session_minutes_in_period',
      (SELECT COALESCE(sum(duration_minutes), 0) FROM workspace_sessions
        WHERE organization_id = p_org
          AND occurred_at >= p_from AND occurred_at < p_to),
    'clients_served_in_period',
      (SELECT count(DISTINCT client_id) FROM workspace_sessions
        WHERE organization_id = p_org
          AND occurred_at >= p_from AND occurred_at < p_to),
    'sessions_by_service_type',
      (SELECT COALESCE(jsonb_object_agg(service_type, n), '{}'::jsonb)
         FROM (
           SELECT COALESCE(service_type, 'unspecified') AS service_type,
                  count(*) AS n
             FROM workspace_sessions
            WHERE organization_id = p_org
              AND occurred_at >= p_from AND occurred_at < p_to
            GROUP BY 1
         ) s),
    'period_from', p_from,
    'period_to', p_to
  );
$$;

COMMENT ON FUNCTION public.workspace_stats IS
  'Funder-report aggregates for one organisation. SECURITY INVOKER — RLS '
  'applies, so a caller with no workspace role sees zeroes, not an error.';
