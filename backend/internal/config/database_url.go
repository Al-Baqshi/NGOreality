package config

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// normalizeDatabaseURL fixes Supabase URIs when the password contains characters
// that must be percent-encoded in the userinfo section (@ : / ? # etc.).
func normalizeDatabaseURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.Trim(raw, `"'`)
	if raw == "" {
		return "", fmt.Errorf("empty database url")
	}

	// Always rebuild so passwords with @, #, %, etc. are percent-encoded for pgx/net/url.
	fixed, err := rebuildPostgresURL(raw)
	if err != nil {
		return "", err
	}
	if _, err := pgxpool.ParseConfig(fixed); err != nil {
		return "", fmt.Errorf("invalid database url: %w", err)
	}
	return fixed, nil
}

func rebuildPostgresURL(raw string) (string, error) {
	scheme := "postgresql"
	rest := raw
	switch {
	case strings.HasPrefix(rest, "postgresql://"):
		rest = strings.TrimPrefix(rest, "postgresql://")
	case strings.HasPrefix(rest, "postgres://"):
		scheme = "postgres"
		rest = strings.TrimPrefix(rest, "postgres://")
	default:
		return "", fmt.Errorf("expected postgresql:// or postgres:// URL")
	}

	query := ""
	if i := strings.Index(rest, "?"); i >= 0 {
		query = rest[i:]
		rest = rest[:i]
	}

	pathIdx := strings.Index(rest, "/")
	if pathIdx < 0 {
		return "", fmt.Errorf("missing database name in URL path")
	}
	path := rest[pathIdx:]
	authority := rest[:pathIdx]

	at := strings.LastIndex(authority, "@")
	if at < 0 {
		return "", fmt.Errorf("missing host in database URL")
	}
	userinfo := authority[:at]
	hostport := authority[at+1:]

	colon := strings.Index(userinfo, ":")
	if colon < 0 {
		// No password segment — return as-is for pgx to validate.
		return raw, nil
	}

	user := userinfo[:colon]
	password := userinfo[colon+1:]

	// Decode once if the password was partially encoded, then re-encode fully.
	if dec, err := url.PathUnescape(password); err == nil {
		password = dec
	}

	u := url.URL{
		Scheme: scheme,
		User:   url.UserPassword(user, password),
		Host:   hostport,
		Path:   path,
	}
	if query != "" {
		u.RawQuery = strings.TrimPrefix(query, "?")
	}
	return u.String(), nil
}
