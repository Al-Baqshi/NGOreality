package tenant

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Seat management: an NGO administrator invites their own caseworkers.
//
// Every rule here is enforced inside a transaction that locks the tenant row,
// because the dangerous operations (seat cap, last-owner) are read-then-write
// and would otherwise race two concurrent requests into an invalid state.

var (
	ErrSeatLimit      = errors.New("no seats remaining")
	ErrLastOwner      = errors.New("a workspace must keep at least one owner")
	ErrSelfModify     = errors.New("you cannot change your own seat")
	ErrInviteInvalid  = errors.New("this invitation is not valid")
	ErrInviteEmail    = errors.New("this invitation was issued to a different email address")
	ErrRoleNotAllowed = errors.New("that role cannot be assigned")
)

// assignableRoles is a whitelist, never a default.
//
// A previous helper mapped a Supabase role onto a workspace role and defaulted
// to "admin" for anything unrecognised; it was one relaxed check away from
// making every viewer an administrator. Unknown input must be rejected.
var assignableRoles = map[string]bool{
	"admin": true, "caseworker": true, "volunteer": true, "viewer": true,
}

// IsAssignableRole reports whether a role may be granted by a tenant admin.
// "owner" is excluded on purpose: ownership is transferred, never assigned.
func IsAssignableRole(role string) bool { return assignableRoles[role] }

