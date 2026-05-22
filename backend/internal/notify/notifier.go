package notify

import (
	"context"
	"log/slog"

	"ngoreality/backend/internal/config"
	"ngoreality/backend/internal/store"
)

type Notifier struct {
	log    *slog.Logger
	resend *ResendClient
}

func New(log *slog.Logger, cfg config.Config) *Notifier {
	if log == nil {
		log = slog.Default()
	}
	return &Notifier{
		log:    log,
		resend: NewResendClient(cfg.ResendAPIKey, cfg.NotifyFromEmail, cfg.NotifyStaffEmail),
	}
}

type ProcessResult struct {
	Sent    int
	Failed  int
	Skipped int
}

// ProcessPending sends queued notification_events via Resend.
func (n *Notifier) ProcessPending(ctx context.Context, st *store.Store, batchSize int) (ProcessResult, error) {
	var result ProcessResult
	if !n.resend.Enabled() {
		n.log.Debug("notify: RESEND_API_KEY or NOTIFY_FROM_EMAIL not set — skipping send")
		return result, nil
	}

	events, err := st.ListPendingNotifications(ctx, batchSize)
	if err != nil {
		return result, err
	}
	if len(events) == 0 {
		return result, nil
	}

	for _, e := range events {
		if err := n.resend.Send(ctx, e.RecipientEmail, e.Subject, e.BodyText); err != nil {
			_ = st.MarkNotificationFailed(ctx, e.ID, err.Error())
			result.Failed++
			n.log.Warn("notification send failed", "id", e.ID, "template", e.Template, "err", err)
			continue
		}
		if err := st.MarkNotificationSent(ctx, e.ID, e.IncidentID); err != nil {
			n.log.Error("mark notification sent", "id", e.ID, "err", err)
			result.Failed++
			continue
		}
		result.Sent++
		n.log.Info("notification sent", "id", e.ID, "template", e.Template, "to", e.RecipientEmail)
	}

	return result, nil
}

// BackfillOpenIncidents queues site_down emails for open incidents (e.g. after deploy).
func (n *Notifier) BackfillOpenIncidents(ctx context.Context, st *store.Store, limit int) (int, error) {
	rows, err := st.OpenIncidentsNeedingNotify(ctx, limit)
	if err != nil {
		return 0, err
	}
	queued := 0
	for _, row := range rows {
		if err := st.QueueSiteDownAlert(ctx, row.OrganizationID, row.IncidentID); err != nil {
			n.log.Debug("backfill skip", "org", row.OrganizationID, "err", err)
			continue
		}
		queued++
	}
	return queued, nil
}

// ProcessOpenIncidents runs backfill + pending send (worker entrypoint).
func (n *Notifier) ProcessOpenIncidents(ctx context.Context, st *store.Store) error {
	if queued, err := n.BackfillOpenIncidents(ctx, st, 100); err != nil {
		return err
	} else if queued > 0 {
		n.log.Info("queued site_down backfill", "count", queued)
	}

	result, err := n.ProcessPending(ctx, st, 50)
	if err != nil {
		return err
	}
	if result.Sent > 0 || result.Failed > 0 {
		n.log.Info("notifications processed", "sent", result.Sent, "failed", result.Failed)
	}
	return nil
}
