// Package httpapi exposes the CRM over HTTP.
//
// Handler shape: resolve the principal, acquire a tenant-pinned transaction,
// run store calls, commit. The transaction is the isolation boundary, so no
// handler ever touches the pool directly.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"ngoreality/backend/internal/crm/auth"
	"ngoreality/backend/internal/crm/config"
	"ngoreality/backend/internal/crm/payments"
	"ngoreality/backend/internal/crm/store"
	"ngoreality/backend/internal/crm/supabase"
	"ngoreality/backend/internal/crm/tenant"
)

const maxBody = 1 << 20 // 1 MiB

type Server struct {
	cfg      config.Config
	registry *tenant.Registry
	verifier *auth.Verifier
	supabase *supabase.Client
	paymark  *payments.Verifier
	log      *slog.Logger
}

func New(cfg config.Config, registry *tenant.Registry, verifier *auth.Verifier, sb *supabase.Client, log *slog.Logger) *Server {
	return &Server{
		cfg:      cfg,
		registry: registry,
		verifier: verifier,
		supabase: sb,
		paymark:  payments.NewVerifier(payments.Environment(cfg.PaymarkEnv)),
		log:      log,
	}
}

// Handler builds the full route table.
func (s *Server) Handler() http.Handler {
	mw := &auth.Middleware{Verifier: s.verifier, Registry: s.registry}

	// Unauthenticated: health + control plane (admin API key).
	root := http.NewServeMux()
	root.HandleFunc("GET /health", s.health)
	root.HandleFunc("GET /healthz", s.health)
	root.HandleFunc("POST /v1/admin/tenants", s.adminOnly(s.provisionTenant))
	root.HandleFunc("POST /v1/admin/tenants/migrate", s.adminOnly(s.migrateTenants))
	root.HandleFunc("POST /v1/admin/tenants/{id}/users", s.adminOnly(s.adminUpsertUser))
	root.HandleFunc("GET /v1/admin/tenants", s.adminOnly(s.listTenants))
	root.HandleFunc("DELETE /v1/admin/tenants/{id}", s.adminOnly(s.deleteTenant))

	// Self-serve signup sits outside the tenant middleware: the caller has no
	// workspace yet, so resolving them to one would fail before they could
	// create it. It authenticates the token itself.
	// Payment notifications. Authenticated ONLY by the provider's JWT signature
	// — Paymark holds no Supabase token and no admin key.
	root.HandleFunc("POST /v1/payments/paymark/callback", s.paymarkCallback)
	root.HandleFunc("GET /v1/payments/paymark/health", s.paymarkHealth)
	root.HandleFunc("GET /v1/admin/payment-events", s.adminOnly(s.listPaymentEvents))
	root.HandleFunc("POST /v1/admin/payment-events/{id}/reconcile", s.adminOnly(s.markPaymentEventReconciled))

	root.HandleFunc("POST /v1/signup", s.signup)
	root.HandleFunc("GET /v1/signup/eligibility", s.signupEligibility)

	// Invitation redemption is outside the tenant middleware for the same
	// reason: the invitee has no seat yet. Go 1.22 pattern precedence puts
	// these more specific patterns ahead of the "/v1/" catch-all below.
	root.HandleFunc("GET /v1/invites/{token}", s.previewInvite)
	root.HandleFunc("POST /v1/invites/{token}/accept", s.acceptInvite)

	// Authenticated tenant API.
	api := http.NewServeMux()
	api.HandleFunc("GET /v1/me", s.me)
	api.HandleFunc("GET /v1/workspaces", s.listWorkspaces)

	api.HandleFunc("GET /v1/clients", s.listClients)
	api.HandleFunc("POST /v1/clients", auth.RequireWrite(s.createClient))
	api.HandleFunc("GET /v1/clients/{id}", s.getClient)
	api.HandleFunc("PATCH /v1/clients/{id}", auth.RequireWrite(s.updateClient))
	api.HandleFunc("DELETE /v1/clients/{id}", auth.RequireAdmin(s.deleteClient))
	api.HandleFunc("PUT /v1/clients/{id}/sensitive", s.updateSensitive)

	api.HandleFunc("GET /v1/clients/{id}/consents", s.listConsents)
	api.HandleFunc("POST /v1/clients/{id}/consents", auth.RequireWrite(s.createConsent))
	api.HandleFunc("POST /v1/consents/{id}/withdraw", s.withdrawConsent)

	api.HandleFunc("GET /v1/cases", s.listCases)
	api.HandleFunc("POST /v1/cases", auth.RequireWrite(s.createCase))
	api.HandleFunc("GET /v1/cases/{id}", s.getCase)
	api.HandleFunc("PATCH /v1/cases/{id}", auth.RequireWrite(s.updateCase))
	api.HandleFunc("DELETE /v1/cases/{id}", auth.RequireAdmin(s.deleteCase))

	api.HandleFunc("GET /v1/cases/{id}/notes", s.listNotes)
	api.HandleFunc("POST /v1/cases/{id}/notes", auth.RequireWrite(s.createNote))

	api.HandleFunc("GET /v1/sessions", s.listSessions)
	api.HandleFunc("POST /v1/sessions", auth.RequireWrite(s.createSession))
	api.HandleFunc("PATCH /v1/sessions/{id}", auth.RequireWrite(s.updateSession))
	api.HandleFunc("DELETE /v1/sessions/{id}", auth.RequireAdmin(s.deleteSession))

	api.HandleFunc("GET /v1/stats", s.stats)

	// Customisation — each NGO shapes the CRM to its own programmes.
	api.HandleFunc("GET /v1/field-defs", s.listFieldDefs)
	api.HandleFunc("POST /v1/field-defs", auth.RequireAdmin(s.createFieldDef))
	api.HandleFunc("PATCH /v1/field-defs/{id}", auth.RequireAdmin(s.updateFieldDef))
	api.HandleFunc("DELETE /v1/field-defs/{id}", auth.RequireAdmin(s.archiveFieldDef))

	api.HandleFunc("GET /v1/service-types", s.listServiceTypes)
	api.HandleFunc("PUT /v1/service-types", auth.RequireAdmin(s.upsertServiceType))

	api.HandleFunc("GET /v1/settings", s.getSettings)
	api.HandleFunc("PATCH /v1/settings", auth.RequireAdmin(s.updateSettings))

	api.HandleFunc("GET /v1/documents", s.listDocuments)
	api.HandleFunc("POST /v1/documents", auth.RequireWrite(s.createDocument))
	api.HandleFunc("DELETE /v1/documents/{id}", auth.RequireAdmin(s.deleteDocument))

	// Team seats. The tenant always comes from the principal, never the
	// request — no endpoint here accepts a tenant identifier.
	api.HandleFunc("GET /v1/team", s.listTeam)
	api.HandleFunc("POST /v1/team/invites", auth.RequireAdmin(s.createInvite))
	api.HandleFunc("DELETE /v1/team/invites/{id}", auth.RequireAdmin(s.revokeInvite))
	api.HandleFunc("PATCH /v1/team/members/{user_id}", auth.RequireAdmin(s.updateSeat))
	api.HandleFunc("DELETE /v1/team/members/{user_id}", auth.RequireAdmin(s.removeSeat))

	// Import / export. Admin-only: bulk movement of beneficiary records is the
	// highest-consequence operation in the product.
	api.HandleFunc("GET /v1/export/clients.csv", s.exportClients)
	api.HandleFunc("GET /v1/export/sessions.csv", s.exportSessions)
	api.HandleFunc("POST /v1/import/clients", s.importClients)

	root.Handle("/v1/", mw.Wrap(api))

	return s.cors(root)
}

