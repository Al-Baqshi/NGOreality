package store

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"

	"ngoreality/backend/internal/crm/domain"
)

// ---------------------------------------------------------------------------
// Custom field definitions
//
// This is the customisation escape hatch: an NGO adds fields to clients, cases
// or sessions without any DDL. Values live in the `custom` jsonb column on the
// row itself. It is deliberately NOT a table builder — no user-defined tables,
// relations or formulas.
// ---------------------------------------------------------------------------

// fieldKeyPattern keeps keys usable as JSON object keys and form field names.
var fieldKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,48}$`)

var validEntities = map[string]bool{"client": true, "case": true, "session": true}

var validFieldTypes = map[string]bool{
	"text": true, "long_text": true, "number": true, "date": true,
	"boolean": true, "select": true, "multi_select": true,
}

func ListFieldDefs(ctx context.Context, tx pgx.Tx, entity string, includeArchived bool) ([]domain.FieldDef, error) {
	q := `SELECT id, entity, key, label, data_type, options, required, sensitive,
	             sort_order, archived_at, created_at
	        FROM field_defs WHERE true`
	args := []any{}

	if entity != "" {
		if !validEntities[entity] {
			return nil, fmt.Errorf("entity must be client, case or session")
		}
		args = append(args, entity)
		q += fmt.Sprintf(" AND entity = $%d", len(args))
	}
	if !includeArchived {
		q += " AND archived_at IS NULL"
	}
	q += " ORDER BY entity, sort_order, label"

	rows, err := tx.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.FieldDef{}
	for rows.Next() {
		var f domain.FieldDef
		if err := rows.Scan(&f.ID, &f.Entity, &f.Key, &f.Label, &f.DataType,
			&f.Options, &f.Required, &f.Sensitive, &f.SortOrder,
			&f.ArchivedAt, &f.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

type FieldDefInput struct {
	Entity    string   `json:"entity"`
	Key       string   `json:"key"`
	Label     string   `json:"label"`
	DataType  string   `json:"data_type"`
	Options   []string `json:"options"`
	Required  bool     `json:"required"`
	Sensitive bool     `json:"sensitive"`
	SortOrder int      `json:"sort_order"`
}

func (in *FieldDefInput) validate() error {
	if !validEntities[in.Entity] {
		return fmt.Errorf("entity must be client, case or session")
	}
	if !fieldKeyPattern.MatchString(in.Key) {
		return fmt.Errorf("key must start with a letter and contain only lowercase letters, digits and underscores")
	}
	if strings.TrimSpace(in.Label) == "" {
		return fmt.Errorf("label is required")
	}
	if in.DataType == "" {
		in.DataType = "text"
	}
	if !validFieldTypes[in.DataType] {
		return fmt.Errorf("unsupported data_type %q", in.DataType)
	}
	if in.DataType == "select" || in.DataType == "multi_select" {
		if len(in.Options) == 0 {
			return fmt.Errorf("%s fields need at least one option", in.DataType)
		}
	}
	if in.Options == nil {
		in.Options = []string{}
	}
	return nil
}

func CreateFieldDef(ctx context.Context, tx pgx.Tx, in FieldDefInput) (*domain.FieldDef, error) {
	if err := in.validate(); err != nil {
		return nil, err
	}
	var f domain.FieldDef
	err := tx.QueryRow(ctx, `
		INSERT INTO field_defs (entity, key, label, data_type, options, required, sensitive, sort_order)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, entity, key, label, data_type, options, required, sensitive,
		          sort_order, archived_at, created_at`,
		in.Entity, in.Key, in.Label, in.DataType, in.Options, in.Required, in.Sensitive, in.SortOrder,
	).Scan(&f.ID, &f.Entity, &f.Key, &f.Label, &f.DataType, &f.Options,
		&f.Required, &f.Sensitive, &f.SortOrder, &f.ArchivedAt, &f.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// UpdateFieldDef changes presentation only. Entity and key are immutable
// because existing rows already carry values under that key — renaming would
// orphan data that is still in the jsonb column.
func UpdateFieldDef(ctx context.Context, tx pgx.Tx, id string, in FieldDefInput) (*domain.FieldDef, error) {
	if strings.TrimSpace(in.Label) == "" {
		return nil, fmt.Errorf("label is required")
	}
	if in.Options == nil {
		in.Options = []string{}
	}
	var f domain.FieldDef
	err := tx.QueryRow(ctx, `
		UPDATE field_defs
		   SET label = $2, options = $3, required = $4, sensitive = $5, sort_order = $6
		 WHERE id = $1
		RETURNING id, entity, key, label, data_type, options, required, sensitive,
		          sort_order, archived_at, created_at`,
		id, in.Label, in.Options, in.Required, in.Sensitive, in.SortOrder,
	).Scan(&f.ID, &f.Entity, &f.Key, &f.Label, &f.DataType, &f.Options,
		&f.Required, &f.Sensitive, &f.SortOrder, &f.ArchivedAt, &f.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// ArchiveFieldDef hides a field without destroying the values already stored
// against it — deleting the definition would silently strand beneficiary data.
func ArchiveFieldDef(ctx context.Context, tx pgx.Tx, id string) error {
	tag, err := tx.Exec(ctx,
		`UPDATE field_defs SET archived_at = now() WHERE id = $1 AND archived_at IS NULL`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Service types — each NGO names its own programmes
// ---------------------------------------------------------------------------

func ListServiceTypes(ctx context.Context, tx pgx.Tx, includeInactive bool) ([]domain.ServiceType, error) {
	q := `SELECT id, key, label, active, sort_order, created_at FROM service_types`
	if !includeInactive {
		q += ` WHERE active`
	}
	q += ` ORDER BY sort_order, label`

	rows, err := tx.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.ServiceType{}
	for rows.Next() {
		var s domain.ServiceType
		if err := rows.Scan(&s.ID, &s.Key, &s.Label, &s.Active, &s.SortOrder, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

type ServiceTypeInput struct {
	Key       string `json:"key"`
	Label     string `json:"label"`
	Active    *bool  `json:"active"`
	SortOrder int    `json:"sort_order"`
}

func UpsertServiceType(ctx context.Context, tx pgx.Tx, in ServiceTypeInput) (*domain.ServiceType, error) {
	if !fieldKeyPattern.MatchString(in.Key) {
		return nil, fmt.Errorf("key must start with a letter and contain only lowercase letters, digits and underscores")
	}
	if strings.TrimSpace(in.Label) == "" {
		return nil, fmt.Errorf("label is required")
	}
	active := true
	if in.Active != nil {
		active = *in.Active
	}

	var s domain.ServiceType
	err := tx.QueryRow(ctx, `
		INSERT INTO service_types (key, label, active, sort_order)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (key) DO UPDATE
		   SET label = EXCLUDED.label, active = EXCLUDED.active,
		       sort_order = EXCLUDED.sort_order
		RETURNING id, key, label, active, sort_order, created_at`,
		in.Key, in.Label, active, in.SortOrder,
	).Scan(&s.ID, &s.Key, &s.Label, &s.Active, &s.SortOrder, &s.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

func GetSettings(ctx context.Context, tx pgx.Tx) (*domain.Settings, error) {
	var s domain.Settings
	err := tx.QueryRow(ctx, `
		SELECT client_retention_months, collection_notice, case_reference_prefix,
		       branding, updated_at
		  FROM settings WHERE id = true`,
	).Scan(&s.ClientRetentionMonths, &s.CollectionNotice, &s.CaseReferencePrefix,
		&s.Branding, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

type SettingsInput struct {
	ClientRetentionMonths *int           `json:"client_retention_months"`
	CollectionNotice      *string        `json:"collection_notice"`
	CaseReferencePrefix   *string        `json:"case_reference_prefix"`
	Branding              map[string]any `json:"branding"`
}

func UpdateSettings(ctx context.Context, tx pgx.Tx, in SettingsInput) (*domain.Settings, error) {
	if in.ClientRetentionMonths != nil && *in.ClientRetentionMonths <= 0 {
		return nil, fmt.Errorf("client_retention_months must be greater than zero")
	}
	var s domain.Settings
	err := tx.QueryRow(ctx, `
		UPDATE settings SET
			client_retention_months = COALESCE($1, client_retention_months),
			collection_notice       = COALESCE($2, collection_notice),
			case_reference_prefix   = COALESCE($3, case_reference_prefix),
			branding                = COALESCE($4, branding)
		WHERE id = true
		RETURNING client_retention_months, collection_notice, case_reference_prefix,
		          branding, updated_at`,
		in.ClientRetentionMonths, in.CollectionNotice, in.CaseReferencePrefix, in.Branding,
	).Scan(&s.ClientRetentionMonths, &s.CollectionNotice, &s.CaseReferencePrefix,
		&s.Branding, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

// ListDocuments hides restricted documents from roles without sensitive access.
func ListDocuments(ctx context.Context, tx pgx.Tx, clientID, caseID string, includeRestricted bool) ([]domain.Document, error) {
	q := `SELECT id, client_id, case_id, storage_path, filename, mime_type,
	             size_bytes, sensitivity, uploaded_by, uploaded_at
	        FROM documents WHERE true`
	args := []any{}

	if clientID != "" {
		args = append(args, clientID)
		q += fmt.Sprintf(" AND client_id = $%d", len(args))
	}
	if caseID != "" {
		args = append(args, caseID)
		q += fmt.Sprintf(" AND case_id = $%d", len(args))
	}
	if !includeRestricted {
		q += " AND sensitivity = 'team'"
	}
	q += " ORDER BY uploaded_at DESC"

	rows, err := tx.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.Document{}
	for rows.Next() {
		var d domain.Document
		if err := rows.Scan(&d.ID, &d.ClientID, &d.CaseID, &d.StoragePath, &d.Filename,
			&d.MimeType, &d.SizeBytes, &d.Sensitivity, &d.UploadedBy, &d.UploadedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

type DocumentInput struct {
	ClientID    *string `json:"client_id"`
	CaseID      *string `json:"case_id"`
	StoragePath string  `json:"storage_path"`
	Filename    string  `json:"filename"`
	MimeType    *string `json:"mime_type"`
	SizeBytes   *int64  `json:"size_bytes"`
	Sensitivity string  `json:"sensitivity"`
}

func CreateDocument(ctx context.Context, tx pgx.Tx, in DocumentInput, actor string) (*domain.Document, error) {
	if strings.TrimSpace(in.StoragePath) == "" {
		return nil, fmt.Errorf("storage_path is required")
	}
	if strings.TrimSpace(in.Filename) == "" {
		return nil, fmt.Errorf("filename is required")
	}
	if in.ClientID == nil && in.CaseID == nil {
		return nil, fmt.Errorf("a document must attach to a client or a case")
	}
	if in.Sensitivity == "" {
		in.Sensitivity = "team"
	}
	if in.Sensitivity != "team" && in.Sensitivity != "restricted" {
		return nil, fmt.Errorf("sensitivity must be team or restricted")
	}

	var d domain.Document
	err := tx.QueryRow(ctx, `
		INSERT INTO documents (client_id, case_id, storage_path, filename,
			mime_type, size_bytes, sensitivity, uploaded_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, client_id, case_id, storage_path, filename, mime_type,
		          size_bytes, sensitivity, uploaded_by, uploaded_at`,
		in.ClientID, in.CaseID, in.StoragePath, in.Filename, in.MimeType,
		in.SizeBytes, in.Sensitivity, actor,
	).Scan(&d.ID, &d.ClientID, &d.CaseID, &d.StoragePath, &d.Filename, &d.MimeType,
		&d.SizeBytes, &d.Sensitivity, &d.UploadedBy, &d.UploadedAt)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func DeleteDocument(ctx context.Context, tx pgx.Tx, id string) error {
	tag, err := tx.Exec(ctx, `DELETE FROM documents WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
