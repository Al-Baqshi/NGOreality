package supabase

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// newTestClient points a Client at a stub PostgREST.
func newTestClient(t *testing.T, handler http.HandlerFunc) (*Client, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	c := New("unused-ref", "test-anon-key")
	c.baseURL = srv.URL
	return c, srv
}

const (
	caller   = "11111111-1111-1111-1111-111111111111"
	attacker = "22222222-2222-2222-2222-222222222222"
	orgID    = "33333333-3333-3333-3333-333333333333"
)

// The query MUST constrain user_id. Relying on RLS alone was a real
// workspace-takeover bug: migration 021 lets any authenticated user read the
// membership rows of any listed charity, so an unfiltered query returned the
// genuine owner's row to a stranger and the signup handler believed them.
func TestOrganizationRoleFiltersOnUserID(t *testing.T) {
	var gotQuery url.Values

	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.Query()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]orgMember{
			{OrganizationID: orgID, UserID: caller, Role: "owner"},
		})
	})

	role, err := c.OrganizationRole(context.Background(), "tok", caller, orgID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if role != "owner" {
		t.Errorf("role = %q, want owner", role)
	}

	if got := gotQuery.Get("user_id"); got != "eq."+caller {
		t.Errorf("user_id filter = %q, want %q — without it RLS alone decides, and it is too permissive", got, "eq."+caller)
	}
	if got := gotQuery.Get("organization_id"); got != "eq."+orgID {
		t.Errorf("organization_id filter = %q, want %q", got, "eq."+orgID)
	}
}

// Even if a future policy or query change widens the result, a row belonging to
// somebody else must never be accepted as the caller's role.
func TestOrganizationRoleRejectsAnotherUsersRow(t *testing.T) {
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// The genuine owner's row, leaked by an over-broad policy.
		_ = json.NewEncoder(w).Encode([]orgMember{
			{OrganizationID: orgID, UserID: attacker, Role: "owner"},
		})
	})

	role, err := c.OrganizationRole(context.Background(), "tok", caller, orgID)
	if err == nil {
		t.Fatalf("expected a refusal, got role=%q", role)
	}
	if role != "" {
		t.Errorf("role must be empty on refusal, got %q", role)
	}
	if !strings.Contains(err.Error(), "different user") {
		t.Errorf("error should name the cause, got %q", err)
	}
}

func TestOrganizationRoleRejectsWrongOrganizationRow(t *testing.T) {
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]orgMember{
			{OrganizationID: "99999999-9999-9999-9999-999999999999", UserID: caller, Role: "owner"},
		})
	})

	if _, err := c.OrganizationRole(context.Background(), "tok", caller, orgID); err == nil {
		t.Fatal("a row for a different organisation was accepted")
	}
}

func TestOrganizationRoleEmptyWhenNotAMember(t *testing.T) {
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	})

	role, err := c.OrganizationRole(context.Background(), "tok", caller, orgID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if role != "" {
		t.Errorf("role = %q, want empty for a non-member", role)
	}
}

// A missing user id must fail closed rather than fall back to an unfiltered
// query, which is exactly how the original bug behaved.
func TestOrganizationRoleRequiresUserID(t *testing.T) {
	called := false
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	})

	if _, err := c.OrganizationRole(context.Background(), "tok", "", orgID); err == nil {
		t.Fatal("an empty user id was accepted")
	}
	if called {
		t.Error("no request should be sent without a user id")
	}
}

func TestOrganizationRoleTreatsDeniedAsNotAMember(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden} {
		c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(status)
		})
		role, err := c.OrganizationRole(context.Background(), "tok", caller, orgID)
		if err != nil {
			t.Errorf("status %d: unexpected error %v", status, err)
		}
		if role != "" {
			t.Errorf("status %d: role = %q, want empty", status, role)
		}
	}
}

// An upstream fault must not be reported as "no role" — that would silently
// downgrade to a deny, which is safe here, but it hides outages. It must error.
func TestOrganizationRoleErrorsOnUpstreamFailure(t *testing.T) {
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})

	if _, err := c.OrganizationRole(context.Background(), "tok", caller, orgID); err == nil {
		t.Fatal("a 500 from PostgREST was treated as success")
	}
}

func TestNotConfiguredFailsClosed(t *testing.T) {
	c := New("ref", "") // no anon key
	if c.Configured() {
		t.Fatal("a client with no anon key reports itself configured")
	}
	if _, err := c.OrganizationRole(context.Background(), "tok", caller, orgID); err == nil {
		t.Fatal("an unconfigured client returned a role instead of an error")
	}
}
