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
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"ngoreality/backend/internal/crm/config"
	"ngoreality/backend/internal/crm/httpapi"
	"ngoreality/backend/internal/crm/migrate"
	"ngoreality/backend/internal/crm/tenant"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := config.Load()
	if err != nil {
		log.Error("config", "err", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Error("invalid CRM_DATABASE_URL", "err", err)
		os.Exit(1)
	}
	poolCfg.MaxConns = cfg.MaxConns
	poolCfg.MinConns = cfg.MinConns
	poolCfg.MaxConnLifetime = time.Hour
	poolCfg.MaxConnIdleTime = 15 * time.Minute
	poolCfg.HealthCheckPeriod = time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		log.Error("database pool", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	pingCtx, pingCancel := context.WithTimeout(ctx, 10*time.Second)
	err = pool.Ping(pingCtx)
	pingCancel()
	if err != nil {
		log.Error("database unreachable", "err", err)
		os.Exit(1)
	}

	// Control-plane migrations run on every boot; they are idempotent.
	migCtx, migCancel := context.WithTimeout(ctx, 2*time.Minute)
	err = migrate.Platform(migCtx, pool, log)
	migCancel()
	if err != nil {
		log.Error("platform migrations", "err", err)
		os.Exit(1)
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
			log.Error("tenant migrations", "err", err)
			os.Exit(1)
		}
		if failed > 0 {
			log.Error("some tenant migrations failed", "migrated", migrated, "failed", failed)
		} else if migrated > 0 {
			log.Info("tenant migrations complete", "migrated", migrated)
		}
	}

	target, _ := migrate.TenantVersion()
	log.Info("crm starting", "addr", cfg.APIAddr, "tenant_schema_version", target)

	srv := &http.Server{
		Addr:              cfg.APIAddr,
		Handler:           httpapi.New(cfg, registry, log).Handler(),
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
