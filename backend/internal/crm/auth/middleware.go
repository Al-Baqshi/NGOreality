package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"ngoreality/backend/internal/crm/tenant"
)

// Role ordering for permission checks.
type Role string

const (
	RoleOwner      Role = "owner"
	RoleAdmin      Role = "admin"
	RoleCaseworker Role = "caseworker"
	RoleVolunteer  Role = "volunteer"
	RoleViewer     Role = "viewer"
)

// Principal is the authenticated caller, resolved to exactly one tenant.
type Principal struct {
	UserID string
	Email  string
	Role   Role
	Tenant *tenant.Tenant
}

// CanRead — any seated role.
func (p *Principal) CanRead() bool {
	switch p.Role {
	case RoleOwner, RoleAdmin, RoleCaseworker, RoleVolunteer, RoleViewer:
		return true
	}
	return false
}

// CanWrite — create/update client and case data.
func (p *Principal) CanWrite() bool {
	switch p.Role {
	case RoleOwner, RoleAdmin, RoleCaseworker, RoleVolunteer:
		return true
	}
	return false
}

// CanAccessSensitive — sensitive attributes and restricted notes.
func (p *Principal) CanAccessSensitive() bool {
	switch p.Role {
	case RoleOwner, RoleAdmin, RoleCaseworker:
		return true
	}
	return false
}

// IsAdmin — settings, seats, custom fields, exports, deletion.
func (p *Principal) IsAdmin() bool {
	return p.Role == RoleOwner || p.Role == RoleAdmin
}

type ctxKey int

const principalKey ctxKey = iota

// FromContext returns the authenticated principal, if any.
func FromContext(ctx context.Context) (*Principal, bool) {
	p, ok := ctx.Value(principalKey).(*Principal)
	return p, ok
}

// Middleware verifies the bearer token and resolves the caller to one tenant.
//
// Tenant selection: the X-Tenant-ID header when present (validated against the
// caller's seats), otherwise the caller's only seat. A user with several seats
// and no header gets 400 rather than an arbitrary pick.
type Middleware struct {
	Verifier TokenVerifier
	Registry *tenant.Registry
	// Central, when set, maps subjects from the central Baqshi issuer to the
	// Supabase-era user ids that seats are keyed by. See central.go.
	Central *CentralResolver
}

func (m *Middleware) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := bearerToken(r)
		if raw == "" {
			writeErr(w, http.StatusUnauthorized, "missing bearer token")
			return
		}

		claims, err := m.Verifier.Verify(raw)
		if err != nil {
			// Deliberately vague to the client; detail stays server-side.
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}

		ctx := r.Context()
		// A central token's subject is a foreign uuid; swap it for the seat
		// user id before any membership lookup. Same refusal shape as "no
		// workspace access" — a central account without a seat learns nothing
		// about which emails hold seats here.
		if m.Central != nil && claims.Issuer == m.Central.Issuer() {
			uid, email, rerr := m.Central.Resolve(ctx, claims.Subject, raw)
			if rerr != nil {
				if errors.Is(rerr, ErrNoSeat) {
					writeErr(w, http.StatusForbidden, "no workspace access")
					return
				}
				writeErr(w, http.StatusUnauthorized, "invalid token")
				return
			}
			claims.Subject, claims.Email = uid, email
		}
		requested := strings.TrimSpace(r.Header.Get("X-Tenant-ID"))

		var principal *Principal
		if requested != "" {
			ms, err := m.Registry.MembershipFor(ctx, claims.Subject, requested)
			if err != nil {
				if errors.Is(err, tenant.ErrNotFound) {
					// Do not distinguish "no such tenant" from "not your
					// tenant" — that difference is an enumeration oracle.
					writeErr(w, http.StatusForbidden, "no access to this workspace")
					return
				}
				writeErr(w, http.StatusInternalServerError, "membership lookup failed")
				return
			}
			principal = &Principal{
				UserID: claims.Subject, Email: claims.Email,
				Role: Role(ms.Role), Tenant: ms.Tenant,
			}
		} else {
			list, err := m.Registry.MembershipsForUser(ctx, claims.Subject)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "membership lookup failed")
				return
			}
			switch len(list) {
			case 0:
				writeErr(w, http.StatusForbidden, "no workspace access")
				return
			case 1:
				principal = &Principal{
					UserID: claims.Subject, Email: claims.Email,
					Role: Role(list[0].Role), Tenant: list[0].Tenant,
				}
			default:
				writeErr(w, http.StatusBadRequest, "multiple workspaces: set the X-Tenant-ID header")
				return
			}
		}

		if principal.Tenant.Status != tenant.StatusActive {
			writeErr(w, http.StatusForbidden, "workspace is not active")
			return
		}

		next.ServeHTTP(w, r.WithContext(context.WithValue(ctx, principalKey, principal)))
	})
}

// RequireWrite / RequireAdmin wrap individual handlers.
func RequireWrite(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, ok := FromContext(r.Context())
		if !ok || !p.CanWrite() {
			writeErr(w, http.StatusForbidden, "your role cannot make changes")
			return
		}
		next(w, r)
	}
}

func RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, ok := FromContext(r.Context())
		if !ok || !p.IsAdmin() {
			writeErr(w, http.StatusForbidden, "administrator role required")
			return
		}
		next(w, r)
	}
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":` + quote(msg) + `}`))
}

func quote(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}
