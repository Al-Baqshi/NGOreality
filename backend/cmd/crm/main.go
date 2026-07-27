// Command crm serves the multi-tenant NGO CRM.
//
// Deploys as its own Railway service against its own Postgres. It never
// connects to the Supabase database that holds the public registry — the only
// thing shared with the main platform is the Supabase JWT secret, used to
// verify tokens so an NGO signs in once.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"ngoreality/backend/internal/crm/auth"
	"ngoreality/backend/internal/crm/config"
	"ngoreality/backend/internal/crm/httpapi"
	"ngoreality/backend/internal/crm/migrate"
	"ngoreality/backend/internal/crm/supabase"
	"ngoreality/backend/internal/crm/tenant"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := config.Load()
	if err != nil {
		// Put the reason in the message itself. Railway's log viewer renders
		// the `msg` field of a JSON log line and hides the attributes, so
		// logging a bare "config" leaves an operator with a restart loop and
		// no way to tell why.
		fatal(log, "startup failed: "+err.Error())
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		fatal(log, "invalid CRM_DATABASE_URL: "+err.Error())
	}
	poolCfg.MaxConns = cfg.MaxConns
	poolCfg.MinConns = cfg.MinConns
	poolCfg.MaxConnLifetime = time.Hour
	poolCfg.MaxConnIdleTime = 15 * time.Minute
	poolCfg.HealthCheckPeriod = time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		fatal(log, "could not create the database pool: "+err.Error())
	}
	defer pool.Close()

	pingCtx, pingCancel := context.WithTimeout(ctx, 10*time.Second)
	err = pool.Ping(pingCtx)
	pingCancel()
	if err != nil {
		fatal(log, "database unreachable: "+err.Error())
	}

	// Control-plane migrations run on every boot; they are idempotent.
	migCtx, migCancel := context.WithTimeout(ctx, 2*time.Minute)
	err = migrate.Platform(migCtx, pool, log)
	migCancel()
	if err != nil {
		fatal(log, "platform migrations failed: "+err.Error())
	}

	registry := tenant.NewRegistry(pool, log)

	// Fan migrations out across tenant schemas. A tenant that fails is logged
	// and skipped so one broken schema cannot block the deploy; the count is
	// surfaced so it is not silent.
	if os.Getenv("CRM_SKIP_TENANT_MIGRATIONS") != "true" {
		tmCtx, tmCancel := context.WithTimeout(ctx, 30*time.Minute)
		migrated, failed, err := registry.MigrateAll(tmCtx)
		tmCancel()
		if err != nil {
			fatal(log, "tenant migrations failed: "+err.Error())
		}
		if failed > 0 {
			log.Error("some tenant migrations failed", "migrated", migrated, "failed", failed)
		} else if migrated > 0 {
			log.Info("tenant migrations complete", "migrated", migrated)
		}
	}

	// Verify the token-signing keys are reachable before accepting traffic, so
	// a wrong project ref fails at boot rather than on a user's first login.
	verifier := auth.NewVerifier(cfg.SupabaseJWTSecret, cfg.SupabaseProjectRef)
	if verifier.SupportsAsymmetric() {
		if err := verifier.WarmKeys(); err != nil {
			if cfg.SupabaseJWTSecret == "" {
				fatal(log, "could not load Supabase signing keys and no HS256 fallback is set: "+err.Error())
			}
			log.Warn("could not preload Supabase JWKS; falling back to HS256", "err", err)
		} else {
			log.Info("supabase signing keys loaded", "mode", "ES256/JWKS")
		}
	} else {
		log.Info("token verification configured", "mode", "HS256")
	}

	sb := supabase.New(cfg.SupabaseProjectRef, cfg.SupabaseAnonKey)
	if sb.Configured() {
		log.Info("self-serve signup enabled")
	} else {
		log.Warn("self-serve signup disabled: set SUPABASE_ANON_KEY to enable one-click workspace creation")
	}

	target, _ := migrate.TenantVersion()
	log.Info("crm starting", "addr", cfg.APIAddr, "tenant_schema_version", target)

	srv := &http.Server{
		Addr:              cfg.APIAddr,
		Handler:           httpapi.New(cfg, registry, verifier, sb, log).Handler(),
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server", "err", err)
			os.Exit(1)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	log.Info("shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
}

// fatal reports why the process is exiting in a form that survives log
// aggregation, then exits non-zero. Startup errors are the ones an operator
// sees as a restart loop, so the reason must be in the message itself.
func fatal(log *slog.Logger, msg string) {
	log.Error(msg)
	// Also write plainly to stderr: if the JSON handler or the log viewer
	// swallows the line, this still reaches `railway logs`.
	fmt.Fprintln(os.Stderr, "FATAL: "+msg)
	os.Exit(1)
}
