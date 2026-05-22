package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ngoreality/backend/internal/config"
	"ngoreality/backend/internal/monitor"
	"ngoreality/backend/internal/notify"
	"ngoreality/backend/internal/store"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := config.Load()
	if err != nil {
		log.Error("failed to load config", "err", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	st, err := store.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database", "err", err)
		os.Exit(1)
	}
	defer st.Close()

	runner := monitor.NewRunner(cfg, st, log)
	notifier := notify.New(log, cfg)

	runCycle := func() {
		cycleCtx, cycleCancel := context.WithTimeout(ctx, 30*time.Minute)
		defer cycleCancel()

		if _, err := runner.RunOnce(cycleCtx); err != nil {
			log.Error("check cycle", "err", err)
		}
		if err := notifier.ProcessOpenIncidents(cycleCtx, st); err != nil {
			log.Error("notify", "err", err)
		}
	}

	runCycle()

	if cfg.WorkerRunOnce {
		log.Info("WORKER_RUN_ONCE=true, exiting")
		return
	}

	ticker := time.NewTicker(cfg.WorkerCheckInterval)
	defer ticker.Stop()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	log.Info("worker running", "interval", cfg.WorkerCheckInterval.String())

	for {
		select {
		case <-ticker.C:
			runCycle()
		case <-sigCh:
			log.Info("shutdown")
			return
		}
	}
}
