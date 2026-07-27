package tenant

import "testing"

// ValidSchemaName is the last gate before an identifier reaches search_path.
// Anything that slips through here becomes a cross-tenant or injection bug,
// so the hostile cases matter more than the happy path.
func TestValidSchemaNameRejectsHostileInput(t *testing.T) {
	valid := []string{
		"tenant_redcross",
		"tenant_food_bank_2",
		"tenant_a",
		"tenant_org",
	}
	for _, s := range valid {
		if !ValidSchemaName(s) {
			t.Errorf("expected %q to be valid", s)
		}
	}

	invalid := []string{
		"",
		"redcross",                 // missing prefix
		"public",                   // shared schema
		"platform",                 // control plane
		"tenant_",                  // empty suffix
		"tenant_Redcross",          // uppercase
		"tenant_red-cross",         // hyphen
		"tenant_red cross",         // space
		`tenant_red"cross`,         // quote
		"tenant_red;DROP SCHEMA x", // statement break
		"tenant_red'--",            // comment
		"tenant_a.b",               // schema-qualified
		"pg_catalog",               //
		"tenant_" + longString(51), // over length
	}
	for _, s := range invalid {
		if ValidSchemaName(s) {
			t.Errorf("expected %q to be REJECTED", s)
		}
	}
}

func longString(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = 'a'
	}
	return string(b)
}

func TestSlugifyProducesSafeSchemaSuffixes(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Red Cross", "red_cross"},
		{"Te Whānau Trust", "te_wh_nau_trust"}, // non-ASCII collapses to separator
		{"Foodbank (Auckland) Ltd.", "foodbank_auckland_ltd"},
		{"  spaced  out  ", "spaced_out"},
		{"ALLCAPS", "allcaps"},
		{"123 Numbers", "123_numbers"},
		{"!!!", "org"}, // nothing usable → fallback
		{"", "org"},    // empty → fallback
		{"a-b-c", "a_b_c"},
	}
	for _, c := range cases {
		got := Slugify(c.in)
		if got != c.want {
			t.Errorf("Slugify(%q) = %q, want %q", c.in, got, c.want)
		}
		// Whatever the input, the derived schema name must be usable.
		if !ValidSchemaName("tenant_" + got) {
			t.Errorf("Slugify(%q) produced %q, which is not a valid schema suffix", c.in, got)
		}
	}
}

// Names long enough to overflow the identifier limit must still be safe.
func TestSlugifyTruncatesLongNames(t *testing.T) {
	long := "The Extremely Long Charitable Organisation Of Aotearoa New Zealand Incorporated"
	got := Slugify(long)
	if len(got) > 40 {
		t.Errorf("slug %q is %d chars, want <= 40", got, len(got))
	}
	if !ValidSchemaName("tenant_" + got) {
		t.Errorf("truncated slug %q is not a valid schema suffix", got)
	}
}

// A name that slugifies into a reserved word must not collide with a real
// Postgres schema.
func TestSlugifyHostileNamesStayValid(t *testing.T) {
	hostile := []string{
		`Robert'); DROP SCHEMA public; --`,
		`"; SELECT * FROM platform.tenants; --`,
		"../../etc/passwd",
		"tenant_other",
		"public",
	}
	for _, name := range hostile {
		slug := Slugify(name)
		schema := "tenant_" + slug
		if !ValidSchemaName(schema) {
			t.Errorf("Slugify(%q) → %q which fails validation (should be sanitised, not rejected later)", name, schema)
		}
	}
}
