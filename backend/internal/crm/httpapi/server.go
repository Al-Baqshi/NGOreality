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
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"ngoreality/backend/internal/crm/auth"
	"ngoreality/backend/internal/crm/config"
	"ngoreality/backend/internal/crm/store"
	"ngoreality/backend/internal/crm/tenant"
)

const maxBody = 1 << 20 // 1 MiB

type Server struct {
	cfg      config.Config
	registry *tenant.Registry
	log      *slog.Logger
}

func New(cfg config.Config, registry *tenant.Registry, log *slog.Logger) *Server {
	return &Server{cfg: cfg, registry: registry, log: log}
}

// Handler builds the full route table.
func (s *Server) Handler() http.Handler {
	mw := &auth.Middleware{
		Verifier: auth.NewVerifier(s.cfg.SupabaseJWTSecret, s.cfg.SupabaseProjectRef),
		Registry: s.registry,
	}

	// Unauthenticated: health + control plane (admin API key).
	root := http.NewServeMux()
	root.HandleFunc("GET /health", s.health)
	root.HandleFunc("GET /healthz", s.health)
	root.HandleFunc("POST /v1/admin/tenants", s.adminOnly(s.provisionTenant))
	root.HandleFunc("POST /v1/admin/tenants/migrate", s.adminOnly(s.migrateTenants))
	root.HandleFunc("POST /v1/admin/tenants/{id}/users", s.adminOnly(s.adminUpsertUser))

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

func (s *Server) adminUpsertUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		UserID string `json:"user_id"`
		Email  string `json:"email"`
		Role   string `json:"role"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.UserID == "" || in.Role == "" {
		writeErr(w, http.StatusBadRequest, "user_id and role are required")
		return
	}
	if err := s.registry.UpsertUser(r.Context(), r.PathValue("id"), in.UserID, in.Email, in.Role); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not assign seat")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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
