// Package tenant owns the schema-per-tenant boundary: provisioning, lookup,
// and acquiring a connection pinned to exactly one tenant's schema.
//
// SECURITY: every read and write in the CRM goes through Registry.Acquire.
// That is the single place a tenant schema is selected, which is what makes
// isolation reviewable — there is one code path to get wrong, not a policy on
// every table.
package tenant

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ngoreality/backend/internal/crm/migrate"
)

var (
	ErrNotFound  = errors.New("tenant not found")
	ErrNotActive = errors.New("tenant is not active")
	ErrExists    = errors.New("tenant already exists for this organization")
)

// schemaNamePattern is the ONLY shape allowed to reach a search_path.
var schemaNamePattern = regexp.MustCompile(`^tenant_[a-z0-9_]{1,50}$`)

// ValidSchemaName is the last line of defence before an identifier is used.
func ValidSchemaName(s string) bool {
	return schemaNamePattern.MatchString(s)
}

type Status string

const (
	StatusProvisioning Status = "provisioning"
	StatusActive       Status = "active"
	StatusSuspended    Status = "suspended"
	StatusClosed       Status = "closed"
)

type Tenant struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	Slug           string `json:"slug"`
	Name           string `json:"name"`
	SchemaName     string `json:"schema_name"`
	Status         Status `json:"status"`
	Plan           string `json:"plan"`
	SeatsPurchased int    `json:"seats_purchased"`
	DataRegion     string `json:"data_region"`
	Country        string `json:"country"`
	SchemaVersion  int    `json:"schema_version"`
}

type Registry struct {
	pool *pgxpool.Pool
	log  *slog.Logger
}

func NewRegistry(pool *pgxpool.Pool, log *slog.Logger) *Registry {
	return &Registry{pool: pool, log: log}
}

// Pool exposes the underlying pool for control-plane queries only. Tenant data
// must go through Acquire.
func (r *Registry) Pool() *pgxpool.Pool { return r.pool }

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

// Slugify produces a safe, stable schema suffix from an organisation name.
func Slugify(name string) string {
	var b strings.Builder
	lastUnderscore := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case unicode.IsLetter(r) && r < unicode.MaxASCII, unicode.IsDigit(r) && r < unicode.MaxASCII:
			b.WriteRune(r)
			lastUnderscore = false
		default:
			if !lastUnderscore && b.Len() > 0 {
				b.WriteByte('_')
				lastUnderscore = true
			}
		}
	}
	s := strings.Trim(b.String(), "_")
	if len(s) > 40 {
		s = strings.Trim(s[:40], "_")
	}
	// A schema must not start with a digit once prefixed; "tenant_" handles
	// that, but an empty slug still needs a fallback.
	if s == "" {
		s = "org"
	}
	return s
}

// reservedSlugs would collide with Postgres or our own naming.
var reservedSlugs = map[string]bool{
	"public": true, "platform": true, "information_schema": true,
	"pg_catalog": true, "pg_toast": true, "admin": true,
}