// Seat is one person's access to a workspace.
type Seat struct {
	UserID    string    `json:"user_id"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// Invite is a pending invitation. The plaintext token is never stored and is
// returned exactly once, at creation.
type Invite struct {
	ID         string     `json:"id"`
	Email      string     `json:"email"`
	Role       string     `json:"role"`
	ExpiresAt  time.Time  `json:"expires_at"`
	AcceptedAt *time.Time `json:"accepted_at"`
	CreatedAt  time.Time  `json:"created_at"`
	// Token is populated only on creation, for the email that goes out.
	Token string `json:"token,omitempty"`
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func newToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate invite token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func normaliseEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// withTenantLock serialises seat changes for one tenant.
func (r *Registry) withTenantLock(ctx context.Context, tenantID string, fn func(pgx.Tx) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Blocks any concurrent seat change on this tenant, so the seat-cap and
	// last-owner checks below cannot be raced.
	var exists bool
	err = tx.QueryRow(ctx,
		`SELECT true FROM platform.tenants WHERE id = $1 FOR UPDATE`, tenantID).Scan(&exists)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ListSeats returns everyone with access, including disabled seats so past
// authors of case notes can still be resolved to a name.
func (r *Registry) ListSeats(ctx context.Context, tenantID string) ([]Seat, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT user_id, email, role, status, created_at
		  FROM platform.tenant_users
		 WHERE tenant_id = $1
		 ORDER BY CASE role
		            WHEN 'owner' THEN 0 WHEN 'admin' THEN 1
		            WHEN 'caseworker' THEN 2 WHEN 'volunteer' THEN 3 ELSE 4 END,
		          email`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Seat{}
	for rows.Next() {
		var s Seat
		if err := rows.Scan(&s.UserID, &s.Email, &s.Role, &s.Status, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// activeSeatCount counts seats that consume a purchased seat. Disabled seats
// are retained for attribution and are not billed.
func activeSeatCount(ctx context.Context, tx pgx.Tx, tenantID string) (int, error) {
	var n int
	err := tx.QueryRow(ctx,
		`SELECT count(*) FROM platform.tenant_users
		  WHERE tenant_id = $1 AND status = 'active'`, tenantID).Scan(&n)
	return n, err
}

// pendingInviteCount — an outstanding invite reserves a seat, otherwise an
// admin could issue unlimited invitations and blow past the cap on acceptance.
func pendingInviteCount(ctx context.Context, tx pgx.Tx, tenantID string) (int, error) {
	var n int
	err := tx.QueryRow(ctx, `
		SELECT count(*) FROM platform.tenant_invites
		 WHERE tenant_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
		   AND expires_at > now()`, tenantID).Scan(&n)
	return n, err
}

func seatsPurchased(ctx context.Context, tx pgx.Tx, tenantID string) (int, error) {
	var n int
	err := tx.QueryRow(ctx,
		`SELECT seats_purchased FROM platform.tenants WHERE id = $1`, tenantID).Scan(&n)
	return n, err
}

// CreateInvite issues an invitation. Returns the plaintext token once.
func (r *Registry) CreateInvite(ctx context.Context, tenantID, email, role, invitedBy string, ttl time.Duration) (*Invite, error) {
	email = normaliseEmail(email)
	if email == "" || !strings.Contains(email, "@") {
		return nil, fmt.Errorf("a valid email address is required")
	}
	if !IsAssignableRole(role) {
		return nil, ErrRoleNotAllowed
	}

	token, err := newToken()
	if err != nil {
		return nil, err
	}

	var inv Invite
	err = r.withTenantLock(ctx, tenantID, func(tx pgx.Tx) error {
		// Already has a seat? Re-inviting would be confusing and could be used
		// to bump a colleague's role without going through the seat API.
		var existingRole string
		sErr := tx.QueryRow(ctx,
			`SELECT role FROM platform.tenant_users
			  WHERE tenant_id = $1 AND lower(email) = $2 AND status = 'active'`,
			tenantID, email).Scan(&existingRole)
		if sErr == nil {
			return fmt.Errorf("%s already has access as %s", email, existingRole)
		}
		if !errors.Is(sErr, pgx.ErrNoRows) {
			return sErr
		}

		purchased, err := seatsPurchased(ctx, tx, tenantID)
		if err != nil {
			return err
		}
		active, err := activeSeatCount(ctx, tx, tenantID)
		if err != nil {
			return err
		}
		pending, err := pendingInviteCount(ctx, tx, tenantID)
		if err != nil {
			return err
		}
		if active+pending >= purchased {
			return fmt.Errorf("%w: %d of %d seats are in use or invited",
				ErrSeatLimit, active+pending, purchased)
		}

		// Replace any superseded invite for this address, so revoking the new
		// link cannot leave an older one live.
		if _, err := tx.Exec(ctx, `
			UPDATE platform.tenant_invites SET revoked_at = now()
			 WHERE tenant_id = $1 AND lower(email) = $2
			   AND accepted_at IS NULL AND revoked_at IS NULL`, tenantID, email); err != nil {
			return err
		}

		return tx.QueryRow(ctx, `
			INSERT INTO platform.tenant_invites
				(tenant_id, token_hash, email, role, invited_by, expires_at)
			VALUES ($1, $2, $3, $4, $5, now() + $6::interval)
			RETURNING id, email, role, expires_at, accepted_at, created_at`,
			tenantID, hashToken(token), email, role, invitedBy,
			fmt.Sprintf("%d seconds", int(ttl.Seconds())),
		).Scan(&inv.ID, &inv.Email, &inv.Role, &inv.ExpiresAt, &inv.AcceptedAt, &inv.CreatedAt)
	})
	if err != nil {
		return nil, err
	}
	inv.Token = token
	return &inv, nil
}

func (r *Registry) ListInvites(ctx context.Context, tenantID string) ([]Invite, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, email, role, expires_at, accepted_at, created_at
		  FROM platform.tenant_invites
		 WHERE tenant_id = $1 AND revoked_at IS NULL AND accepted_at IS NULL
		   AND expires_at > now()
		 ORDER BY created_at DESC`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Invite{}
	for rows.Next() {
		var i Invite
		if err := rows.Scan(&i.ID, &i.Email, &i.Role, &i.ExpiresAt, &i.AcceptedAt, &i.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

func (r *Registry) RevokeInvite(ctx context.Context, tenantID, inviteID string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE platform.tenant_invites SET revoked_at = now()
		 WHERE id = $1 AND tenant_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
		inviteID, tenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// InvitePreview is what an invitee may see BEFORE accepting. It deliberately
// excludes the inviter and any client data — the token holder is not yet
// authorised to learn anything about the workspace beyond its name.
type InvitePreview struct {
	TenantName string `json:"tenant_name"`
	Role       string `json:"role"`
	Email      string `json:"email"`
}

func (r *Registry) PreviewInvite(ctx context.Context, token string) (*InvitePreview, error) {
	var p InvitePreview
	err := r.pool.QueryRow(ctx, `
		SELECT t.name, i.role, i.email
		  FROM platform.tenant_invites i
		  JOIN platform.tenants t ON t.id = i.tenant_id
		 WHERE i.token_hash = $1 AND i.accepted_at IS NULL
		   AND i.revoked_at IS NULL AND i.expires_at > now()`,
		hashToken(token)).Scan(&p.TenantName, &p.Role, &p.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInviteInvalid
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// AcceptInvite redeems a token and creates the seat.
//
// The accepting user's email must match the invited address. The token alone
// is not sufficient: a forwarded link, or one read from an intercepted inbox,
// cannot be redeemed by a different account.
func (r *Registry) AcceptInvite(ctx context.Context, token, userID, userEmail string) (*Tenant, string, error) {
	userEmail = normaliseEmail(userEmail)

	var tenantID, role string
	err := r.pool.QueryRow(ctx, `
		SELECT tenant_id, role FROM platform.tenant_invites
		 WHERE token_hash = $1 AND accepted_at IS NULL
		   AND revoked_at IS NULL AND expires_at > now()`,
		hashToken(token)).Scan(&tenantID, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", ErrInviteInvalid
	}
	if err != nil {
		return nil, "", err
	}

	err = r.withTenantLock(ctx, tenantID, func(tx pgx.Tx) error {
		// Re-read inside the lock and bind to the email in the same statement,
		// so two concurrent redemptions cannot both succeed.
		var invID, invEmail, invRole string
		iErr := tx.QueryRow(ctx, `
			SELECT id, email, role FROM platform.tenant_invites
			 WHERE token_hash = $1 AND accepted_at IS NULL
			   AND revoked_at IS NULL AND expires_at > now()
			 FOR UPDATE`, hashToken(token)).Scan(&invID, &invEmail, &invRole)
		if errors.Is(iErr, pgx.ErrNoRows) {
			return ErrInviteInvalid
		}
		if iErr != nil {
			return iErr
		}
		if normaliseEmail(invEmail) != userEmail {
			return ErrInviteEmail
		}
		if !IsAssignableRole(invRole) {
			return ErrRoleNotAllowed
		}

		purchased, err := seatsPurchased(ctx, tx, tenantID)
		if err != nil {
			return err
		}
		active, err := activeSeatCount(ctx, tx, tenantID)
		if err != nil {
			return err
		}
		if active >= purchased {
			return ErrSeatLimit
		}

		// Never raise an existing seat, and never resurrect a disabled one to a
		// higher rank than it had.
		if _, err := tx.Exec(ctx, `
			INSERT INTO platform.tenant_users (tenant_id, user_id, email, role, status)
			VALUES ($1, $2, $3, $4, 'active')
			ON CONFLICT (tenant_id, user_id) DO UPDATE
			   SET status = 'active', email = EXCLUDED.email
			 WHERE platform.tenant_users.status <> 'active'`,
			tenantID, userID, userEmail, invRole); err != nil {
			return err
		}

		role = invRole
		_, err = tx.Exec(ctx, `
			UPDATE platform.tenant_invites
			   SET accepted_at = now(), accepted_by = $2
			 WHERE id = $1`, invID, userID)
		return err
	})
	if err != nil {
		return nil, "", err
	}

	t, err := r.ByID(ctx, tenantID)
	if err != nil {
		return nil, "", err
	}
	return t, role, nil
}

// UpdateSeatRole changes someone's role.
//
// Refuses to touch an owner seat, to create one, or to let a caller modify
// their own — an admin cannot quietly promote themselves, and the last owner
// cannot be demoted out of existence.
func (r *Registry) UpdateSeatRole(ctx context.Context, tenantID, actorUserID, targetUserID, role string) error {
	if actorUserID == targetUserID {
		return ErrSelfModify
	}
	if !IsAssignableRole(role) {
		return ErrRoleNotAllowed
	}

	return r.withTenantLock(ctx, tenantID, func(tx pgx.Tx) error {
		var currentRole string
		err := tx.QueryRow(ctx, `
			SELECT role FROM platform.tenant_users
			 WHERE tenant_id = $1 AND user_id = $2`, tenantID, targetUserID).Scan(&currentRole)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if currentRole == "owner" {
			return ErrLastOwner
		}

		_, err = tx.Exec(ctx, `
			UPDATE platform.tenant_users SET role = $3
			 WHERE tenant_id = $1 AND user_id = $2`, tenantID, targetUserID, role)
		return err
	})
}

// RemoveSeat revokes access.
//
// The row is disabled rather than deleted so that case_notes.author_id and
// audit_log.actor_id still resolve to a person. A caseworker leaving must not
// silently rewrite the history of who recorded what.
func (r *Registry) RemoveSeat(ctx context.Context, tenantID, actorUserID, targetUserID string) error {
	if actorUserID == targetUserID {
		return ErrSelfModify
	}

	return r.withTenantLock(ctx, tenantID, func(tx pgx.Tx) error {
		var role string
		err := tx.QueryRow(ctx, `
			SELECT role FROM platform.tenant_users
			 WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'`,
			tenantID, targetUserID).Scan(&role)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if role == "owner" {
			var owners int
			if err := tx.QueryRow(ctx, `
				SELECT count(*) FROM platform.tenant_users
				 WHERE tenant_id = $1 AND role = 'owner' AND status = 'active'`,
				tenantID).Scan(&owners); err != nil {
				return err
			}
			if owners <= 1 {
				return ErrLastOwner
			}
		}

		_, err = tx.Exec(ctx, `
			UPDATE platform.tenant_users SET status = 'disabled'
			 WHERE tenant_id = $1 AND user_id = $2`, tenantID, targetUserID)
		return err
	})
}
