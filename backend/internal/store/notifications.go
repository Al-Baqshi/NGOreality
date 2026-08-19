package store

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type NotificationEvent struct {
	ID               string
	OrganizationID   string
	IncidentID       *string
	Template         string
	RecipientEmail   string
	Subject          string
	BodyText         string
	Status           string
	ErrorMessage     string
	CreatedAt        time.Time
	OrganizationName string
}

func (s *Store) HasActiveMembership(ctx context.Context, orgID string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `SELECT public.has_active_membership($1)`, orgID).Scan(&ok)
	return ok, err
}

func (s *Store) OrganizationAlertTarget(ctx context.Context, orgID string) (email, orgName string, err error) {
	err = s.pool.QueryRow(ctx, `
		SELECT
		  coalesce(nullif(trim(o.email), ''), nullif(trim(c.email), ''), ''),
		  o.name
		FROM organizations o
		LEFT JOIN LATERAL (
		  SELECT email FROM contacts
		  WHERE organization_id = o.id AND is_primary = true
		  ORDER BY created_at
		  LIMIT 1
		) c ON true
		WHERE o.id = $1
	`, orgID).Scan(&email, &orgName)
	if err != nil {
		return "", "", err
	}
	email = strings.TrimSpace(email)
	orgName = strings.TrimSpace(orgName)
	if email == "" {
		return "", orgName, fmt.Errorf("no alert email for organization")
	}
	return email, orgName, nil
}

func (s *Store) HasPendingSiteDownNotification(ctx context.Context, orgID string) (bool, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT count(*)::int FROM notification_events
		WHERE organization_id = $1
		  AND template = 'site_down'
		  AND status IN ('pending', 'sent')
		  AND created_at > now() - interval '24 hours'
	`, orgID).Scan(&n)
	return n > 0, err
}

func (s *Store) InsertNotificationEvent(ctx context.Context, orgID string, incidentID *string, template, recipientEmail, subject, body string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO notification_events (
		  organization_id, incident_id, template, recipient_email, subject, body_text, status
		) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
	`, orgID, incidentID, template, recipientEmail, subject, body)
	return err
}

func siteDownEmail(orgName string) (subject, body string) {
	subject = fmt.Sprintf("[NGOreality] Website down — %s", orgName)
	body = strings.Join([]string{
		"Hello,",
		"",
		fmt.Sprintf("Our monitors detected that the website for %s is not responding.", orgName),
		"",
		"As an NGOreality member you receive this alert automatically. If you need hands-on help fixing the issue, reply to this email — support is billed separately from your annual membership.",
		"",
		"— NGOreality monitoring",
	}, "\n")
	return subject, body
}

// QueueSiteDownAlert enqueues a down alert for paying members (deduped per 24h).
func (s *Store) QueueSiteDownAlert(ctx context.Context, orgID, incidentID string) error {
	active, err := s.HasActiveMembership(ctx, orgID)
	if err != nil || !active {
		return err
	}
	dup, err := s.HasPendingSiteDownNotification(ctx, orgID)
	if err != nil || dup {
		return err
	}
	email, orgName, err := s.OrganizationAlertTarget(ctx, orgID)
	if err != nil {
		return err
	}
	subject, body := siteDownEmail(orgName)
	inc := incidentID
	return s.InsertNotificationEvent(ctx, orgID, &inc, "site_down", email, subject, body)
}

