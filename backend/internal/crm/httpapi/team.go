package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"ngoreality/backend/internal/crm/auth"
	"ngoreality/backend/internal/crm/tenant"
)

const inviteTTL = 7 * 24 * time.Hour

// ---------------------------------------------------------------------------
// Team seats
//
// The tenant is ALWAYS taken from the authenticated principal, never from the
// request body or a path parameter. No endpoint here accepts a tenant
// identifier, so there is no shape of request that reaches another workspace.
// ---------------------------------------------------------------------------

// listTeam is readable by any seat: assigning a case needs a colleague list.
func (s *Server) listTeam(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "unauthenticated")
		return
	}

	seats, err := s.registry.ListSeats(r.Context(), p.Tenant.ID)
	if err != nil {
		s.log.Error("list seats", "err", err, "tenant", p.Tenant.ID)
		writeErr(w, http.StatusInternalServerError, "could not load the team")
		return
	}

	resp := map[string]any{"members": seats, "seats_purchased": p.Tenant.SeatsPurchased}

	// Pending invitations name people who are not yet part of the workspace.
	// Only administrators see them.
	if p.IsAdmin() {
		invites, err := s.registry.ListInvites(r.Context(), p.Tenant.ID)
		if err != nil {
			s.log.Error("list invites", "err", err, "tenant", p.Tenant.ID)
			writeErr(w, http.StatusInternalServerError, "could not load invitations")
			return
		}
		resp["invites"] = invites
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) createInvite(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if !decode(w, r, &in) {
		return
	}

	p, _ := auth.FromContext(r.Context())

	inv, err := s.registry.CreateInvite(
		r.Context(), p.Tenant.ID, in.Email, in.Role, p.UserID, inviteTTL)
	switch {
	case errors.Is(err, tenant.ErrRoleNotAllowed):
		writeErr(w, http.StatusBadRequest,
			"role must be admin, caseworker, volunteer or viewer")
		return
	case errors.Is(err, tenant.ErrSeatLimit):
		writeErr(w, http.StatusPaymentRequired, err.Error())
		return
	case err != nil:
		// Validation errors here are user-facing and safe (bad email, already
		// has access); anything unexpected is logged rather than echoed.
		if strings.Contains(err.Error(), "already has access") ||
			strings.Contains(err.Error(), "valid email") {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		s.log.Error("create invite", "err", err, "tenant", p.Tenant.ID)
		writeErr(w, http.StatusInternalServerError, "could not create the invitation")
		return
	}

	// The plaintext token exists only in this response. It is not stored and
	// cannot be shown again — the caller must deliver it now.
	writeJSON(w, http.StatusCreated, map[string]any{
		"invite":      inv,
		"accept_path": "/ngo/workspace/join/" + inv.Token,
	})
}

func (s *Server) revokeInvite(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.FromContext(r.Context())
	err := s.registry.RevokeInvite(r.Context(), p.Tenant.ID, r.PathValue("id"))
	if errors.Is(err, tenant.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "invitation not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not revoke the invitation")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}

func (s *Server) updateSeat(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Role string `json:"role"`
	}
	if !decode(w, r, &in) {
		return
	}

	p, _ := auth.FromContext(r.Context())
	err := s.registry.UpdateSeatRole(r.Context(), p.Tenant.ID, p.UserID, r.PathValue("user_id"), in.Role)
	s.writeSeatErr(w, err, map[string]string{"status": "updated"})
}

func (s *Server) removeSeat(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.FromContext(r.Context())
	err := s.registry.RemoveSeat(r.Context(), p.Tenant.ID, p.UserID, r.PathValue("user_id"))
	s.writeSeatErr(w, err, map[string]string{"status": "removed"})
}

func (s *Server) writeSeatErr(w http.ResponseWriter, err error, success any) {
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, success)
	case errors.Is(err, tenant.ErrSelfModify):
		writeErr(w, http.StatusForbidden,
			"you cannot change your own seat — ask another administrator")
	case errors.Is(err, tenant.ErrLastOwner):
		writeErr(w, http.StatusConflict,
			"the workspace owner's seat cannot be changed here")
	case errors.Is(err, tenant.ErrRoleNotAllowed):
		writeErr(w, http.StatusBadRequest,
			"role must be admin, caseworker, volunteer or viewer")
	case errors.Is(err, tenant.ErrNotFound):
		writeErr(w, http.StatusNotFound, "that person is not on this team")
	default:
		s.log.Error("seat change", "err", err)
		writeErr(w, http.StatusInternalServerError, "could not update the team")
	}
}

// ---------------------------------------------------------------------------
// Accepting an invitation
//
// These two sit OUTSIDE the tenant middleware. The invitee has no seat yet, so
// resolving them to a workspace would fail before they could join one. They
// authenticate the token themselves and take the tenant from the invite row.
// ---------------------------------------------------------------------------

func (s *Server) previewInvite(w http.ResponseWriter, r *http.Request) {
	// Requires a signed-in user even to look: an unauthenticated endpoint that
	// confirms a token is valid is a free oracle for guessed tokens.
	if raw := bearer(r); raw == "" {
		writeErr(w, http.StatusUnauthorized, "sign in to view this invitation")
		return
	} else if _, err := s.verifier.Verify(raw); err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid token")
		return
	}

	preview, err := s.registry.PreviewInvite(r.Context(), r.PathValue("token"))
	if errors.Is(err, tenant.ErrInviteInvalid) {
		writeErr(w, http.StatusNotFound, "this invitation has expired or is no longer valid")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load the invitation")
		return
	}
	writeJSON(w, http.StatusOK, preview)
}

func (s *Server) acceptInvite(w http.ResponseWriter, r *http.Request) {
	raw := bearer(r)
	if raw == "" {
		writeErr(w, http.StatusUnauthorized, "sign in to accept this invitation")
		return
	}
	claims, err := s.verifier.Verify(raw)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid token")
		return
	}

	t, role, err := s.registry.AcceptInvite(
		r.Context(), r.PathValue("token"), claims.Subject, claims.Email)
	switch {
	case errors.Is(err, tenant.ErrInviteInvalid):
		writeErr(w, http.StatusNotFound, "this invitation has expired or is no longer valid")
	case errors.Is(err, tenant.ErrInviteEmail):
		writeErr(w, http.StatusForbidden,
			"this invitation was sent to a different email address. Sign in with that address to accept it.")
	case errors.Is(err, tenant.ErrSeatLimit):
		writeErr(w, http.StatusPaymentRequired,
			"this workspace has no seats remaining. Ask an administrator to add one.")
	case err != nil:
		s.log.Error("accept invite", "err", err)
		writeErr(w, http.StatusInternalServerError, "could not accept the invitation")
	default:
		writeJSON(w, http.StatusOK, map[string]any{"tenant": t, "role": role})
	}
}
