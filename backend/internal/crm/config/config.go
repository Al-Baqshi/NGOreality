// Package config loads settings for the CRM service.
//
// The CRM runs against its OWN Postgres, separate from the Supabase database
// that powers the marketing site, directory and monitoring. Beneficiary
// records must never share a cluster with the public registry data.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	// DatabaseURL is the CRM Postgres cluster (Railway), NOT Supabase.
	DatabaseURL string

	APIAddr string

	// SupabaseJWTSecret verifies access tokens minted by Supabase Auth, so
	// users who sign in on ngoreality.com can call this API directly.
	SupabaseJWTSecret string
	// SupabaseProjectRef builds the expected issuer claim.
	SupabaseProjectRef string

	// Central Baqshi auth (auth.baqshi.com). When Issuer is set, its tokens
	// are accepted alongside Supabase's, resolved to seat user ids through
	// platform.identity_links. Empty = off; nothing changes.
	CentralAuthIssuer   string
	CentralAuthAudience string
	CentralAuthAppKey   string

	// AdminAPIKey guards control-plane endpoints (tenant provisioning).
	AdminAPIKey string

	// PaymarkEnv selects which Paymark JWKS and API host to trust.
	// Defaults to sandbox: trusting production keys by accident is worse than
	// refusing a real payment loudly.
	PaymarkEnv string

	// SupabaseAnonKey is the project's public key. It is required by
	// Supabase's gateway on every PostgREST call; it grants nothing on its
	// own, since RLS decides access from the user's token.
	SupabaseAnonKey string

	AllowedOrigins []string

	MaxConns          int32
	MinConns          int32
	StatementTimeout  time.Duration
	ProvisionTimeout  time.Duration
	ShutdownTimeout   time.Duration
	ReadHeaderTimeout time.Duration
}

func Load() (Config, error) {
	dbURL := firstNonEmpty(
		os.Getenv("CRM_DATABASE_URL"),
		os.Getenv("DATABASE_URL"),
	)
	if dbURL == "" {
		return Config{}, fmt.Errorf(
			"CRM_DATABASE_URL is required: the CRM uses its own Postgres " +
				"(Railway), separate from the Supabase project",
		)
	}

	// Token verification needs EITHER the project ref (asymmetric ES256 keys,
	// fetched from the public JWKS endpoint — no secret involved) OR the legacy
	// symmetric JWT secret. Requiring at least one keeps the service failing
	// closed: it must never start unable to verify tokens.
	jwtSecret := strings.TrimSpace(os.Getenv("SUPABASE_JWT_SECRET"))
	projectRef := strings.TrimSpace(os.Getenv("SUPABASE_PROJECT_REF"))
	if jwtSecret == "" && projectRef == "" {
		return Config{}, fmt.Errorf(
			"token verification is not configured: set SUPABASE_PROJECT_REF " +
				"(preferred — verifies against the project's public JWKS keys) " +
				"or SUPABASE_JWT_SECRET for legacy HS256 projects",
		)
	}

	maxConns := int32(envInt("CRM_MAX_CONNS", 20))
	if maxConns < 2 {
		maxConns = 2
	}
	minConns := int32(envInt("CRM_MIN_CONNS", 2))
	if minConns > maxConns {
		minConns = maxConns
	}

	// Railway (and most PaaS) inject PORT and expect the process to bind it.
	// An explicit CRM_API_ADDR still wins for local runs.
	apiAddr := strings.TrimSpace(os.Getenv("CRM_API_ADDR"))
	if apiAddr == "" {
		if port := strings.TrimSpace(os.Getenv("PORT")); port != "" {
			apiAddr = ":" + port
		} else {
			apiAddr = ":8081"
		}
	}

	return Config{
		DatabaseURL:         dbURL,
		APIAddr:             apiAddr,
		SupabaseJWTSecret:   jwtSecret,
		SupabaseProjectRef:  projectRef,
		CentralAuthIssuer:   strings.TrimSpace(os.Getenv("CENTRAL_AUTH_ISSUER")),
		CentralAuthAudience: firstNonEmpty(strings.TrimSpace(os.Getenv("CENTRAL_AUTH_AUDIENCE")), "ngoreality"),
		CentralAuthAppKey:   strings.TrimSpace(os.Getenv("CENTRAL_AUTH_APP_KEY")),
		AdminAPIKey:         strings.TrimSpace(os.Getenv("CRM_ADMIN_API_KEY")),
		SupabaseAnonKey:     strings.TrimSpace(os.Getenv("SUPABASE_ANON_KEY")),
		PaymarkEnv:          envString("PAYMARK_ENV", "sandbox"),
		AllowedOrigins:      splitList(envString("CRM_ALLOWED_ORIGINS", "https://www.ngoreality.com,http://localhost:5173")),
		MaxConns:            maxConns,
		MinConns:            minConns,
		StatementTimeout:    envDuration("CRM_STATEMENT_TIMEOUT", 15*time.Second),
		ProvisionTimeout:    envDuration("CRM_PROVISION_TIMEOUT", 60*time.Second),
		ShutdownTimeout:     envDuration("CRM_SHUTDOWN_TIMEOUT", 15*time.Second),
		ReadHeaderTimeout:   envDuration("CRM_READ_HEADER_TIMEOUT", 10*time.Second),
	}, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if t := strings.TrimSpace(v); t != "" {
			return t
		}
	}
	return ""
}

func splitList(v string) []string {
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
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
