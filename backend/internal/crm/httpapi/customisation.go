package httpapi

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"ngoreality/backend/internal/crm/auth"
	"ngoreality/backend/internal/crm/store"
)

// maxImportBytes caps an uploaded CSV. Large enough for a real caseload,
// small enough that a single request cannot exhaust memory.
const maxImportBytes = 16 << 20 // 16 MiB

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

func (s *Server) listFieldDefs(w http.ResponseWriter, r *http.Request) {
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		items, err := store.ListFieldDefs(ctx, tx, r.URL.Query().Get("entity"),
			r.URL.Query().Get("include_archived") == "true")
		if err != nil {
			return nil, err
		}
		// A volunteer or viewer must not even learn that a sensitive field
		// exists — its label can itself be revealing.
		if !p.CanAccessSensitive() {
			visible := items[:0]
			for _, f := range items {
				if !f.Sensitive {
					visible = append(visible, f)
				}
			}
			items = visible
		}
		return map[string]any{"items": items}, nil
	})
}

func (s *Server) createFieldDef(w http.ResponseWriter, r *http.Request) {
	var in store.FieldDefInput
	if !decode(w, r, &in) {
		return
	}
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		f, err := store.CreateFieldDef(ctx, tx, in)
		if err != nil {
			return nil, err
		}
		return f, store.Audit(ctx, tx, p.UserID, "field_def", f.ID, "create", nil)
	})
}

func (s *Server) updateFieldDef(w http.ResponseWriter, r *http.Request) {
	var in store.FieldDefInput
	if !decode(w, r, &in) {
		return
	}
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		f, err := store.UpdateFieldDef(ctx, tx, id, in)
		if err != nil {
			return nil, err
		}
		return f, store.Audit(ctx, tx, p.UserID, "field_def", id, "update", nil)
	})
}

func (s *Server) archiveFieldDef(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		if err := store.ArchiveFieldDef(ctx, tx, id); err != nil {
			return nil, err
		}
		return map[string]string{"status": "archived"},
			store.Audit(ctx, tx, p.UserID, "field_def", id, "update", nil)
	})
}

// ---------------------------------------------------------------------------
// Service types
// ---------------------------------------------------------------------------

func (s *Server) listServiceTypes(w http.ResponseWriter, r *http.Request) {
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		items, err := store.ListServiceTypes(ctx, tx, r.URL.Query().Get("include_inactive") == "true")
		if err != nil {
			return nil, err
		}
		return map[string]any{"items": items}, nil
	})
}

func (s *Server) upsertServiceType(w http.ResponseWriter, r *http.Request) {
	var in store.ServiceTypeInput
	if !decode(w, r, &in) {
		return
	}
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		st, err := store.UpsertServiceType(ctx, tx, in)
		if err != nil {
			return nil, err
		}
		return st, store.Audit(ctx, tx, p.UserID, "service_type", st.ID, "update", nil)
	})
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		return store.GetSettings(ctx, tx)
	})
}

func (s *Server) updateSettings(w http.ResponseWriter, r *http.Request) {
	var in store.SettingsInput
	if !decode(w, r, &in) {
		return
	}
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		st, err := store.UpdateSettings(ctx, tx, in)
		if err != nil {
			return nil, err
		}
		return st, store.Audit(ctx, tx, p.UserID, "settings", "", "update", nil)
	})
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

func (s *Server) listDocuments(w http.ResponseWriter, r *http.Request) {
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		items, err := store.ListDocuments(ctx, tx,
			r.URL.Query().Get("client_id"), r.URL.Query().Get("case_id"),
			p.CanAccessSensitive())
		if err != nil {
			return nil, err
		}
		return map[string]any{"items": items}, nil
	})
}

func (s *Server) createDocument(w http.ResponseWriter, r *http.Request) {
	var in store.DocumentInput
	if !decode(w, r, &in) {
		return
	}
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		// Registering a restricted document requires the sensitive role,
		// otherwise a volunteer could attach a file they cannot list.
		if in.Sensitivity == "restricted" && !p.CanAccessSensitive() {
			return nil, errForbidden
		}
		d, err := store.CreateDocument(ctx, tx, in, p.UserID)
		if err != nil {
			return nil, err
		}
		return d, store.Audit(ctx, tx, p.UserID, "document", d.ID, "create", nil)
	})
}

func (s *Server) deleteDocument(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		if err := store.Audit(ctx, tx, p.UserID, "document", id, "delete", nil); err != nil {
			return nil, err
		}
		return nil, store.DeleteDocument(ctx, tx, id)
	})
}

