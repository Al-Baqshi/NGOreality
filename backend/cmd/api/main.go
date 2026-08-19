package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
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

	mux.HandleFunc("POST /v1/turnstile/verify", func(w http.ResponseWriter, r *http.Request) {
		if !authorize(r, cfg.APIKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if cfg.TurnstileSecretKey == "" {
			writeJSON(w, http.StatusOK, map[string]bool{"success": true})
			return
		}

		var body struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil || body.Token == "" {
			writeJSON(w, http.StatusBadRequest, map[string]bool{"success": false})
			return
		}

		ok, err := verifyTurnstileToken(cfg.TurnstileSecretKey, body.Token)
		if err != nil {
			log.Error("turnstile verification", "err", err)
			writeJSON(w, http.StatusInternalServerError, map[string]bool{"success": false})
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"success": ok})
	})

	srv := &http.Server{
		Addr:              cfg.APIAddr,
		Handler:           corsMiddleware(mux, cfg.AllowedOrigins),
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

func verifyTurnstileToken(secretKey, token string) (bool, error) {
	resp, err := http.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", url.Values{
		"secret":   {secretKey},
		"response": {token},
	})
	if err != nil {
		return false, fmt.Errorf("turnstile request: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, fmt.Errorf("turnstile decode: %w", err)
	}
	return result.Success, nil
}

func corsMiddleware(next http.Handler, allowedOrigins []string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && isAllowedOrigin(origin, allowedOrigins) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Authorization")
			w.Header().Set("Access-Control-Max-Age", "86400")
		}
		if strings.EqualFold(r.Method, http.MethodOptions) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isAllowedOrigin(origin string, allowedOrigins []string) bool {
	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}
