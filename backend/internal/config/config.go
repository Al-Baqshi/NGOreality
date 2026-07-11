package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL           string
	APIAddr               string
	APIKey                string
	WorkerRunOnce         bool
	WorkerSyncInterval    time.Duration
	WorkerCheckInterval   time.Duration
	CheckConcurrency      int
	CheckTimeout          time.Duration
	CheckFailureThreshold int
	MonitorStatuses       []string
	ResendAPIKey          string
	NotifyFromEmail       string
	NotifyStaffEmail      string
	TurnstileSecretKey    string
}

func Load() (Config, error) {
	loadEnvFiles()

	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		dbURL = strings.TrimSpace(os.Getenv("SUPABASE_DB_URL"))
	}
	if dbURL == "" {
		return Config{}, fmt.Errorf(
			"DATABASE_URL is required: create backend/.env (see backend/.env.example) with your Supabase Postgres URI from Dashboard → Project Settings → Database → Connection string → URI",
		)
	}

	normalized, normErr := normalizeDatabaseURL(dbURL)
	if normErr != nil {
		return Config{}, fmt.Errorf("DATABASE_URL: %w", normErr)
	}
	dbURL = normalized

	checkConcurrency := envInt("CHECK_CONCURRENCY", 25)
	if checkConcurrency < 1 {
		checkConcurrency = 1
	}

	failureThreshold := envInt("CHECK_FAILURE_THRESHOLD", 2)
	if failureThreshold < 1 {
		failureThreshold = 1
	}

	statuses := strings.Split(strings.TrimSpace(envString("MONITOR_STATUSES", "listed,onboarding,under_review,verified,active")), ",")
	trimmed := make([]string, 0, len(statuses))
	for _, s := range statuses {
		s = strings.TrimSpace(s)
		if s != "" {
			trimmed = append(trimmed, s)
		}
	}
	if len(trimmed) == 0 {
		trimmed = []string{"listed", "onboarding", "under_review", "verified", "active"}
	}

	return Config{
		DatabaseURL:           dbURL,
		APIAddr:               envString("API_ADDR", ":8080"),
		APIKey:                strings.TrimSpace(os.Getenv("API_KEY")),
		WorkerRunOnce:         envBool("WORKER_RUN_ONCE", false),
		WorkerSyncInterval:    envDuration("WORKER_SYNC_INTERVAL", 5*time.Minute),
		WorkerCheckInterval:   envDuration("WORKER_CHECK_INTERVAL", 15*time.Minute),
		CheckConcurrency:      checkConcurrency,
		CheckTimeout:          envDuration("CHECK_TIMEOUT", 12*time.Second),
		CheckFailureThreshold: failureThreshold,
		MonitorStatuses:       trimmed,
		ResendAPIKey:          strings.TrimSpace(os.Getenv("RESEND_API_KEY")),
		NotifyFromEmail:       envString("NOTIFY_FROM_EMAIL", "NGOreality <notifications@ngoreality.com>"),
		NotifyStaffEmail:      strings.TrimSpace(os.Getenv("NOTIFY_STAFF_EMAIL")),
		TurnstileSecretKey:    strings.TrimSpace(os.Getenv("TURNSTILE_SECRET_KEY")),
	}, nil
}

func envString(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func envBool(key string, fallback bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes"
}

func envDuration(key string, fallback time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}
