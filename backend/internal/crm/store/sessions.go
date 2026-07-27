package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"ngoreality/backend/internal/crm/domain"
)

const sessionCols = `id, client_id, case_id, occurred_at, service_type, delivery_mode,
	duration_minutes, attendees, outcome, notes, custom, recorded_by, created_at, updated_at`

func scanSession(row pgx.Row) (*domain.Session, error) {
	var s domain.Session
	err := row.Scan(&s.ID, &s.ClientID, &s.CaseID, &s.OccurredAt, &s.ServiceType,
		&s.DeliveryMode, &s.DurationMinutes, &s.Attendees, &s.Outcome, &s.Notes,
		&s.Custom, &s.RecordedBy, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

type SessionFilter struct {
	ClientID string
	CaseID   string
	From     *time.Time
	To       *time.Time
	Limit    int
	Offset   int
}

func ListSessions(ctx context.Context, tx pgx.Tx, f SessionFilter) (*domain.Page[domain.Session], error) {
	if f.Limit <= 0 || f.Limit > 500 {
		f.Limit = 50
	}
	if f.Offset < 0 {
		f.Offset = 0
	}

	where := []string{"true"}
	args := []any{}

	if f.ClientID != "" {
		args = append(args, f.ClientID)
		where = append(where, fmt.Sprintf("client_id = $%d", len(args)))
	}
	if f.CaseID != "" {
		args = append(args, f.CaseID)
		where = append(where, fmt.Sprintf("case_id = $%d", len(args)))
	}
	if f.From != nil {
		args = append(args, *f.From)
		where = append(where, fmt.Sprintf("occurred_at >= $%d", len(args)))
	}
	if f.To != nil {
		args = append(args, *f.To)
		where = append(where, fmt.Sprintf("occurred_at < $%d", len(args)))
	}

	clause := strings.Join(where, " AND ")

	var total int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM sessions WHERE `+clause, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count sessions: %w", err)
	}

	args = append(args, f.Limit, f.Offset)
	q := fmt.Sprintf(`SELECT %s FROM sessions WHERE %s
		ORDER BY occurred_at DESC LIMIT $%d OFFSET $%d`,
		sessionCols, clause, len(args)-1, len(args))

	rows, err := tx.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()

	items := []domain.Session{}
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &domain.Page[domain.Session]{Items: items, Total: total, Limit: f.Limit, Offset: f.Offset}, nil
}

type SessionInput struct {
	ClientID        string         `json:"client_id"`
	CaseID          *string        `json:"case_id"`
	OccurredAt      *string        `json:"occurred_at"`
	ServiceType     *string        `json:"service_type"`
	DeliveryMode    *string        `json:"delivery_mode"`
	DurationMinutes *int           `json:"duration_minutes"`
	Attendees       *int           `json:"attendees"`
	Outcome         *string        `json:"outcome"`
	Notes           *string        `json:"notes"`
	Custom          map[string]any `json:"custom"`
}

func (in *SessionInput) validate(requireClient bool) error {
	if requireClient && strings.TrimSpace(in.ClientID) == "" {
		return fmt.Errorf("client_id is required")
	}
	if in.DeliveryMode != nil {
		switch *in.DeliveryMode {
		case "", "in_person", "phone", "video", "email", "other":
		default:
			return fmt.Errorf("delivery_mode must be in_person, phone, video, email or other")
		}
	}
	if in.DurationMinutes != nil && *in.DurationMinutes < 0 {
		return fmt.Errorf("duration_minutes cannot be negative")
	}
	return nil
}

func CreateSession(ctx context.Context, tx pgx.Tx, in SessionInput, actor string) (*domain.Session, error) {
	if err := in.validate(true); err != nil {
		return nil, err
	}
	if in.Custom == nil {
		in.Custom = map[string]any{}
	}
	return scanSession(tx.QueryRow(ctx, `
		INSERT INTO sessions (client_id, case_id, occurred_at, service_type,
			delivery_mode, duration_minutes, attendees, outcome, notes, custom, recorded_by)
		VALUES ($1,$2,COALESCE($3::timestamptz, now()),$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING `+sessionCols,
		in.ClientID, in.CaseID, in.OccurredAt, in.ServiceType, in.DeliveryMode,
		in.DurationMinutes, in.Attendees, in.Outcome, in.Notes, in.Custom, actor))
}

func UpdateSession(ctx context.Context, tx pgx.Tx, id string, in SessionInput) (*domain.Session, error) {
	if err := in.validate(false); err != nil {
		return nil, err
	}
	if in.Custom == nil {
		in.Custom = map[string]any{}
	}
	return scanSession(tx.QueryRow(ctx, `
		UPDATE sessions SET
			case_id = $2,
			occurred_at = COALESCE($3::timestamptz, occurred_at),
			service_type = $4, delivery_mode = $5, duration_minutes = $6,
			attendees = $7, outcome = $8, notes = $9, custom = $10
		WHERE id = $1
		RETURNING `+sessionCols,
		id, in.CaseID, in.OccurredAt, in.ServiceType, in.DeliveryMode,
		in.DurationMinutes, in.Attendees, in.Outcome, in.Notes, in.Custom))
}

func DeleteSession(ctx context.Context, tx pgx.Tx, id string) error {
	tag, err := tx.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

// Stats computes the funder-report aggregate for a period.
func Stats(ctx context.Context, tx pgx.Tx, from, to time.Time) (*domain.Stats, error) {
	s := domain.Stats{
		PeriodFrom:            from,
		PeriodTo:              to,
		SessionsByServiceType: map[string]int{},
	}

	err := tx.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM clients),
			(SELECT count(*) FROM clients WHERE status = 'active'),
			(SELECT count(*) FROM clients WHERE created_at >= $1 AND created_at < $2),
			(SELECT count(*) FROM cases WHERE status = 'open'),
			(SELECT count(*) FROM cases WHERE closed_at >= $1 AND closed_at < $2),
			(SELECT count(*) FROM cases WHERE status = 'open' AND due_at IS NOT NULL AND due_at < now()),
			(SELECT count(*) FROM sessions WHERE occurred_at >= $1 AND occurred_at < $2),
			(SELECT COALESCE(sum(duration_minutes),0) FROM sessions WHERE occurred_at >= $1 AND occurred_at < $2),
			(SELECT count(DISTINCT client_id) FROM sessions WHERE occurred_at >= $1 AND occurred_at < $2)`,
		from, to,
	).Scan(&s.ClientsTotal, &s.ClientsActive, &s.ClientsNewInPeriod, &s.CasesOpen,
		&s.CasesClosedInPeriod, &s.CasesOverdue, &s.SessionsInPeriod,
		&s.SessionMinutesInPeriod, &s.ClientsServedInPeriod)
	if err != nil {
		return nil, fmt.Errorf("stats: %w", err)
	}

	rows, err := tx.Query(ctx, `
		SELECT COALESCE(service_type, 'unspecified'), count(*)
		  FROM sessions WHERE occurred_at >= $1 AND occurred_at < $2
		 GROUP BY 1 ORDER BY 2 DESC`, from, to)
	if err != nil {
		return nil, fmt.Errorf("stats by service type: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return nil, err
		}
		s.SessionsByServiceType[k] = n
	}
	return &s, rows.Err()
}

// Audit appends an access record. Reads and exports are logged, not just writes.
func Audit(ctx context.Context, tx pgx.Tx, actor, entityType, entityID, action string, diff map[string]any) error {
	if diff == nil {
		diff = map[string]any{}
	}
	var id any
	if entityID != "" {
		id = entityID
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO audit_log (actor_id, entity_type, entity_id, action, diff)
		VALUES ($1,$2,$3,$4,$5)`, actor, entityType, id, action, diff)
	return err
}
