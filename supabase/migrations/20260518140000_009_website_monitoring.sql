/*
  # Website uptime monitoring (Go worker)

  Stores check history and incidents for CRM. The worker uses the service role /
  direct Postgres connection and bypasses RLS.
*/

CREATE TABLE IF NOT EXISTS website_monitors (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  check_interval_minutes integer NOT NULL DEFAULT 60,
  last_checked_at timestamptz,
  last_status text NOT NULL DEFAULT 'unknown'
    CHECK (last_status IN ('unknown', 'up', 'down')),
  last_status_code integer,
  last_latency_ms integer,
  last_error text NOT NULL DEFAULT '',
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_monitors_due
  ON website_monitors (enabled, last_checked_at)
  WHERE enabled = true;

CREATE TABLE IF NOT EXISTS website_check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  url text NOT NULL,
  is_up boolean NOT NULL,
  status_code integer,
  latency_ms integer,
  error_message text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_website_check_results_org_time
  ON website_check_results (organization_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS website_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  last_status_code integer,
  error_message text NOT NULL DEFAULT '',
  staff_notified_at timestamptz,
  org_notified_at timestamptz,
  notes text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_website_incidents_open
  ON website_incidents (organization_id)
  WHERE closed_at IS NULL;

ALTER TABLE website_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_check_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read website monitors"
  ON website_monitors FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff update website monitors"
  ON website_monitors FOR UPDATE
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff read website check results"
  ON website_check_results FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff read website incidents"
  ON website_incidents FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE POLICY "Staff update website incidents"
  ON website_incidents FOR UPDATE
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());