func (s *Store) ListPendingNotifications(ctx context.Context, limit int) ([]NotificationEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT
		  n.id, n.organization_id, n.incident_id, n.template,
		  n.recipient_email, n.subject, n.body_text, n.status,
		  coalesce(n.error_message, ''), n.created_at,
		  coalesce(o.name, '')
		FROM notification_events n
		LEFT JOIN organizations o ON o.id = n.organization_id
		WHERE n.status = 'pending'
		ORDER BY n.created_at ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []NotificationEvent
	for rows.Next() {
		var e NotificationEvent
		var incidentID *string
		if err := rows.Scan(
			&e.ID, &e.OrganizationID, &incidentID, &e.Template,
			&e.RecipientEmail, &e.Subject, &e.BodyText, &e.Status,
			&e.ErrorMessage, &e.CreatedAt, &e.OrganizationName,
		); err != nil {
			return nil, err
		}
		e.IncidentID = incidentID
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) MarkNotificationSent(ctx context.Context, id string, incidentID *string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		UPDATE notification_events
		SET status = 'sent', sent_at = now(), error_message = ''
		WHERE id = $1
	`, id)
	if err != nil {
		return err
	}
	if incidentID != nil && *incidentID != "" {
		_, err = tx.Exec(ctx, `
			UPDATE website_incidents
			SET org_notified_at = now()
			WHERE id = $1 AND org_notified_at IS NULL
		`, *incidentID)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) MarkNotificationFailed(ctx context.Context, id, errMsg string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE notification_events
		SET status = 'failed', error_message = $2
		WHERE id = $1
	`, id, errMsg)
	return err
}

func (s *Store) RequeueNotification(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE notification_events
		SET status = 'pending', error_message = '', sent_at = NULL
		WHERE id = $1 AND status = 'failed'
	`, id)
	return err
}

// NotificationSummary counts by status for CRM dashboard.
type NotificationSummary struct {
	Pending int `json:"pending"`
	Sent    int `json:"sent"`
	Failed  int `json:"failed"`
}

func (s *Store) NotificationSummary(ctx context.Context) (NotificationSummary, error) {
	var sum NotificationSummary
	err := s.pool.QueryRow(ctx, `
		SELECT
		  count(*) FILTER (WHERE status = 'pending')::int,
		  count(*) FILTER (WHERE status = 'sent')::int,
		  count(*) FILTER (WHERE status = 'failed')::int
		FROM notification_events
		WHERE created_at > now() - interval '30 days'
	`).Scan(&sum.Pending, &sum.Sent, &sum.Failed)
	return sum, err
}

// ListRecentNotifications for CRM (all statuses).
func (s *Store) ListRecentNotifications(ctx context.Context, limit int) ([]NotificationEvent, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.pool.Query(ctx, `
		SELECT
		  n.id, n.organization_id, n.incident_id, n.template,
		  n.recipient_email, n.subject, n.body_text, n.status,
		  coalesce(n.error_message, ''), n.created_at,
		  coalesce(o.name, '')
		FROM notification_events n
		LEFT JOIN organizations o ON o.id = n.organization_id
		ORDER BY n.created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []NotificationEvent
	for rows.Next() {
		var e NotificationEvent
		var incidentID *string
		if err := rows.Scan(
			&e.ID, &e.OrganizationID, &incidentID, &e.Template,
			&e.RecipientEmail, &e.Subject, &e.BodyText, &e.Status,
			&e.ErrorMessage, &e.CreatedAt, &e.OrganizationName,
		); err != nil {
			return nil, err
		}
		e.IncidentID = incidentID
		out = append(out, e)
	}
	return out, rows.Err()
}

// OpenIncidentsWithoutOrgNotify lists open incidents where member org was not emailed yet.
func (s *Store) OpenIncidentsNeedingNotify(ctx context.Context, limit int) ([]struct {
	IncidentID     string
	OrganizationID string
}, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT i.id, i.organization_id
		FROM website_incidents i
		WHERE i.closed_at IS NULL
		  AND i.org_notified_at IS NULL
		  AND public.has_active_membership(i.organization_id)
		ORDER BY i.opened_at ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []struct {
		IncidentID     string
		OrganizationID string
	}
	for rows.Next() {
		var row struct {
			IncidentID     string
			OrganizationID string
		}
		if err := rows.Scan(&row.IncidentID, &row.OrganizationID); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
