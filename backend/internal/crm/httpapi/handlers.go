package httpapi

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"ngoreality/backend/internal/crm/auth"
	"ngoreality/backend/internal/crm/store"
)

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

func (s *Server) listClients(w http.ResponseWriter, r *http.Request) {
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		return store.ListClients(ctx, tx, store.ClientFilter{
			Search: r.URL.Query().Get("search"),
			Status: r.URL.Query().Get("status"),
			Limit:  intParam(r, "limit", 50),
			Offset: intParam(r, "offset", 0),
		})
	})
}

func (s *Server) getClient(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		// Sensitive attributes are fetched only for permitted roles; for
		// everyone else the columns are never selected at all.
		c, err := store.GetClient(ctx, tx, id, p.CanAccessSensitive())
		if err != nil {
			return nil, err
		}
		// Opening a beneficiary record is an access event worth recording.
		if err := store.Audit(ctx, tx, p.UserID, "client", id, "read", nil); err != nil {
			return nil, err
		}
		return c, nil
	})
}

func (s *Server) createClient(w http.ResponseWriter, r *http.Request) {
	var in store.ClientInput
	if !decode(w, r, &in) {
		return
	}
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		c, err := store.CreateClient(ctx, tx, in, p.UserID)
		if err != nil {
			return nil, err
		}
		return c, store.Audit(ctx, tx, p.UserID, "client", c.ID, "create", nil)
	})
}

func (s *Server) updateClient(w http.ResponseWriter, r *http.Request) {
	var in store.ClientInput
	if !decode(w, r, &in) {
		return
	}
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		c, err := store.UpdateClient(ctx, tx, id, in)
		if err != nil {
			return nil, err
		}
		return c, store.Audit(ctx, tx, p.UserID, "client", id, "update", nil)
	})
}

func (s *Server) deleteClient(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		if err := store.Audit(ctx, tx, p.UserID, "client", id, "delete", nil); err != nil {
			return nil, err
		}
		return nil, store.DeleteClient(ctx, tx, id)
	})
}

// updateSensitive is gated on the sensitive role rather than plain write:
// a volunteer may edit a client but never their health or legal details.
func (s *Server) updateSensitive(w http.ResponseWriter, r *http.Request) {
	var in store.SensitiveInput
	if !decode(w, r, &in) {
		return
	}
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		if !p.CanAccessSensitive() {
			return nil, errForbidden
		}
		if err := store.UpsertClientSensitive(ctx, tx, id, in); err != nil {
			return nil, err
		}
		return map[string]string{"status": "ok"},
			store.Audit(ctx, tx, p.UserID, "client_sensitive", id, "update", nil)
	})
}

// ---------------------------------------------------------------------------
// Consents
// ---------------------------------------------------------------------------

func (s *Server) listConsents(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		items, err := store.ListConsents(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		return map[string]any{"items": items}, nil
	})
}

func (s *Server) createConsent(w http.ResponseWriter, r *http.Request) {
	var in store.ConsentInput
	if !decode(w, r, &in) {
		return
	}
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		c, err := store.CreateConsent(ctx, tx, id, in, p.UserID)
		if err != nil {
			return nil, err
		}
		return c, store.Audit(ctx, tx, p.UserID, "consent", c.ID, "create", nil)
	})
}

func (s *Server) withdrawConsent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		if !p.CanAccessSensitive() {
			return nil, errForbidden
		}
		if err := store.WithdrawConsent(ctx, tx, id); err != nil {
			return nil, err
		}
		return map[string]string{"status": "withdrawn"},
			store.Audit(ctx, tx, p.UserID, "consent", id, "update", nil)
	})
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

func (s *Server) listCases(w http.ResponseWriter, r *http.Request) {
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		return store.ListCases(ctx, tx, store.CaseFilter{
			ClientID:   r.URL.Query().Get("client_id"),
			Status:     r.URL.Query().Get("status"),
			AssignedTo: r.URL.Query().Get("assigned_to"),
			Search:     r.URL.Query().Get("search"),
			Limit:      intParam(r, "limit", 50),
			Offset:     intParam(r, "offset", 0),
		})
	})
}