// ---------------------------------------------------------------------------
// Infrastructure handlers
// ---------------------------------------------------------------------------

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err := s.registry.Pool().Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "degraded", "database": "unreachable",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// adminOnly guards control-plane endpoints with a shared key. If no key is
// configured the endpoints are refused outright rather than left open.
func (s *Server) adminOnly(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.AdminAPIKey == "" {
			writeErr(w, http.StatusServiceUnavailable, "control plane disabled: CRM_ADMIN_API_KEY is not set")
			return
		}
		if subtleCompare(r.Header.Get("X-Admin-Key"), s.cfg.AdminAPIKey) {
			next(w, r)
			return
		}
		writeErr(w, http.StatusUnauthorized, "unauthorized")
	}
}

func (s *Server) provisionTenant(w http.ResponseWriter, r *http.Request) {
	var in tenant.ProvisionInput
	if !decode(w, r, &in) {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.cfg.ProvisionTimeout)
	defer cancel()

	t, err := s.registry.Provision(ctx, in)
	if errors.Is(err, tenant.ErrExists) {
		// Idempotent: signup can be retried without creating a second schema.
		writeJSON(w, http.StatusOK, map[string]any{"tenant": t, "already_existed": true})
		return
	}
	if err != nil {
		s.log.Error("provision failed", "err", err, "org", in.OrganizationID)
		writeErr(w, http.StatusInternalServerError, "provisioning failed")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"tenant": t, "already_existed": false})
}

