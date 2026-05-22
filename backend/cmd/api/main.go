package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
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

	ctx := context.Background()
	st, err := store.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database", "err", err)
		os.Exit(1)
	}
	defer st.Close()

	runner := monitor.NewRunner(cfg, st, log)
	notifier := notify.New(log, cfg)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("GET /v1/monitor/stats", func(w http.ResponseWriter, r *http.Request) {
		if !authorize(r, cfg.APIKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		stats, err := st.MonitorStats(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, stats)
	})

	mux.HandleFunc("POST /v1/notifications/process", func(w http.ResponseWriter, r *http.Request) {
		if !authorize(r, cfg.APIKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		procCtx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
		defer cancel()
		if err := notifier.ProcessOpenIncidents(procCtx, st); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		sum, _ := st.NotificationSummary(procCtx)
		writeJSON(w, http.StatusOK, sum)
	})

	mux.HandleFunc("GET /v1/notifications/summary", func(w http.ResponseWriter, r *http.Request) {
		if !authorize(r, cfg.APIKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		sum, err := st.NotificationSummary(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, sum)
	})

	mux.HandleFunc("POST /v1/monitor/run", func(w http.ResponseWriter, r *http.Request) {
		if !authorize(r, cfg.APIKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		runCtx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
		defer cancel()
		summary, err := runner.RunOnce(runCtx)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, summary)
	})

	srv := &http.Server{
		Addr:              cfg.APIAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Info("api listening", "addr", cfg.APIAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("server", "err", err)
			os.Exit(1)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}

func authorize(r *http.Request, apiKey string) bool {
	if apiKey == "" {
		return true
	}
	return r.Header.Get("X-API-Key") == apiKey
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
