package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = 10
	cfg.MinConns = 1
	// Supabase transaction pooler (pgbouncer) requires simple protocol for prepared statements.
	if cfg.ConnConfig != nil {
		cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	}
	if cfg.ConnConfig.Config.RuntimeParams == nil {
		cfg.ConnConfig.Config.RuntimeParams = map[string]string{}
	}
	if cfg.ConnConfig.Config.RuntimeParams["sslmode"] == "" {
		cfg.ConnConfig.Config.RuntimeParams["sslmode"] = "require"
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

type OrgWebsite struct {
	OrganizationID string
	Name           string
	WebsiteURL     string
	Status         string
}

type Monitor struct {
	OrganizationID       string
	URL                  string
	Enabled              bool
	Tier                 string
	CheckIntervalMinutes int
	LastCheckedAt        *time.Time
	LastStatus           string
	LastStatusCode       *int
	ConsecutiveFailures  int
}

// SyncMonitors upserts website_monitors from organizations and derives each
// row's tier + interval from current org state:
//
//	paid_live (60m)  — org has active annual membership (membership_annual or legacy verification_annual)
//	active    (1d)   — org.status in ('verified','active')
//	passive   (7d)   — everything else in the eligible status set
func (s *Store) SyncMonitors(ctx context.Context, statuses []string) (int, error) {
	tag, err := s.pool.Exec(ctx, `
		WITH desired AS (
		  SELECT
		    o.id AS organization_id,
		    trim(o.website_url) AS url,
		    CASE
		      WHEN public.has_active_membership(o.id) THEN 'paid_live'
		      WHEN o.status IN ('verified', 'active') THEN 'active'
		      ELSE 'passive'
		    END AS tier
		  FROM organizations o
		  WHERE trim(coalesce(o.website_url, '')) <> ''
		    AND o.status = ANY($1::text[])
		)
		INSERT INTO website_monitors
		  (organization_id, url, enabled, tier, check_interval_minutes, updated_at)
		SELECT
		  organization_id,
		  url,
		  true,
		  tier,
		  CASE tier WHEN 'paid_live' THEN 60 WHEN 'active' THEN 1440 ELSE 10080 END,
		  now()
		FROM desired
		ON CONFLICT (organization_id) DO UPDATE
		SET url = EXCLUDED.url,
		    tier = EXCLUDED.tier,
		    check_interval_minutes = EXCLUDED.check_interval_minutes,
		    updated_at = now()
		WHERE website_monitors.url IS DISTINCT FROM EXCLUDED.url
		   OR website_monitors.tier IS DISTINCT FROM EXCLUDED.tier
		   OR website_monitors.check_interval_minutes IS DISTINCT FROM EXCLUDED.check_interval_minutes
	`, statuses)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

func (s *Store) ListDueMonitors(ctx context.Context, limit int) ([]Monitor, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT organization_id, url, enabled, tier, check_interval_minutes,
		       last_checked_at, last_status, last_status_code, consecutive_failures
		FROM website_monitors
		WHERE enabled = true
		  AND (
		    last_checked_at IS NULL
		    OR last_checked_at + (check_interval_minutes || ' minutes')::interval <= now()
		  )
		ORDER BY last_checked_at NULLS FIRST
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Monitor
	for rows.Next() {
		var m Monitor
		if err := rows.Scan(
			&m.OrganizationID,
			&m.URL,
			&m.Enabled,
			&m.Tier,
			&m.CheckIntervalMinutes,
			&m.LastCheckedAt,
			&m.LastStatus,
			&m.LastStatusCode,
			&m.ConsecutiveFailures,
		); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// RecordUrlInvalid marks the monitor as having a bad URL so it is excluded from
// down counts and does not open an incident. The monitor's last_checked_at is
// bumped so we don't retry the same broken URL on every cycle.
func (s *Store) RecordUrlInvalid(ctx context.Context, orgID, rawURL, reason string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE website_monitors
		SET last_checked_at = now(),
		    last_status = 'url_invalid',
		    last_status_code = NULL,
		    last_latency_ms = 0,
		    last_error = $2,
		    consecutive_failures = 0,
		    updated_at = now()
		WHERE organization_id = $1
	`, orgID, reason)
	return err
}

type CheckRecord struct {
	OrganizationID string
	URL            string
	IsUp           bool
	StatusCode     *int
	LatencyMS      int
	ErrorMessage   string
}

func (s *Store) RecordCheck(ctx context.Context, rec CheckRecord, failureThreshold int) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO website_check_results (
		  organization_id, url, is_up, status_code, latency_ms, error_message
		) VALUES ($1, $2, $3, $4, $5, $6)
	`, rec.OrganizationID, rec.URL, rec.IsUp, rec.StatusCode, rec.LatencyMS, rec.ErrorMessage)
	if err != nil {
		return err
	}

	var prevStatus string
	var prevFailures int
	err = tx.QueryRow(ctx, `
		SELECT last_status, consecutive_failures
		FROM website_monitors
		WHERE organization_id = $1
		FOR UPDATE
	`, rec.OrganizationID).Scan(&prevStatus, &prevFailures)
	if err != nil {
		return err
	}

	failures := 0
	newStatus := "up"
	if rec.IsUp {
		failures = 0
		newStatus = "up"
	} else {
		failures = prevFailures + 1
		if failures >= failureThreshold {
			newStatus = "down"
		} else if prevStatus == "down" {
			newStatus = "down"
		} else {
			newStatus = "unknown"
		}
	}

	_, err = tx.Exec(ctx, `
		UPDATE website_monitors
		SET last_checked_at = now(),
		    last_status = $2,
		    last_status_code = $3,
		    last_latency_ms = $4,
		    last_error = $5,
		    consecutive_failures = $6,
		    updated_at = now()
		WHERE organization_id = $1
	`, rec.OrganizationID, newStatus, rec.StatusCode, rec.LatencyMS, rec.ErrorMessage, failures)
	if err != nil {
		return err
	}

	wasDown := prevStatus == "down"
	nowDown := newStatus == "down"

	var newIncidentID string
	if !wasDown && nowDown {
		incidentID, err := openIncident(ctx, tx, rec)
		if err != nil {
			return err
		}
		newIncidentID = incidentID
		if err := logActivity(ctx, tx, rec.OrganizationID, "website_down",
			fmt.Sprintf("Website reported down (%s)", rec.ErrorMessage)); err != nil {
			return err
		}
	}

	if wasDown && rec.IsUp {
		if err := closeOpenIncidents(ctx, tx, rec.OrganizationID); err != nil {
			return err
		}
		if err := logActivity(ctx, tx, rec.OrganizationID, "website_up",
			"Website is reachable again"); err != nil {
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	if newIncidentID != "" {
		if err := s.QueueSiteDownAlert(ctx, rec.OrganizationID, newIncidentID); err != nil {
			// Non-fatal: incident is recorded; email can be retried from CRM or next cycle.
			_ = err
		}
	}
	return nil
}

func openIncident(ctx context.Context, tx pgx.Tx, rec CheckRecord) (string, error) {
	var openID string
	err := tx.QueryRow(ctx, `
		SELECT id::text FROM website_incidents
		WHERE organization_id = $1 AND closed_at IS NULL
		LIMIT 1
	`, rec.OrganizationID).Scan(&openID)
	if err == nil {
		return openID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO website_incidents (organization_id, last_status_code, error_message)
		VALUES ($1, $2, $3)
		RETURNING id::text
	`, rec.OrganizationID, rec.StatusCode, rec.ErrorMessage).Scan(&openID)
	return openID, err
}

func closeOpenIncidents(ctx context.Context, tx pgx.Tx, orgID string) error {
	_, err := tx.Exec(ctx, `
		UPDATE website_incidents
		SET closed_at = now()
		WHERE organization_id = $1 AND closed_at IS NULL
	`, orgID)
	return err
}

func logActivity(ctx context.Context, tx pgx.Tx, orgID, action, description string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO activity_log (organization_id, action, description, performed_by)
		VALUES ($1, $2, $3, 'system')
	`, orgID, action, description)
	return err
}

type MonitorStats struct {
	MonitorsTotal int
	MonitorsUp    int
	MonitorsDown  int
	OpenIncidents int
	ChecksLast24h int
}

func (s *Store) MonitorStats(ctx context.Context) (MonitorStats, error) {
	var st MonitorStats
	err := s.pool.QueryRow(ctx, `
		SELECT
		  (SELECT count(*)::int FROM website_monitors WHERE enabled),
		  (SELECT count(*)::int FROM website_monitors WHERE enabled AND last_status = 'up'),
		  (SELECT count(*)::int FROM website_monitors WHERE enabled AND last_status = 'down'),
		  (SELECT count(*)::int FROM website_incidents WHERE closed_at IS NULL),
		  (SELECT count(*)::int FROM website_check_results WHERE checked_at > now() - interval '24 hours')
	`).Scan(&st.MonitorsTotal, &st.MonitorsUp, &st.MonitorsDown, &st.OpenIncidents, &st.ChecksLast24h)
	return st, err
}
