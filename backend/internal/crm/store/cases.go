package store

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"ngoreality/backend/internal/crm/domain"
)

const caseCols = `id, client_id, reference_code, title, service_type, status,
	priority, assigned_to, opened_at, due_at, closed_at, closure_reason,
	outcome, custom, created_by, created_at, updated_at`

func scanCase(row pgx.Row) (*domain.Case, error) {
	var c domain.Case
	err := row.Scan(&c.ID, &c.ClientID, &c.ReferenceCode, &c.Title, &c.ServiceType,
		&c.Status, &c.Priority, &c.AssignedTo, &c.OpenedAt, &c.DueAt, &c.ClosedAt,
		&c.ClosureReason, &c.Outcome, &c.Custom, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

type CaseFilter struct {
	ClientID   string
	Status     string
	AssignedTo string
	Search     string
	Limit      int
	Offset     int
}

func ListCases(ctx context.Context, tx pgx.Tx, f CaseFilter) (*domain.Page[domain.Case], error) {
	if f.Limit <= 0 || f.Limit > 200 {
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
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}
	if f.AssignedTo != "" {
		args = append(args, f.AssignedTo)
		where = append(where, fmt.Sprintf("assigned_to = $%d", len(args)))
	}
	if s := strings.TrimSpace(f.Search); s != "" {
		args = append(args, "%"+strings.ToLower(s)+"%")
		n := len(args)
		where = append(where, fmt.Sprintf(
			"(lower(title) LIKE $%d OR lower(coalesce(reference_code,'')) LIKE $%d)", n, n))
	}

	clause := strings.Join(where, " AND ")

	var total int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM cases WHERE `+clause, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count cases: %w", err)
	}

	args = append(args, f.Limit, f.Offset)
	q := fmt.Sprintf(`SELECT %s FROM cases WHERE %s
		ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'on_hold' THEN 1 ELSE 2 END,
		         CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1
		                       WHEN 'normal' THEN 2 ELSE 3 END,
		         opened_at DESC
		LIMIT $%d OFFSET $%d`, caseCols, clause, len(args)-1, len(args))

	rows, err := tx.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list cases: %w", err)
	}
	defer rows.Close()

	items := []domain.Case{}
	for rows.Next() {
		c, err := scanCase(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &domain.Page[domain.Case]{Items: items, Total: total, Limit: f.Limit, Offset: f.Offset}, nil
}

func GetCase(ctx context.Context, tx pgx.Tx, id string) (*domain.Case, error) {
	return scanCase(tx.QueryRow(ctx, `SELECT `+caseCols+` FROM cases WHERE id = $1`, id))
}

type CaseInput struct {
	ClientID      string         `json:"client_id"`
	ReferenceCode *string        `json:"reference_code"`
	Title         string         `json:"title"`
	ServiceType   *string        `json:"service_type"`
	Status        string         `json:"status"`
	Priority      string         `json:"priority"`
	AssignedTo    *string        `json:"assigned_to"`
	DueAt         *string        `json:"due_at"`
	ClosureReason *string        `json:"closure_reason"`
	Outcome       *string        `json:"outcome"`
	Custom        map[string]any `json:"custom"`
}

func (in *CaseInput) validate(requireClient bool) error {
	if requireClient && strings.TrimSpace(in.ClientID) == "" {
		return fmt.Errorf("client_id is required")
	}
	if strings.TrimSpace(in.Title) == "" {
		return fmt.Errorf("title is required")
	}
	switch in.Status {
	case "", "open", "on_hold", "closed":
	default:
		return fmt.Errorf("status must be open, on_hold or closed")
	}
	switch in.Priority {
	case "", "low", "normal", "high", "urgent":
	default:
		return fmt.Errorf("priority must be low, normal, high or urgent")
	}
	return nil
}

func CreateCase(ctx context.Context, tx pgx.Tx, in CaseInput, actor string) (*domain.Case, error) {
	if err := in.validate(true); err != nil {
		return nil, err
	}
	if in.Status == "" {
		in.Status = "open"
	}
	if in.Priority == "" {
		in.Priority = "normal"
	}
	if in.Custom == nil {
		in.Custom = map[string]any{}
	}

	return scanCase(tx.QueryRow(ctx, `
		INSERT INTO cases (client_id, reference_code, title, service_type, status,
			priority, assigned_to, due_at, custom, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING `+caseCols,
		in.ClientID, in.ReferenceCode, in.Title, in.ServiceType, in.Status,
		in.Priority, in.AssignedTo, in.DueAt, in.Custom, actor))
}

// UpdateCase also maintains closed_at so "closed" and a timestamp cannot drift
// apart, which would corrupt every funder report that counts closures.
func UpdateCase(ctx context.Context, tx pgx.Tx, id string, in CaseInput) (*domain.Case, error) {
	if err := in.validate(false); err != nil {
		return nil, err
	}
	if in.Custom == nil {
		in.Custom = map[string]any{}
	}
	return scanCase(tx.QueryRow(ctx, `
		UPDATE cases SET
			reference_code = $2, title = $3, service_type = $4,
			status = COALESCE(NULLIF($5,''), status),
			priority = COALESCE(NULLIF($6,''), priority),
			assigned_to = $7, due_at = $8, closure_reason = $9, outcome = $10,
			custom = $11,
			closed_at = CASE
				WHEN COALESCE(NULLIF($5,''), status) = 'closed' AND closed_at IS NULL THEN now()
				WHEN COALESCE(NULLIF($5,''), status) <> 'closed' THEN NULL
				ELSE closed_at
			END
		WHERE id = $1
		RETURNING `+caseCols,
		id, in.ReferenceCode, in.Title, in.ServiceType, in.Status, in.Priority,
		in.AssignedTo, in.DueAt, in.ClosureReason, in.Outcome, in.Custom))
}

// DeleteCase erases a case and its notes, documents and session links.
//
// Declares the erasure for the same reason as DeleteClient: case_notes cascade
// from cases and are append-only, so deleting a case with any note in it failed
// outright before this. SET LOCAL keeps the permission inside this transaction.
func DeleteCase(ctx context.Context, tx pgx.Tx, id string) error {
	if _, err := tx.Exec(ctx, `SET LOCAL app.tenant_purge = 'on'`); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM cases WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Case notes (append-only)
// ---------------------------------------------------------------------------

// ListCaseNotes hides restricted notes unless the caller may see them. The
// filter is in SQL, so a restricted note never leaves the database.
func ListCaseNotes(ctx context.Context, tx pgx.Tx, caseID string, includeRestricted bool) ([]domain.CaseNote, error) {
	q := `SELECT id, case_id, author_id, body, visibility, created_at
	        FROM case_notes WHERE case_id = $1`
	if !includeRestricted {
		q += ` AND visibility = 'team'`
	}
	q += ` ORDER BY created_at DESC`

	rows, err := tx.Query(ctx, q, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.CaseNote{}
	for rows.Next() {
		var n domain.CaseNote
		if err := rows.Scan(&n.ID, &n.CaseID, &n.AuthorID, &n.Body, &n.Visibility, &n.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

type NoteInput struct {
	Body       string `json:"body"`
	Visibility string `json:"visibility"`
}

func CreateCaseNote(ctx context.Context, tx pgx.Tx, caseID string, in NoteInput, actor string) (*domain.CaseNote, error) {
	if strings.TrimSpace(in.Body) == "" {
		return nil, fmt.Errorf("note body is required")
	}
	if in.Visibility == "" {
		in.Visibility = "team"
	}
	if in.Visibility != "team" && in.Visibility != "restricted" {
		return nil, fmt.Errorf("visibility must be team or restricted")
	}

	var n domain.CaseNote
	err := tx.QueryRow(ctx, `
		INSERT INTO case_notes (case_id, author_id, body, visibility)
		VALUES ($1,$2,$3,$4)
		RETURNING id, case_id, author_id, body, visibility, created_at`,
		caseID, actor, in.Body, in.Visibility,
	).Scan(&n.ID, &n.CaseID, &n.AuthorID, &n.Body, &n.Visibility, &n.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &n, nil
}
