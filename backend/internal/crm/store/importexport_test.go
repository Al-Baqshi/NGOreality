package store

import "testing"

func TestParseFlexibleDate(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"2026-07-28", "2026-07-28", true},
		{"2026/07/28", "2026-07-28", true},
		// This is a New Zealand product: day-first must win for ambiguous input.
		{"28/07/2026", "2026-07-28", true},
		{"5/3/2026", "2026-03-05", true},
		{"28-07-2026", "2026-07-28", true},
		{"2026-07-28T10:30:00Z", "2026-07-28", true},
		{"not a date", "", false},
		{"", "", false},
		{"32/13/2026", "", false},
	}
	for _, c := range cases {
		got, ok := parseFlexibleDate(c.in)
		if ok != c.ok {
			t.Errorf("parseFlexibleDate(%q) ok = %v, want %v", c.in, ok, c.ok)
			continue
		}
		if ok && got != c.want {
			t.Errorf("parseFlexibleDate(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// A US-formatted date is genuinely ambiguous; document which way we resolve it
// so a future change is a deliberate decision rather than an accident.
func TestParseFlexibleDatePrefersDayFirst(t *testing.T) {
	got, ok := parseFlexibleDate("03/04/2026")
	if !ok {
		t.Fatal("expected 03/04/2026 to parse")
	}
	if got != "2026-04-03" {
		t.Errorf("got %q, want 2026-04-03 (3 April, day-first) — NZ convention", got)
	}
}

func TestCustomKey(t *testing.T) {
	cases := []struct{ in, want string }{
		{"housing status", "housing_status"},
		{"Referral Source", "referral_source"},
		{"notes (internal)", "notes_internal"},
		{"a  b", "a_b"},
		{"!!!", ""},
		{"", ""},
	}
	for _, c := range cases {
		// customKey receives an already-lowercased header.
		if got := customKey(lower(c.in)); got != c.want {
			t.Errorf("customKey(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func lower(s string) string {
	b := []rune(s)
	for i, r := range b {
		if r >= 'A' && r <= 'Z' {
			b[i] = r + 32
		}
	}
	return string(b)
}

func TestCleanDBErrorHidesInternals(t *testing.T) {
	msg := cleanDBError(errString(
		`ERROR: duplicate key value violates unique constraint "clients_reference_code_key" (SQLSTATE 23505)`))
	if msg != "a client with this reference code already exists" {
		t.Errorf("duplicate reference code should be explained plainly, got %q", msg)
	}

	msg = cleanDBError(errString("some failure (SQLSTATE 42P01)"))
	if contains(msg, "SQLSTATE") {
		t.Errorf("SQLSTATE should be stripped from user-facing text, got %q", msg)
	}

	long := make([]byte, 500)
	for i := range long {
		long[i] = 'x'
	}
	if len(cleanDBError(errString(string(long)))) > 200 {
		t.Error("error message should be truncated")
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

type errString string

func (e errString) Error() string { return string(e) }

// The header mapping is what makes a spreadsheet migration work; a regression
// here silently drops columns.
func TestCanonicalHeaderCoversCommonSpellings(t *testing.T) {
	mustMap := map[string]string{
		"first name": "given_name",
		"firstname":  "given_name",
		"surname":    "family_name",
		"last name":  "family_name",
		"email":      "contact_email",
		"mobile":     "contact_phone",
		"dob":        "date_of_birth",
		"suburb":     "city",
		"client id":  "reference_code",
	}
	for header, want := range mustMap {
		got, ok := canonicalHeader[header]
		if !ok {
			t.Errorf("header %q is not recognised", header)
			continue
		}
		if got != want {
			t.Errorf("header %q maps to %q, want %q", header, got, want)
		}
	}
}
