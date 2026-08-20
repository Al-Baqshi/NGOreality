-- Auto-renew preference on membership (NGO portal toggle).
-- Frontend already reads/writes organizations.auto_renew_membership; column was never migrated.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS auto_renew_membership boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.auto_renew_membership IS
  'When true, NGO prefers automatic membership renewal before expiry (billing still staff/processor-driven).';