func (s *Server) getCase(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		c, err := store.GetCase(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		return c, store.Audit(ctx, tx, p.UserID, "case", id, "read", nil)
	})
}

func (s *Server) createCase(w http.ResponseWriter, r *http.Request) {
	var in store.CaseInput
	if !decode(w, r, &in) {
		return
	}
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		c, err := store.CreateCase(ctx, tx, in, p.UserID)
		if err != nil {
			return nil, err
		}
		return c, store.Audit(ctx, tx, p.UserID, "case", c.ID, "create", nil)
	})
}

func (s *Server) updateCase(w http.ResponseWriter, r *http.Request) {
	var in store.CaseInput
	if !decode(w, r, &in) {
		return
	}
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		c, err := store.UpdateCase(ctx, tx, id, in)
		if err != nil {
			return nil, err
		}
		return c, store.Audit(ctx, tx, p.UserID, "case", id, "update", nil)
	})
}

func (s *Server) deleteCase(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		if err := store.Audit(ctx, tx, p.UserID, "case", id, "delete", nil); err != nil {
			return nil, err
		}
		return nil, store.DeleteCase(ctx, tx, id)
	})
}

// ---------------------------------------------------------------------------
// Case notes
// ---------------------------------------------------------------------------

func (s *Server) listNotes(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		items, err := store.ListCaseNotes(ctx, tx, id, p.CanAccessSensitive())
		if err != nil {
			return nil, err
		}
		return map[string]any{"items": items}, nil
	})
}

func (s *Server) createNote(w http.ResponseWriter, r *http.Request) {
	var in store.NoteInput
	if !decode(w, r, &in) {
		return
	}
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		// Writing a restricted note requires the sensitive role, otherwise a
		// volunteer could author notes they cannot read back.
		if in.Visibility == "restricted" && !p.CanAccessSensitive() {
			return nil, errForbidden
		}
		n, err := store.CreateCaseNote(ctx, tx, id, in, p.UserID)
		if err != nil {
			return nil, err
		}
		return n, store.Audit(ctx, tx, p.UserID, "case_note", n.ID, "create", nil)
	})
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

func (s *Server) listSessions(w http.ResponseWriter, r *http.Request) {
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		return store.ListSessions(ctx, tx, store.SessionFilter{
			ClientID: r.URL.Query().Get("client_id"),
			CaseID:   r.URL.Query().Get("case_id"),
			From:     timeParam(r, "from"),
			To:       timeParam(r, "to"),
			Limit:    intParam(r, "limit", 50),
			Offset:   intParam(r, "offset", 0),
		})
	})
}

func (s *Server) createSession(w http.ResponseWriter, r *http.Request) {
	var in store.SessionInput
	if !decode(w, r, &in) {
		return
	}
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		sess, err := store.CreateSession(ctx, tx, in, p.UserID)
		if err != nil {
			return nil, err
		}
		return sess, store.Audit(ctx, tx, p.UserID, "session", sess.ID, "create", nil)
	})
}

func (s *Server) updateSession(w http.ResponseWriter, r *http.Request) {
	var in store.SessionInput
	if !decode(w, r, &in) {
		return
	}
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		sess, err := store.UpdateSession(ctx, tx, id, in)
		if err != nil {
			return nil, err
		}
		return sess, store.Audit(ctx, tx, p.UserID, "session", id, "update", nil)
	})
}

func (s *Server) deleteSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		if err := store.Audit(ctx, tx, p.UserID, "session", id, "delete", nil); err != nil {
			return nil, err
		}
		return nil, store.DeleteSession(ctx, tx, id)
	})
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

func (s *Server) stats(w http.ResponseWriter, r *http.Request) {
	from := timeParam(r, "from")
	to := timeParam(r, "to")
	if to == nil {
		now := time.Now()
		to = &now
	}
	if from == nil {
		f := to.AddDate(0, -3, 0)
		from = &f
	}

	s.withTenant(w, r, func(ctx context.Context, tx pgx.Tx, p *auth.Principal) (any, error) {
		st, err := store.Stats(ctx, tx, *from, *to)
		if err != nil {
			return nil, err
		}
		return st, store.Audit(ctx, tx, p.UserID, "report", "", "export", map[string]any{
			"from": from, "to": to,
		})
	})
}
