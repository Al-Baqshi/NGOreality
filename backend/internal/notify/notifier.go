package notify

import (
	"context"
	"log/slog"

	"ngoreality/backend/internal/store"
)

// Notifier sends staff/org alerts for incidents. Email integration is stubbed for a later pass.
type Notifier struct {
	log *slog.Logger
}

func New(log *slog.Logger) *Notifier {
	if log == nil {
		log = slog.Default()
	}
	return &Notifier{log: log}
}

func (n *Notifier) ProcessOpenIncidents(ctx context.Context, st *store.Store) error {
	_ = ctx
	_ = st
	// TODO: query website_incidents where staff_notified_at IS NULL, send via Resend, mark notified.
	n.log.Debug("notify: no providers configured")
	return nil
}
