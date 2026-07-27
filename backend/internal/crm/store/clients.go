// Package store holds the tenant-scoped queries.
//
// Every function takes a pgx.Tx obtained from tenant.Registry.Acquire, whose
// search_path is already pinned to one tenant schema. Table names here are
// therefore unqualified and carry no tenant filter — that is by design.
package store

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"ngoreality/backend/internal/crm/domain"
)

var ErrNotFound = errors.New("not found")

const clientCols = `id, reference_code, given_name, family_name, preferred_name,
	date_of_birth, contact_email, contact_phone, address_line1, address_line2,
	city, region, postcode, country, status, custom, created_by, created_at, updated_at`

func scanClient(row pgx.Row) (*domain.Client, error) {
	var c domain.Client
	err := row.Scan(&c.ID, &c.ReferenceCode, &c.GivenName, &c.FamilyName,
		&c.PreferredName, &c.DateOfBirth, &c.ContactEmail, &c.ContactPhone,
		&c.AddressLine1, &c.AddressLine2, &c.City, &c.Region, &c.Postcode,
		&c.Country, &c.Status, &c.Custom, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// ClientFilter drives the list endpoint.
type ClientFilter struct {
	Search string
	Status string
	Limit  int
	Offset int
}

func (f *ClientFilter) normalise() {
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 50
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
}

// ListClients returns one page plus the total matching count.
func ListClients(ctx context.Context, tx pgx.Tx, f ClientFilter) (*domain.Page[domain.Client], error) {
	f.normalise()

	where := []string{"true"}
	args := []any{}

	if s := strings.TrimSpace(f.Search); s != "" {
		args = append(args, "%"+strings.ToLower(s)+"%")
		n := len(args)
		where = append(where, fmt.Sprintf(
			`(lower(given_name) LIKE $%d OR lower(family_name) LIKE $%d
			  OR lower(coalesce(preferred_name,'')) LIKE $%d
			  OR lower(coalesce(reference_code,'')) LIKE $%d
			  OR lower(coalesce(contact_email,'')) LIKE $%d)`, n, n, n, n, n))
	}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}

	clause := strings.Join(where, " AND ")

	var total int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM clients WHERE `+clause, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count clients: %w", err)
	}

	args = append(args, f.Limit, f.Offset)
	q := fmt.Sprintf(`SELECT %s FROM clients WHERE %s
		ORDER BY family_name, given_name, created_at DESC
		LIMIT $%d OFFSET $%d`, clientCols, clause, len(args)-1, len(args))

	rows, err := tx.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list clients: %w", err)
	}
	defer rows.Close()

	items := []domain.Client{}
	for rows.Next() {
		c, err := scanClient(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &domain.Page[domain.Client]{
		Items: items, Total: total, Limit: f.Limit, Offset: f.Offset,
	}, nil
}

// GetClient fetches one client. Sensitive attributes are loaded only when
// withSensitive is true — the caller decides based on the principal's role,
// and when false the columns are never even selected.
func GetClient(ctx context.Context, tx pgx.Tx, id string, withSensitive bool) (*domain.Client, error) {
	c, err := scanClient(tx.QueryRow(ctx,
		`SELECT `+clientCols+` FROM clients WHERE id = $1`, id))
	if err != nil {
		return nil, err
	}

	if withSensitive {
		var s domain.ClientSensitive
		err := tx.QueryRow(ctx, `
			SELECT ethnicity, iwi_affiliation, gender, health_notes, legal_status,
			       risk_flags, data, updated_at
			  FROM client_sensitive WHERE client_id = $1`, id,
		).Scan(&s.Ethnicity, &s.IwiAffiliation, &s.Gender, &s.HealthNotes,
			&s.LegalStatus, &s.RiskFlags, &s.Data, &s.UpdatedAt)
		if err == nil {
			c.Sensitive = &s
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("load sensitive: %w", err)
		}
	}
	return c, nil
}

// ClientInput is the create/update payload.
type ClientInput struct {
	ReferenceCode *string        `json:"reference_code"`
	GivenName     string         `json:"given_name"`
	FamilyName    string         `json:"family_name"`
	PreferredName *string        `json:"preferred_name"`
	DateOfBirth   *string        `json:"date_of_birth"`
	ContactEmail  *string        `json:"contact_email"`
	ContactPhone  *string        `json:"contact_phone"`
	AddressLine1  *string        `json:"address_line1"`
	AddressLine2  *string        `json:"address_line2"`
	City          *string        `json:"city"`
	Region        *string        `json:"region"`
	Postcode      *string        `json:"postcode"`
	Country       *string        `json:"country"`
	Status        string         `json:"status"`
	Custom        map[string]any `json:"custom"`
}

func (in *ClientInput) validate() error {
	if strings.TrimSpace(in.GivenName) == "" && strings.TrimSpace(in.FamilyName) == "" {
		return fmt.Errorf("a client needs at least a given or family name")
	}
	switch in.Status {
	case "", "active", "inactive", "closed":
	default:
		return fmt.Errorf("status must be active, inactive or closed")
	}
	return nil
}

func CreateClient(ctx context.Context, tx pgx.Tx, in ClientInput, actor string) (*domain.Client, error) {
	if err := in.validate(); err != nil {
		return nil, err
	}
	if in.Status == "" {
		in.Status = "active"
	}
	if in.Custom == nil {
		in.Custom = map[string]any{}
	}

	return scanClient(tx.QueryRow(ctx, `
		INSERT INTO clients (reference_code, given_name, family_name, preferred_name,
			date_of_birth, contact_email, contact_phone, address_line1, address_line2,
			city, region, postcode, country, status, custom, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		RETURNING `+clientCols,
		in.ReferenceCode, in.GivenName, in.FamilyName, in.PreferredName,
		in.DateOfBirth, in.ContactEmail, in.ContactPhone, in.AddressLine1,
		in.AddressLine2, in.City, in.Region, in.Postcode, in.Country,
		in.Status, in.Custom, actor))
}

func UpdateClient(ctx context.Context, tx pgx.Tx, id string, in ClientInput) (*domain.Client, error) {
	if err := in.validate(); err != nil {
		return nil, err
	}
	if in.Custom == nil {
		in.Custom = map[string]any{}
	}
	c, err := scanClient(tx.QueryRow(ctx, `
		UPDATE clients SET
			reference_code = $2, given_name = $3, family_name = $4, preferred_name = $5,
			date_of_birth = $6, contact_email = $7, contact_phone = $8,
			address_line1 = $9, address_line2 = $10, city = $11, region = $12,
			postcode = $13, country = $14,
			status = COALESCE(NULLIF($15,''), status),
			custom = $16
		WHERE id = $1
		RETURNING `+clientCols,
		id, in.ReferenceCode, in.GivenName, in.FamilyName, in.PreferredName,
		in.DateOfBirth, in.ContactEmail, in.ContactPhone, in.AddressLine1,
		in.AddressLine2, in.City, in.Region, in.Postcode, in.Country,
		in.Status, in.Custom))
	return c, err
}

// SensitiveInput updates the restricted attributes.
type SensitiveInput struct {
	Ethnicity      *string        `json:"ethnicity"`
	IwiAffiliation *string        `json:"iwi_affiliation"`
	Gender         *string        `json:"gender"`
	HealthNotes    *string        `json:"health_notes"`
	LegalStatus    *string        `json:"legal_status"`
	RiskFlags      []string       `json:"risk_flags"`
	Data           map[string]any `json:"data"`
}

func UpsertClientSensitive(ctx context.Context, tx pgx.Tx, clientID string, in SensitiveInput) error {
	if in.RiskFlags == nil {
		in.RiskFlags = []string{}
	}
	if in.Data == nil {
		in.Data = map[string]any{}
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO client_sensitive
			(client_id, ethnicity, iwi_affiliation, gender, health_notes,
			 legal_status, risk_flags, data)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (client_id) DO UPDATE SET
			ethnicity = EXCLUDED.ethnicity,
			iwi_affiliation = EXCLUDED.iwi_affiliation,
			gender = EXCLUDED.gender,
			health_notes = EXCLUDED.health_notes,
			legal_status = EXCLUDED.legal_status,
			risk_flags = EXCLUDED.risk_flags,
			data = EXCLUDED.data`,
		clientID, in.Ethnicity, in.IwiAffiliation, in.Gender, in.HealthNotes,
		in.LegalStatus, in.RiskFlags, in.Data)
	return err
}

func DeleteClient(ctx context.Context, tx pgx.Tx, id string) error {
	tag, err := tx.Exec(ctx, `DELETE FROM clients WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Consents
// ---------------------------------------------------------------------------

func ListConsents(ctx context.Context, tx pgx.Tx, clientID string) ([]domain.Consent, error) {
	rows, err := tx.Query(ctx, `
		SELECT id, client_id, purpose, method, evidence, granted_at, expires_at,
		       withdrawn_at, collected_by, created_at
		  FROM consents WHERE client_id = $1 ORDER BY granted_at DESC`, clientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.Consent{}
	for rows.Next() {
		var c domain.Consent
		if err := rows.Scan(&c.ID, &c.ClientID, &c.Purpose, &c.Method, &c.Evidence,
			&c.GrantedAt, &c.ExpiresAt, &c.WithdrawnAt, &c.CollectedBy, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

type ConsentInput struct {
	Purpose   string  `json:"purpose"`
	Method    string  `json:"method"`
	Evidence  *string `json:"evidence"`
	ExpiresAt *string `json:"expires_at"`
}

func CreateConsent(ctx context.Context, tx pgx.Tx, clientID string, in ConsentInput, actor string) (*domain.Consent, error) {
	if strings.TrimSpace(in.Purpose) == "" {
		return nil, fmt.Errorf("consent purpose is required")
	}
	if in.Method == "" {
		in.Method = "verbal"
	}
	var c domain.Consent
	err := tx.QueryRow(ctx, `
		INSERT INTO consents (client_id, purpose, method, evidence, expires_at, collected_by)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, client_id, purpose, method, evidence, granted_at, expires_at,
		          withdrawn_at, collected_by, created_at`,
		clientID, in.Purpose, in.Method, in.Evidence, in.ExpiresAt, actor,
	).Scan(&c.ID, &c.ClientID, &c.Purpose, &c.Method, &c.Evidence, &c.GrantedAt,
		&c.ExpiresAt, &c.WithdrawnAt, &c.CollectedBy, &c.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func WithdrawConsent(ctx context.Context, tx pgx.Tx, id string) error {
	tag, err := tx.Exec(ctx,
		`UPDATE consents SET withdrawn_at = now() WHERE id = $1 AND withdrawn_at IS NULL`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
