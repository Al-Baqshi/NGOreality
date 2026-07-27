package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"ngoreality/backend/internal/crm/tenant"
)

func contextWithTimeout(r *http.Request, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), d)
}

// ---------------------------------------------------------------------------
// Self-serve signup
//
// One authenticated call turns an NGO that already exists on ngoreality.com
// into a working private workspace. No admin key, no manual step, no second
// login — the token the user already holds is enough.
//
// Authorisation is delegated: the CRM asks Supabase "what is this user's role
// in this organisation?" using the USER'S OWN token. RLS answers. A user who
// is not an owner or admin of that NGO gets nothing back, so this cannot be
// used to claim someone else's organisation, and the CRM needs no privileged
// Supabase credential to check.
// ---------------------------------------------------------------------------

type signupRequest struct {
	OrganizationID string `json:"organization_id"`
	// Name is optional; when omitted it is read from the organisation record.
	Name string `json:"name"`
}

// signupHandler is registered OUTSIDE the tenant middleware: the caller has no
// workspace yet, so resolving them to one would fail before they could create it.
func (s *Server) signup(w http.ResponseWriter, r *http.Request) {
	raw := bearer(r)
	if raw == "" {
		writeErr(w, http.StatusUnauthorized, "missing bearer token")
		return
	}
	claims, err := s.verifier.Verify(raw)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid token")
		return
	}

	var in signupRequest
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.OrganizationID) == "" {
		writeErr(w, http.StatusBadRequest, "organization_id is required")
		return
	}

	if !s.supabase.Configured() {
		s.log.Error("signup attempted but Supabase lookups are not configured")
		writeErr(w, http.StatusServiceUnavailable,
			"self-serve signup is unavailable: the service cannot verify organisation membership")
		return
	}

	ctx, cancel := contextWithTimeout(r, s.cfg.ProvisionTimeout)
	defer cancel()

	// Does this user actually run this NGO?
	role, err := s.supabase.OrganizationRole(ctx, raw, in.OrganizationID)
	if err != nil {
		s.log.Error("membership check failed", "err", err, "org", in.OrganizationID)
		writeErr(w, http.StatusBadGateway, "could not verify your organisation membership")
		return
	}
	if role != "owner" && role != "admin" {
		// Same response whether the org does not exist or is not theirs —
		// distinguishing the two would let anyone enumerate organisations.
		writeErr(w, http.StatusForbidden,
			"you must be an owner or administrator of this organisation to create its workspace")
		return
	}

	name := strings.TrimSpace(in.Name)
	country := ""
	if org, err := s.supabase.Organization(ctx, raw, in.OrganizationID); err == nil && org != nil {
		if name == "" {
			name = org.Name
		}
		if org.Country != nil {
			country = *org.Country
		}
	}
	if name == "" {
		writeErr(w, http.StatusBadRequest, "could not determine the organisation name; pass \"name\"")
		return
	}

	t, err := s.registry.Provision(ctx, tenant.ProvisionInput{
		OrganizationID: in.OrganizationID,
		Name:           name,
		Country:        country,
		OwnerUserID:    claims.Subject,
		OwnerEmail:     claims.Email,
	})

	if errors.Is(err, tenant.ErrExists) {
		// Already set up. Make sure this user has a seat — they may be a second
		// admin arriving after the first one created it — then report success,
		// so a double-click or a retry is harmless.
		if seatErr := s.registry.UpsertUser(ctx, t.ID, claims.Subject, claims.Email, seatRoleFor(role)); seatErr != nil {
			s.log.Error("could not seat user on existing workspace", "err", seatErr, "tenant", t.ID)
			writeErr(w, http.StatusInternalServerError, "workspace exists but your access could not be granted")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"tenant": t, "already_existed": true, "role": seatRoleFor(role),
		})
		return
	}
	if err != nil {
		s.log.Error("self-serve provisioning failed", "err", err, "org", in.OrganizationID)
		writeErr(w, http.StatusInternalServerError, "could not create your workspace")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"tenant": t, "already_existed": false, "role": "owner",
	})
}

// seatRoleFor maps a platform role onto a workspace role. A platform admin
// becomes a workspace admin, not an owner: ownership is granted once, to
// whoever created the workspace.
func seatRoleFor(platformRole string) string {
	if platformRole == "owner" {
		return "owner"
	}
	return "admin"
}

// eligibility lets the portal decide whether to show a "Create workspace"
// button without attempting provisioning first.
func (s *Server) signupEligibility(w http.ResponseWriter, r *http.Request) {
	raw := bearer(r)
	if raw == "" {
		writeErr(w, http.StatusUnauthorized, "missing bearer token")
		return
	}
	claims, err := s.verifier.Verify(raw)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid token")
		return
	}

	orgID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
	if orgID == "" {
		writeErr(w, http.StatusBadRequest, "organization_id is required")
		return
	}

	ctx, cancel := contextWithTimeout(r, 15*time.Second)
	defer cancel()

	existing, err := s.registry.ByOrganization(ctx, orgID)
	switch {
	case err == nil:
		membership, mErr := s.registry.MembershipFor(ctx, claims.Subject, existing.ID)
		resp := map[string]any{"exists": true, "can_create": false}
		if mErr == nil {
			resp["tenant"] = existing
			resp["role"] = membership.Role
			resp["has_access"] = true
		} else {
			resp["has_access"] = false
		}
		writeJSON(w, http.StatusOK, resp)
		return
	case !errors.Is(err, tenant.ErrNotFound):
		writeErr(w, http.StatusInternalServerError, "could not check workspace status")
		return
	}

	canCreate := false
	if s.supabase.Configured() {
		if role, rErr := s.supabase.OrganizationRole(ctx, raw, orgID); rErr == nil {
			canCreate = role == "owner" || role == "admin"
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"exists": false, "can_create": canCreate, "has_access": false,
	})
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

// ---------------------------------------------------------------------------
// Offboarding (admin)
// ---------------------------------------------------------------------------

func (s *Server) listTenants(w http.ResponseWriter, r *http.Request) {
	items, err := s.registry.List(r.Context(), intParam(r, "limit", 100))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not list workspaces")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tenants": items})
}

// deleteTenant destroys a workspace and every beneficiary record in it.
// Irreversible, so it requires the exact slug as confirmation — an accidental
// call with just an ID does nothing.
func (s *Server) deleteTenant(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ConfirmSlug string `json:"confirm_slug"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.ConfirmSlug == "" {
		writeErr(w, http.StatusBadRequest,
			"confirm_slug is required: pass the workspace slug to confirm permanent deletion")
		return
	}

	err := s.registry.Delete(r.Context(), r.PathValue("id"), in.ConfirmSlug)
	switch {
	case errors.Is(err, tenant.ErrNotFound):
		writeErr(w, http.StatusNotFound, "workspace not found")
	case err != nil && strings.Contains(err.Error(), "does not match"):
		writeErr(w, http.StatusBadRequest, err.Error())
	case err != nil:
		s.log.Error("tenant deletion failed", "err", err, "tenant", r.PathValue("id"))
		writeErr(w, http.StatusInternalServerError, "deletion failed")
	default:
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	}
}