// allocateSlug finds an unused slug, appending a numeric suffix on collision.
func (r *Registry) allocateSlug(ctx context.Context, base string) (string, error) {
	if reservedSlugs[base] {
		base = base + "_org"
	}
	candidate := base
	for i := 2; i < 1000; i++ {
		var exists bool
		err := r.pool.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM platform.tenants WHERE slug = $1)`,
			candidate).Scan(&exists)
		if err != nil {
			return "", fmt.Errorf("check slug: %w", err)
		}
		if !exists {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s_%d", base, i)
	}
	return "", fmt.Errorf("could not allocate a unique slug for %q", base)
}

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

type ProvisionInput struct {
	OrganizationID string
	Name           string
	Country        string
	DataRegion     string
	Plan           string
	// OwnerUserID is the Supabase auth user who gets the owner seat.
	OwnerUserID string
	OwnerEmail  string
}

// Provision creates the tenant row, its schema, runs migrations and seats the
// owner. It is idempotent per organization_id: calling twice returns ErrExists
// rather than creating a second schema.
func (r *Registry) Provision(ctx context.Context, in ProvisionInput) (*Tenant, error) {
	if strings.TrimSpace(in.OrganizationID) == "" {
		return nil, fmt.Errorf("organization_id is required")
	}
	if strings.TrimSpace(in.Name) == "" {
		return nil, fmt.Errorf("name is required")
	}

	if existing, err := r.ByOrganization(ctx, in.OrganizationID); err == nil {
		return existing, ErrExists
	} else if !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	slug, err := r.allocateSlug(ctx, Slugify(in.Name))
	if err != nil {
		return nil, err
	}
	schemaName := "tenant_" + slug
	if !ValidSchemaName(schemaName) {
		return nil, fmt.Errorf("derived schema name %q is not valid", schemaName)
	}

	plan := in.Plan
	if plan == "" {
		plan = "workspace"
	}
	country := in.Country
	if country == "" {
		country = "NZ"
	}
	region := in.DataRegion
	if region == "" {
		region = "ap-southeast-2"
	}

	var t Tenant
	err = r.pool.QueryRow(ctx, `
		INSERT INTO platform.tenants
			(organization_id, slug, name, schema_name, status, plan, country, data_region)
		VALUES ($1, $2, $3, $4, 'provisioning', $5, $6, $7)
		RETURNING id, organization_id, slug, name, schema_name, status, plan,
		          seats_purchased, data_region, country, schema_version`,
		in.OrganizationID, slug, in.Name, schemaName, plan, country, region,
	).Scan(&t.ID, &t.OrganizationID, &t.Slug, &t.Name, &t.SchemaName, &t.Status,
		&t.Plan, &t.SeatsPurchased, &t.DataRegion, &t.Country, &t.SchemaVersion)
	if err != nil {
		return nil, fmt.Errorf("insert tenant: %w", err)
	}

	// CREATE SCHEMA cannot be parameterised. schemaName has passed the
	// regexp above, and is additionally quoted here.
	if _, err := r.pool.Exec(ctx, `CREATE SCHEMA IF NOT EXISTS `+pgx.Identifier{schemaName}.Sanitize()); err != nil {
		r.logProvision(ctx, t.ID, "create_schema", err.Error(), false)
		return nil, fmt.Errorf("create schema: %w", err)
	}

	version, err := migrate.Tenant(ctx, r.pool, schemaName, 0, r.log)
	if err != nil {
		r.logProvision(ctx, t.ID, "migrate", err.Error(), false)
		return nil, fmt.Errorf("migrate tenant schema: %w", err)
	}

	if _, err := r.pool.Exec(ctx, `
		UPDATE platform.tenants
		   SET status = 'active', schema_version = $2, provisioned_at = now()
		 WHERE id = $1`, t.ID, version); err != nil {
		return nil, fmt.Errorf("activate tenant: %w", err)
	}
	t.Status = StatusActive
	t.SchemaVersion = version

	if in.OwnerUserID != "" {
		if err := r.UpsertUser(ctx, t.ID, in.OwnerUserID, in.OwnerEmail, "owner"); err != nil {
			return nil, fmt.Errorf("seat owner: %w", err)
		}
	}

	r.logProvision(ctx, t.ID, "provisioned", fmt.Sprintf("schema=%s version=%d", schemaName, version), true)
	r.log.Info("tenant provisioned", "tenant", t.ID, "schema", schemaName, "version", version)
	return &t, nil
}

func (r *Registry) logProvision(ctx context.Context, tenantID, action, detail string, ok bool) {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO platform.provisioning_log (tenant_id, action, detail, succeeded)
		 VALUES ($1, $2, $3, $4)`, tenantID, action, detail, ok)
	if err != nil {
		r.log.Error("provisioning log write failed", "err", err, "action", action)
	}
}

