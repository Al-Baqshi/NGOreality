package httpapi

import "testing"

// The takeover this closes:
//
//	1. attacker signs up (any account)
//	2. join_organization(<a charity someone already manages>) → role 'admin'
//	3. POST /v1/signup → accepted, because 'admin' passed
//	4. Provision seats the attacker as OwnerUserID
//
// Step 3 is the only link in that chain this package controls, so 'admin' must
// never pass here again.
func TestCanProvisionWorkspaceOwnerOnly(t *testing.T) {
	cases := map[string]bool{
		"owner": true,

		// The takeover role. join_organization hands this out unconditionally.
		"admin": false,

		"":        false,
		"member":  false,
		"viewer":  false,
		"Owner":   false, // roles come from Postgres lower-cased; no case folding
		" owner ": false, // nor whitespace tolerance — an exact match or nothing
	}

	for role, want := range cases {
		if got := canProvisionWorkspace(role); got != want {
			t.Errorf("canProvisionWorkspace(%q) = %v, want %v", role, got, want)
		}
	}
}
