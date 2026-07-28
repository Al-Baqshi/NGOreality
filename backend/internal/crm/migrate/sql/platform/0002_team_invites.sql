-- Team seats: let an NGO administrator invite their own caseworkers.
--
-- Until now the only way to grant a seat was the control-plane endpoint, which
-- needs the NGOreality admin key — so customers could not add their own staff.

CREATE TABLE IF NOT EXISTS platform.tenant_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,

  -- The bearer secret. Only its hash is stored: a leaked database backup must
  -- not hand out working invitations.
  token_hash   text NOT NULL UNIQUE,

  -- Advisory AND enforced. The accepting user's verified email must match, so
  -- a forwarded or intercepted link cannot be redeemed by someone else.
  email        text NOT NULL,
  role         text NOT NULL
               CHECK (role IN ('admin', 'caseworker', 'volunteer', 'viewer')),

  invited_by   uuid NOT NULL,
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  accepted_by  uuid,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 'owner' is deliberately absent from the CHECK above. Ownership is not
-- something you can be invited into; it is transferred explicitly.

CREATE INDEX IF NOT EXISTS idx_tenant_invites_tenant
  ON platform.tenant_invites(tenant_id, created_at DESC);

-- One live invite per email per tenant. Re-inviting replaces rather than
-- accumulating, so revoking one link cannot leave another working.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_invites_pending
  ON platform.tenant_invites(tenant_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Removing a seat sets status='disabled' rather than deleting the row, so
-- case_notes.author_id still resolves to a person. Losing attribution would
-- break the audit trail the Privacy Act posture depends on.
COMMENT ON TABLE platform.tenant_invites IS
  'Pending workspace invitations. Only the token hash is stored; the plaintext '
  'token exists once, in the email sent to the invitee.';
