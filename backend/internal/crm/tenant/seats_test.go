package tenant

import "testing"

// Role assignment is a whitelist. The predecessor of this function mapped a
// Supabase role onto a workspace role and DEFAULTED to "admin" for anything
// unrecognised, which was one relaxed caller-side check away from making every
// viewer a workspace administrator. Unknown input must be rejected, not
// defaulted.
func TestIsAssignableRoleIsAWhitelist(t *testing.T) {
	for _, role := range []string{"admin", "caseworker", "volunteer", "viewer"} {
		if !IsAssignableRole(role) {
			t.Errorf("expected %q to be assignable", role)
		}
	}

	// "owner" is excluded on purpose: ownership is transferred, never granted
	// through an invitation or a role change.
	for _, role := range []string{
		"owner", "", "Admin", "ADMIN", "superuser", "root",
		"staff", "caseworker ", " admin", "owner\n",
	} {
		if IsAssignableRole(role) {
			t.Errorf("expected %q to be REJECTED as an assignable role", role)
		}
	}
}

// The invite token is a bearer secret. Only its hash is stored, so a leaked
// database backup must not yield working invitations.
func TestTokensAreUnpredictableAndHashed(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		tok, err := newToken()
		if err != nil {
			t.Fatalf("newToken: %v", err)
		}
		if len(tok) < 40 {
			t.Fatalf("token %q is too short to resist guessing", tok)
		}
		if seen[tok] {
			t.Fatal("newToken produced a duplicate")
		}
		seen[tok] = true

		h := hashToken(tok)
		if h == tok {
			t.Fatal("hashToken returned the token unchanged")
		}
		if len(h) != 64 {
			t.Errorf("expected a 64-char sha256 hex digest, got %d chars", len(h))
		}
		if hashToken(tok) != h {
			t.Error("hashToken is not deterministic")
		}
	}
}

func TestNormaliseEmail(t *testing.T) {
	cases := map[string]string{
		"  Person@Example.ORG ": "person@example.org",
		"person@example.org":    "person@example.org",
		"PERSON@EXAMPLE.ORG":    "person@example.org",
		"":                      "",
	}
	for in, want := range cases {
		if got := normaliseEmail(in); got != want {
			t.Errorf("normaliseEmail(%q) = %q, want %q", in, got, want)
		}
	}
}
