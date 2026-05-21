package config

import (
	"strings"
	"testing"
)

func TestNormalizeDatabaseURL_specialPassword(t *testing.T) {
	raw := "postgresql://postgres.cpbilbskfbzqlynjhdvm:p@ss#word!@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
	fixed, err := normalizeDatabaseURL(raw)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := rebuildPostgresURL(fixed); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(fixed, "p@ss") {
		t.Fatalf("password should be encoded, got %q", fixed)
	}
	if _, err := normalizeDatabaseURL(fixed); err != nil {
		t.Fatalf("round-trip: %v", err)
	}
}

func TestNormalizeDatabaseURL_alreadyValid(t *testing.T) {
	// Password without reserved URL characters — may still need a real host to parse in pgx.
	raw := "postgresql://postgres.proj:plainpass@127.0.0.1:5432/postgres"
	fixed, err := normalizeDatabaseURL(raw)
	if err != nil {
		t.Fatal(err)
	}
	if fixed == "" {
		t.Fatal("empty result")
	}
}