func (s *Server) migrateTenants(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
	defer cancel()

	migrated, failed, err := s.registry.MigrateAll(ctx)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	status := http.StatusOK
	if failed > 0 {
		status = http.StatusMultiStatus
	}
	writeJSON(w, status, map[string]int{"migrated": migrated, "failed": failed})
}

// adminUpsertUser is the break-glass seat grant: account recovery when a
// charity has locked itself out, and nothing else.
//
// It used to accept ANY role — including owner — with no validation, guarded
// only by the shared admin key, and it wrote nothing the customer could see.
// That made it a silent backdoor into beneficiary health records, and it made
// the Data Processing Addendum's claim that staff "carry no permissions inside
// any customer workspace" untrue.
//
// The endpoint stays, because account recovery is a real need. What changes is
// that it can no longer be used invisibly:
//
//   - a written reason is required, and is recorded;
//   - granting 'owner' needs an explicit break-glass flag, so it cannot happen
//     by fat-finger;
//   - every use is written to the TENANT'S OWN audit log, which their
//     administrators can read, as well as to the platform provisioning log.
//
// The protection is therefore not "we promise not to" — it is "we cannot do it
// without leaving a record in your workspace that you can see".
func (s *Server) adminUpsertUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		UserID string `json:"user_id"`
		Email  string `json:"email"`
		Role   string `json:"role"`
		// Reason is mandatory and ends up in the customer's audit log.
		Reason string `json:"reason"`
		// AllowOwner must be explicitly true to grant ownership.
		AllowOwner bool `json:"allow_owner"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.UserID == "" || in.Role == "" {
		writeErr(w, http.StatusBadRequest, "user_id and role are required")
		return
	}
	if strings.TrimSpace(in.Reason) == "" {
		writeErr(w, http.StatusBadRequest,
			"reason is required: it is recorded in the customer's own audit log")
		return
	}
	if in.Role == "owner" && !in.AllowOwner {
		writeErr(w, http.StatusBadRequest,
			"granting owner requires allow_owner:true — ownership is transferred, not assigned")
		return
	}
	if in.Role != "owner" && !tenant.IsAssignableRole(in.Role) {
		writeErr(w, http.StatusBadRequest, "unknown role")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	tenantID := r.PathValue("id")
	t, err := s.registry.ByID(ctx, tenantID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}

	// Record the intent BEFORE acting, so an attempt that fails part-way is
	// still visible rather than silently absent.
	s.registry.LogProvisioning(ctx, tenantID, "admin_seat_grant",
		fmt.Sprintf("role=%s user=%s reason=%s", in.Role, in.UserID, in.Reason), true)

	if err := s.registry.UpsertUser(ctx, tenantID, in.UserID, in.Email, in.Role); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not assign seat")
		return
	}

	// Write into the CUSTOMER'S audit log. This is the part that matters: a
	// support action they cannot see is indistinguishable from a backdoor.
	if conn, aErr := s.registry.Acquire(ctx, t); aErr == nil {
		auditErr := store.Audit(ctx, conn.Tx, in.UserID, "seat", "", "create", map[string]any{
			"granted_by": "ngoreality_support",
			"role":       in.Role,
			"reason":     in.Reason,
			"note":       "Seat granted by NGOreality support using the break-glass admin path.",
		})
		if auditErr != nil {
			_ = conn.Close(ctx)
			s.log.Error("admin seat grant not audited in tenant log", "err", auditErr, "tenant", tenantID)
		} else if cErr := conn.Commit(ctx); cErr != nil {
			s.log.Error("admin seat grant audit commit failed", "err", cErr, "tenant", tenantID)
		}
	} else {
		s.log.Error("could not open tenant to audit admin seat grant", "err", aErr, "tenant", tenantID)
	}

	s.log.Warn("break-glass seat granted",
		"tenant", tenantID, "user", in.UserID, "role", in.Role, "reason", in.Reason)

	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"audited": true,
		"note":    "Recorded in the customer's audit log.",
	})
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.FromContext(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"user_id":              p.UserID,
		"email":                p.Email,
		"role":                 p.Role,
		"tenant":               p.Tenant,
		"can_write":            p.CanWrite(),
		"can_access_sensitive": p.CanAccessSensitive(),
		"is_admin":             p.IsAdmin(),
	})
}

func (s *Server) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.FromContext(r.Context())
	list, err := s.registry.MembershipsForUser(r.Context(), p.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not list workspaces")
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, m := range list {
		out = append(out, map[string]any{"tenant": m.Tenant, "role": m.Role})
	}
	writeJSON(w, http.StatusOK, map[string]any{"workspaces": out})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// withTenant runs fn inside a transaction pinned to the caller's tenant.
// fn returns the value to serialise; a nil error commits.
func (s *Server) withTenant(w http.ResponseWriter, r *http.Request, fn func(context.Context, pgx.Tx, *auth.Principal) (any, error)) {
	p, ok := auth.FromContext(r.Context())
	if !ok {
		writeErr(w, http.StatusUnauthorized, "unauthenticated")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), s.cfg.StatementTimeout)
	defer cancel()

	conn, err := s.registry.Acquire(ctx, p.Tenant)
	if err != nil {
		if errors.Is(err, tenant.ErrNotActive) {
			writeErr(w, http.StatusForbidden, "workspace is not active")
			return
		}
		s.log.Error("acquire tenant connection", "err", err, "tenant", p.Tenant.ID)
		writeErr(w, http.StatusInternalServerError, "database unavailable")
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = conn.Close(ctx)
		}
	}()

	result, err := fn(ctx, conn.Tx, p)
	if err != nil {
		s.writeStoreErr(w, err)
		return
	}

	if err := conn.Commit(ctx); err != nil {
		s.log.Error("commit", "err", err, "tenant", p.Tenant.ID)
		writeErr(w, http.StatusInternalServerError, "could not save changes")
		return
	}
	committed = true

	if result == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// errForbidden lets a handler reject inside a transaction, after the role is
// known from the record being touched rather than from the route alone.
var errForbidden = errors.New("your role does not permit this")

func (s *Server) writeStoreErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errForbidden):
		writeErr(w, http.StatusForbidden, errForbidden.Error())
	case errors.Is(err, store.ErrNotFound):
		writeErr(w, http.StatusNotFound, "not found")
	case isValidationErr(err):
		writeErr(w, http.StatusBadRequest, err.Error())
	default:
		s.log.Error("store", "err", err)
		writeErr(w, http.StatusInternalServerError, "request failed")
	}
}

// isValidationErr distinguishes user-fixable input problems from faults.
// Store validation returns plain fmt.Errorf values; database faults are
// wrapped pgx errors, which we never surface verbatim.
func isValidationErr(err error) bool {
	var pgErr interface{ SQLState() string }
	if errors.As(err, &pgErr) {
		// 23xxx = integrity constraint violation: the caller's data is wrong.
		return strings.HasPrefix(pgErr.SQLState(), "23")
	}
	return !errors.Is(err, context.DeadlineExceeded) &&
		!errors.Is(err, context.Canceled) &&
		!strings.Contains(err.Error(), ": ")
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	dec := json.NewDecoder(io.LimitReader(r.Body, maxBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func intParam(r *http.Request, key string, fallback int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func timeParam(r *http.Request, key string) *time.Time {
	v := strings.TrimSpace(r.URL.Query().Get(key))
	if v == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		if t, err := time.Parse(layout, v); err == nil {
			return &t
		}
	}
	return nil
}

// subtleCompare is a constant-time string comparison for shared secrets.
func subtleCompare(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var diff byte
	for i := 0; i < len(a); i++ {
		diff |= a[i] ^ b[i]
	}
	return diff == 0
}

func (s *Server) cors(next http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, o := range s.cfg.AllowedOrigins {
		allowed[o] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Tenant-ID, X-Admin-Key")
			w.Header().Set("Access-Control-Max-Age", "86400")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