// MigrateAll brings every tenant schema up to the version compiled into this
// binary. Run on deploy. Continues past a failing tenant so one bad schema
// does not block the fleet, and reports how many failed.
func (r *Registry) MigrateAll(ctx context.Context) (migrated int, failed int, err error) {
	target, err := migrate.TenantVersion()
	if err != nil {
		return 0, 0, err
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, schema_name, schema_version
		  FROM platform.tenants
		 WHERE status IN ('active', 'suspended') AND schema_version < $1
		 ORDER BY created_at`, target)
	if err != nil {
		return 0, 0, fmt.Errorf("list tenants: %w", err)
	}

	type pending struct {
		id      string
		schema  string
		version int
	}
	var todo []pending
	for rows.Next() {
		var p pending
		if err := rows.Scan(&p.id, &p.schema, &p.version); err != nil {
			rows.Close()
			return 0, 0, err
		}
		todo = append(todo, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}

	for _, p := range todo {
		if !ValidSchemaName(p.schema) {
			r.log.Error("refusing to migrate invalid schema name", "schema", p.schema, "tenant", p.id)
			failed++
			continue
		}
		v, mErr := migrate.Tenant(ctx, r.pool, p.schema, p.version, r.log)
		if mErr != nil {
			r.log.Error("tenant migration failed", "tenant", p.id, "schema", p.schema, "err", mErr)
			r.logProvision(ctx, p.id, "migrate", mErr.Error(), false)
			failed++
			continue
		}
		if _, uErr := r.pool.Exec(ctx,
			`UPDATE platform.tenants SET schema_version = $2 WHERE id = $1`, p.id, v); uErr != nil {
			r.log.Error("tenant version update failed", "tenant", p.id, "err", uErr)
			failed++
			continue
		}
		migrated++
	}
	return migrated, failed, nil
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const tenantCols = `id, organization_id, slug, name, schema_name, status, plan,
                    seats_purchased, data_region, country, schema_version`

func scanTenant(row pgx.Row) (*Tenant, error) {
	var t Tenant
	err := row.Scan(&t.ID, &t.OrganizationID, &t.Slug, &t.Name, &t.SchemaName,
		&t.Status, &t.Plan, &t.SeatsPurchased, &t.DataRegion, &t.Country, &t.SchemaVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Registry) ByID(ctx context.Context, id string) (*Tenant, error) {
	return scanTenant(r.pool.QueryRow(ctx,
		`SELECT `+tenantCols+` FROM platform.tenants WHERE id = $1`, id))
}

func (r *Registry) ByOrganization(ctx context.Context, orgID string) (*Tenant, error) {
	return scanTenant(r.pool.QueryRow(ctx,
		`SELECT `+tenantCols+` FROM platform.tenants WHERE organization_id = $1`, orgID))
}

// Membership is a user's seat in one tenant.
type Membership struct {
	Tenant *Tenant
	Role   string
	Status string
}

// MembershipsForUser lists every tenant a Supabase user has a seat in.
func (r *Registry) MembershipsForUser(ctx context.Context, userID string) ([]Membership, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT t.id, t.organization_id, t.slug, t.name, t.schema_name, t.status,
		       t.plan, t.seats_purchased, t.data_region, t.country, t.schema_version,
		       tu.role, tu.status
		  FROM platform.tenant_users tu
		  JOIN platform.tenants t ON t.id = tu.tenant_id
		 WHERE tu.user_id = $1 AND tu.status = 'active'
		 ORDER BY t.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Membership
	for rows.Next() {
		var t Tenant
		var m Membership
		if err := rows.Scan(&t.ID, &t.OrganizationID, &t.Slug, &t.Name, &t.SchemaName,
			&t.Status, &t.Plan, &t.SeatsPurchased, &t.DataRegion, &t.Country,
			&t.SchemaVersion, &m.Role, &m.Status); err != nil {
			return nil, err
		}
		m.Tenant = &t
		out = append(out, m)
	}
	return out, rows.Err()
}

// MembershipFor resolves one user's seat in one tenant.
func (r *Registry) MembershipFor(ctx context.Context, userID, tenantID string) (*Membership, error) {
	var t Tenant
	var m Membership
	err := r.pool.QueryRow(ctx, `
		SELECT t.id, t.organization_id, t.slug, t.name, t.schema_name, t.status,
		       t.plan, t.seats_purchased, t.data_region, t.country, t.schema_version,
		       tu.role, tu.status
		  FROM platform.tenant_users tu
		  JOIN platform.tenants t ON t.id = tu.tenant_id
		 WHERE tu.user_id = $1 AND tu.tenant_id = $2 AND tu.status = 'active'`,
		userID, tenantID,
	).Scan(&t.ID, &t.OrganizationID, &t.Slug, &t.Name, &t.SchemaName, &t.Status,
		&t.Plan, &t.SeatsPurchased, &t.DataRegion, &t.Country, &t.SchemaVersion,
		&m.Role, &m.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	m.Tenant = &t
	return &m, nil
}

// UpsertUser grants or updates a seat.
func (r *Registry) UpsertUser(ctx context.Context, tenantID, userID, email, role string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO platform.tenant_users (tenant_id, user_id, email, role, status)
		VALUES ($1, $2, $3, $4, 'active')
		ON CONFLICT (tenant_id, user_id)
		DO UPDATE SET role = EXCLUDED.role, email = EXCLUDED.email, status = 'active'`,
		tenantID, userID, email, role)
	return err
}

// ---------------------------------------------------------------------------
// The isolation boundary
// ---------------------------------------------------------------------------

// Conn is a pooled connection pinned to one tenant's schema.
type Conn struct {
	pgx.Tx
	release func()
}

func (c *Conn) Close(ctx context.Context) error {
	defer c.release()
	return c.Tx.Rollback(ctx)
}

func (c *Conn) Commit(ctx context.Context) error {
	defer c.release()
	return c.Tx.Commit(ctx)
}

// Acquire opens a transaction whose search_path is the tenant's schema and
// nothing else — `public` is deliberately excluded so an unqualified query can
// never silently fall through to a shared table.
//
// Every tenant-data query in the CRM MUST come from here.
func (r *Registry) Acquire(ctx context.Context, t *Tenant) (*Conn, error) {
	if t == nil {
		return nil, ErrNotFound
	}
	if t.Status != StatusActive {
		return nil, ErrNotActive
	}
	if !ValidSchemaName(t.SchemaName) {
		return nil, fmt.Errorf("refusing to use invalid schema name %q", t.SchemaName)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}

	// set_config with a bind parameter — the schema name is data, not SQL.
	// pg_catalog stays on the path so built-in functions resolve.
	if _, err := tx.Exec(ctx,
		`SELECT set_config('search_path', quote_ident($1) || ', pg_catalog', true)`,
		t.SchemaName); err != nil {
		_ = tx.Rollback(ctx)
		return nil, fmt.Errorf("pin search_path: %w", err)
	}

	return &Conn{Tx: tx, release: func() {}}, nil
}
