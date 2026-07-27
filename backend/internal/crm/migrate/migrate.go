// Package migrate applies embedded SQL to the control plane and to each
// tenant schema.
//
// Schema-per-tenant means migrations fan out: one statement set, N schemas.
// The runner is idempotent and records a version per tenant so a partially
// completed rollout resumes rather than restarting.
package migrate

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed sql/platform/*.sql sql/tenant/*.sql
var sqlFS embed.FS

// Migration is one versioned SQL file.
type Migration struct {
	Version int
	Name    string
	SQL     string
}

// TenantVersion is the highest tenant migration version compiled into this
// binary. A tenant below this needs migrating.
func TenantVersion() (int, error) {
	ms, err := load("sql/tenant")
	if err != nil {
		return 0, err
	}
	if len(ms) == 0 {
		return 0, nil
	}
	return ms[len(ms)-1].Version, nil
}

func load(dir string) ([]Migration, error) {
	entries, err := fs.ReadDir(sqlFS, dir)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", dir, err)
	}

	out := make([]Migration, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		// Filenames are NNNN_name.sql
		parts := strings.SplitN(e.Name(), "_", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("migration %q: expected NNNN_name.sql", e.Name())
		}
		version, err := strconv.Atoi(parts[0])
		if err != nil {
			return nil, fmt.Errorf("migration %q: bad version prefix: %w", e.Name(), err)
		}
		body, err := fs.ReadFile(sqlFS, dir+"/"+e.Name())
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", e.Name(), err)
		}
		out = append(out, Migration{
			Version: version,
			Name:    strings.TrimSuffix(parts[1], ".sql"),
			SQL:     string(body),
		})
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Version < out[j].Version })

	for i := range out {
		if out[i].Version != i+1 {
			return nil, fmt.Errorf(
				"migrations in %s must be numbered consecutively from 1; got %d at position %d",
				dir, out[i].Version, i+1,
			)
		}
	}
	return out, nil
}

// Platform applies control-plane migrations. Safe to run on every boot.
func Platform(ctx context.Context, pool *pgxpool.Pool, log *slog.Logger) error {
	migrations, err := load("sql/platform")
	if err != nil {
		return err
	}

	// The first migration creates the bookkeeping table, so bootstrap it
	// before querying for applied versions.
	if _, err := pool.Exec(ctx, `CREATE SCHEMA IF NOT EXISTS platform`); err != nil {
		return fmt.Errorf("create platform schema: %w", err)
	}
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS platform.schema_migrations (
			version    integer PRIMARY KEY,
			name       text NOT NULL,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`); err != nil {
		return fmt.Errorf("create platform.schema_migrations: %w", err)
	}

	applied := map[int]bool{}
	rows, err := pool.Query(ctx, `SELECT version FROM platform.schema_migrations`)
	if err != nil {
		return fmt.Errorf("read applied migrations: %w", err)
	}
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			rows.Close()
			return err
		}
		applied[v] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, m := range migrations {
		if applied[m.Version] {
			continue
		}
		err := withTx(ctx, pool, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, m.SQL); err != nil {
				return err
			}
			_, err := tx.Exec(ctx,
				`INSERT INTO platform.schema_migrations (version, name) VALUES ($1, $2)
				 ON CONFLICT (version) DO NOTHING`,
				m.Version, m.Name)
			return err
		})
		if err != nil {
			return fmt.Errorf("platform migration %04d_%s: %w", m.Version, m.Name, err)
		}
		log.Info("platform migration applied", "version", m.Version, "name", m.Name)
	}
	return nil
}

// Tenant brings a single tenant schema up to the latest version. It assumes
// the schema already exists. Returns the version it reached.
//
// schemaName must already be validated — see tenant.ValidSchemaName. It is
// applied via SET LOCAL search_path with a quoted identifier, never
// concatenated into the migration SQL itself.
func Tenant(ctx context.Context, pool *pgxpool.Pool, schemaName string, from int, log *slog.Logger) (int, error) {
	migrations, err := load("sql/tenant")
	if err != nil {
		return from, err
	}

	current := from
	for _, m := range migrations {
		if m.Version <= current {
			continue
		}
		err := withTx(ctx, pool, func(tx pgx.Tx) error {
			// Quoted identifier: a schema name that somehow reached here
			// cannot break out of the quoting.
			if _, err := tx.Exec(ctx, `SELECT set_config('search_path', quote_ident($1), true)`, schemaName); err != nil {
				return fmt.Errorf("set search_path: %w", err)
			}
			if _, err := tx.Exec(ctx, m.SQL); err != nil {
				return err
			}
			return nil
		})
		if err != nil {
			return current, fmt.Errorf("tenant %s migration %04d_%s: %w", schemaName, m.Version, m.Name, err)
		}
		current = m.Version
		log.Info("tenant migration applied", "schema", schemaName, "version", m.Version, "name", m.Name)
	}
	return current, nil
}

func withTx(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