// ---------------------------------------------------------------------------
// Export
//
// Buffered rather than streamed: the whole export happens inside the tenant
// transaction, so a mid-stream failure must not leave a half-written file that
// looks complete. Caseload-sized data comfortably fits.
// ---------------------------------------------------------------------------

func (s *Server) exportClients(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.FromContext(r.Context())
	if !ok || !p.IsAdmin() {
		writeErr(w, http.StatusForbidden, "administrator role required to export")
		return
	}

	var buf bytes.Buffer
	var rowCount int

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()

	conn, err := s.registry.Acquire(ctx, p.Tenant)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "database unavailable")
		return
	}
	defer func() { _ = conn.Close(ctx) }()

	rowCount, err = store.ExportClients(ctx, conn.Tx, &buf, p.CanAccessSensitive())
	if err != nil {
		s.log.Error("export clients", "err", err, "tenant", p.Tenant.ID)
		writeErr(w, http.StatusInternalServerError, "export failed")
		return
	}
	// An export of beneficiary records is exactly the event an audit log exists for.
	if err := store.Audit(ctx, conn.Tx, p.UserID, "client", "", "export",
		map[string]any{"rows": rowCount, "included_sensitive": p.CanAccessSensitive()}); err != nil {
		writeErr(w, http.StatusInternalServerError, "export failed")
		return
	}
	if err := conn.Commit(ctx); err != nil {
		writeErr(w, http.StatusInternalServerError, "export failed")
		return
	}

	filename := fmt.Sprintf("clients-%s.csv", time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("X-Row-Count", fmt.Sprint(rowCount))
	_, _ = w.Write(buf.Bytes())
}

func (s *Server) exportSessions(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.FromContext(r.Context())
	if !ok || !p.IsAdmin() {
		writeErr(w, http.StatusForbidden, "administrator role required to export")
		return
	}

	to := timeParam(r, "to")
	if to == nil {
		now := time.Now()
		to = &now
	}
	from := timeParam(r, "from")
	if from == nil {
		f := to.AddDate(-1, 0, 0)
		from = &f
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()

	conn, err := s.registry.Acquire(ctx, p.Tenant)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "database unavailable")
		return
	}
	defer func() { _ = conn.Close(ctx) }()

	var buf bytes.Buffer
	rowCount, err := store.ExportSessions(ctx, conn.Tx, &buf, *from, *to)
	if err != nil {
		s.log.Error("export sessions", "err", err, "tenant", p.Tenant.ID)
		writeErr(w, http.StatusInternalServerError, "export failed")
		return
	}
	if err := store.Audit(ctx, conn.Tx, p.UserID, "session", "", "export",
		map[string]any{"rows": rowCount, "from": from, "to": to}); err != nil {
		writeErr(w, http.StatusInternalServerError, "export failed")
		return
	}
	if err := conn.Commit(ctx); err != nil {
		writeErr(w, http.StatusInternalServerError, "export failed")
		return
	}

	filename := fmt.Sprintf("sessions-%s-to-%s.csv", from.Format("2006-01-02"), to.Format("2006-01-02"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("X-Row-Count", fmt.Sprint(rowCount))
	_, _ = w.Write(buf.Bytes())
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

// importClients accepts a raw CSV body. Everything commits together, so a
// failure part-way leaves no partially imported caseload.
func (s *Server) importClients(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxImportBytes+1))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "could not read the uploaded file")
		return
	}
	if len(body) > maxImportBytes {
		writeErr(w, http.StatusRequestEntityTooLarge,
			"file is larger than 16 MB — split it and import in parts")
		return
	}
	if len(bytes.TrimSpace(body)) == 0 {
		writeErr(w, http.StatusBadRequest, "the uploaded file is empty")
		return
	}

	p, ok := auth.FromContext(r.Context())
	if !ok || !p.IsAdmin() {
		writeErr(w, http.StatusForbidden, "administrator role required to import")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()

	conn, err := s.registry.Acquire(ctx, p.Tenant)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "database unavailable")
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = conn.Close(ctx)
		}
	}()

	result, err := store.ImportClients(ctx, conn.Tx, bytes.NewReader(body), p.UserID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := store.Audit(ctx, conn.Tx, p.UserID, "client", "", "create",
		map[string]any{"imported": result.Imported, "skipped": result.Skipped}); err != nil {
		writeErr(w, http.StatusInternalServerError, "import failed")
		return
	}
	if err := conn.Commit(ctx); err != nil {
		writeErr(w, http.StatusInternalServerError, "import failed")
		return
	}
	committed = true

	writeJSON(w, http.StatusOK, result)
}
