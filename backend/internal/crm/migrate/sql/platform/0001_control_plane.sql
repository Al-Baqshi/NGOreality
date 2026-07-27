-- Control plane. Lives in the `platform` schema and holds NO beneficiary data.
-- Only tenant identity, seats, billing state and provisioning bookkeeping.

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.tenants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Mirrors organizations.id in Supabase so the two systems can be joined
  -- by the application without sharing a database.
  organization_id    uuid NOT NULL UNIQUE,
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  schema_name        text NOT NULL UNIQUE,
  status             text NOT NULL DEFAULT 'provisioning'
                     CHECK (status IN ('provisioning', 'active', 'suspended', 'closed')),
  plan               text NOT NULL DEFAULT 'workspace'
                     CHECK (plan IN ('trial', 'workspace', 'enterprise')),
  seats_purchased    integer NOT NULL DEFAULT 1 CHECK (seats_purchased >= 0),
  -- Set when a large tenant is promoted off the shared cluster onto its own
  -- database. NULL means "use the default pool".
  dedicated_dsn      text,
  data_region        text NOT NULL DEFAULT 'ap-southeast-2',
  country            text NOT NULL DEFAULT 'NZ',
  schema_version     integer NOT NULL DEFAULT 0,
  provisioned_at     timestamptz,
  suspended_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON platform.tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_schema_version ON platform.tenants(schema_version);

-- Seat assignments. `user_id` is the Supabase auth.users UUID (the `sub`
-- claim), so identity stays in one place and this table only grants access.
CREATE TABLE IF NOT EXISTS platform.tenant_users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  email        text NOT NULL DEFAULT '',
  role         text NOT NULL DEFAULT 'viewer'
               CHECK (role IN ('owner', 'admin', 'caseworker', 'volunteer', 'viewer')),
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('invited', 'active', 'disabled')),
  invited_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON platform.tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON platform.tenant_users(tenant_id);

-- Provisioning / migration audit. Append-only operational record.
CREATE TABLE IF NOT EXISTS platform.provisioning_log (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid REFERENCES platform.tenants(id) ON DELETE SET NULL,
  action      text NOT NULL,
  detail      text NOT NULL DEFAULT '',
  succeeded   boolean NOT NULL DEFAULT true,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provisioning_log_tenant
  ON platform.provisioning_log(tenant_id, occurred_at DESC);

-- Tracks which platform-level migrations have run.
CREATE TABLE IF NOT EXISTS platform.schema_migrations (
  version    integer PRIMARY KEY,
  name       text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION platform.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_updated ON platform.tenants;
CREATE TRIGGER trg_tenants_updated
  BEFORE UPDATE ON platform.tenants
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_users_updated ON platform.tenant_users;
CREATE TRIGGER trg_tenant_users_updated
  BEFORE UPDATE ON platform.tenant_users
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
