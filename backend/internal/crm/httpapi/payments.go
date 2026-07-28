package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"ngoreality/backend/internal/crm/payments"
)

// maxCallbackBody caps a webhook body. Signed JWTs are small; anything larger
// is a mistake or an attack.
const maxCallbackBody = 64 << 10 // 64 KiB

// paymarkCallback receives Paymark's payment notification.
//
// Deliberately NOT behind the tenant middleware or the admin key: the caller is
// Paymark, which has neither a Supabase token nor our admin secret. Its
// authenticity comes entirely from the JWT signature, verified against
// Paymark's published JWKS. That is the ONLY thing that authorises this
// endpoint — so if verification fails, nothing is written, ever.
//
// The endpoint answers 200 for anything it has durably recorded, including a
// duplicate. Webhook senders retry on non-2xx, and retrying a message we
// already stored achieves nothing but noise.
func (s *Server) paymarkCallback(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxCallbackBody+1))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "could not read body")
		return
	}
	if len(body) > maxCallbackBody {
		writeErr(w, http.StatusRequestEntityTooLarge, "body too large")
		return
	}

	token := extractCallbackToken(body, r)
	if token == "" {
		s.log.Warn("paymark callback with no token", "content_type", r.Header.Get("Content-Type"))
		writeErr(w, http.StatusBadRequest, "no signed token in request")
		return
	}

	note, err := s.paymark.Verify(token)
	if err != nil {
		// Log loudly: a genuine Paymark callback failing verification means a
		// key rotation or an environment mismatch, and payments are silently
		// not being recorded.
		s.log.Error("paymark callback failed verification", "err", err)
		writeErr(w, http.StatusUnauthorized, "signature verification failed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	amount, amountErr := note.AmountCents()
	var amountArg any
	if amountErr == nil {
		amountArg = amount
	}
	currency := note.Currency
	if currency == "" {
		currency = "NZD"
	}

	payload := note.Raw
	if payload == nil {
		payload = map[string]any{}
	}

	// ON CONFLICT DO NOTHING makes redelivery a no-op. The provider's own
	// transaction id is the idempotency key.
	tag, err := s.registry.Pool().Exec(ctx, `
		INSERT INTO platform.payment_events
			(provider, provider_txn_id, merchant_ref, status, succeeded,
			 amount_cents, currency, payload)
		VALUES ('paymark', $1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (provider, provider_txn_id) DO NOTHING`,
		note.TransactionID, note.Reference, note.Status, note.Succeeded(),
		amountArg, currency, payload)
	if err != nil {
		// A 5xx asks Paymark to retry, which is what we want when the failure
		// is ours.
		s.log.Error("could not record payment event", "err", err, "txn", note.TransactionID)
		writeErr(w, http.StatusInternalServerError, "could not record notification")
		return
	}

	duplicate := tag.RowsAffected() == 0
	s.log.Info("paymark callback recorded",
		"txn", note.TransactionID, "ref", note.Reference,
		"status", note.Status, "succeeded", note.Succeeded(), "duplicate", duplicate)

	writeJSON(w, http.StatusOK, map[string]any{
		"received":  true,
		"duplicate": duplicate,
	})
}

// extractCallbackToken finds the signed JWT.
//
// The exact delivery shape is not confirmed against a live sandbox callback
// yet, so accept the three plausible forms rather than guessing one and
// silently dropping real payments: a bare JWT body, a JSON object carrying it
// under a common key, or a form field.
func extractCallbackToken(body []byte, r *http.Request) string {
	trimmed := strings.TrimSpace(string(body))

	// A bare compact JWS: three base64url segments, no JSON, no spaces.
	if strings.Count(trimmed, ".") == 2 && !strings.HasPrefix(trimmed, "{") &&
		!strings.ContainsAny(trimmed, " \t\n") {
		return trimmed
	}

	if strings.HasPrefix(trimmed, "{") {
		var obj map[string]any
		if json.Unmarshal(body, &obj) == nil {
			for _, key := range []string{"token", "jwt", "notification", "payload", "data", "message"} {
				if v, ok := obj[key].(string); ok && strings.Count(v, ".") == 2 {
					return v
				}
			}
		}
		return ""
	}

	if err := r.ParseForm(); err == nil {
		for _, key := range []string{"token", "jwt", "notification", "payload"} {
			if v := strings.TrimSpace(r.PostFormValue(key)); strings.Count(v, ".") == 2 {
				return v
			}
		}
	}
	return ""
}

// listPaymentEvents lets staff reconcile received notifications against the
// membership ledger. Admin-key guarded — this is platform finance, not tenant data.
func (s *Server) listPaymentEvents(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	limit := intParam(r, "limit", 100)
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	onlyUnreconciled := r.URL.Query().Get("unreconciled") == "true"

	rows, err := s.registry.Pool().Query(ctx, `
		SELECT id, provider, provider_txn_id, merchant_ref, status, succeeded,
		       amount_cents, currency, reconciled_at, received_at
		  FROM platform.payment_events
		 WHERE ($1 = false OR reconciled_at IS NULL)
		 ORDER BY received_at DESC
		 LIMIT $2`, onlyUnreconciled, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not list payment events")
		return
	}
	defer rows.Close()

	type event struct {
		ID           string     `json:"id"`
		Provider     string     `json:"provider"`
		TxnID        string     `json:"provider_txn_id"`
		MerchantRef  string     `json:"merchant_ref"`
		Status       string     `json:"status"`
		Succeeded    bool       `json:"succeeded"`
		AmountCents  *int64     `json:"amount_cents"`
		Currency     string     `json:"currency"`
		ReconciledAt *time.Time `json:"reconciled_at"`
		ReceivedAt   time.Time  `json:"received_at"`
	}

	out := []event{}
	for rows.Next() {
		var e event
		if err := rows.Scan(&e.ID, &e.Provider, &e.TxnID, &e.MerchantRef, &e.Status,
			&e.Succeeded, &e.AmountCents, &e.Currency, &e.ReconciledAt, &e.ReceivedAt); err != nil {
			writeErr(w, http.StatusInternalServerError, "could not read payment events")
			return
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not read payment events")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"events": out})
}

// markPaymentEventReconciled records that a notification has been acted on.
func (s *Server) markPaymentEventReconciled(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Note string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	tag, err := s.registry.Pool().Exec(ctx, `
		UPDATE platform.payment_events
		   SET reconciled_at = now(), reconciled_note = $2
		 WHERE id = $1 AND reconciled_at IS NULL`, r.PathValue("id"), in.Note)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update payment event")
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, "not found, or already reconciled")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "reconciled"})
}

// paymarkHealth reports whether Paymark's signing keys are reachable, so a
// misconfigured environment is visible before a real payment arrives.
func (s *Server) paymarkHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.paymark.Warm(); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"jwks":        "unreachable",
			"environment": string(s.cfg.PaymarkEnv),
			"url":         payments.Environment(s.cfg.PaymarkEnv).JWKSURL(),
			"error":       err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"jwks":        "ok",
		"environment": string(s.cfg.PaymarkEnv),
		"url":         payments.Environment(s.cfg.PaymarkEnv).JWKSURL(),
	})
}
