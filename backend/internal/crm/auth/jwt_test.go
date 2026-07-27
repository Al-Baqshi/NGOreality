package auth

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

const testSecret = "super-secret-jwt-value-for-testing-only"

func mint(t *testing.T, secret string, header map[string]any, claims map[string]any) string {
	t.Helper()
	enc := func(v any) string {
		b, err := json.Marshal(v)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		return base64.RawURLEncoding.EncodeToString(b)
	}
	input := enc(header) + "." + enc(claims)
	sig := signHS256([]byte(secret), input)
	return input + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func validClaims() map[string]any {
	return map[string]any{
		"sub":   "11111111-1111-1111-1111-111111111111",
		"email": "worker@charity.org.nz",
		"aud":   "authenticated",
		"role":  "authenticated",
		"exp":   time.Now().Add(time.Hour).Unix(),
		"iat":   time.Now().Unix(),
	}
}

func TestVerifyAcceptsValidToken(t *testing.T) {
	v := NewVerifier(testSecret, "")
	tok := mint(t, testSecret, map[string]any{"alg": "HS256", "typ": "JWT"}, validClaims())

	claims, err := v.Verify(tok)
	if err != nil {
		t.Fatalf("expected valid token, got %v", err)
	}
	if claims.Subject != "11111111-1111-1111-1111-111111111111" {
		t.Errorf("subject = %q", claims.Subject)
	}
	if claims.Email != "worker@charity.org.nz" {
		t.Errorf("email = %q", claims.Email)
	}
}

func TestVerifyRejectsWrongSecret(t *testing.T) {
	v := NewVerifier(testSecret, "")
	tok := mint(t, "a-different-secret-entirely", map[string]any{"alg": "HS256"}, validClaims())

	if _, err := v.Verify(tok); err == nil {
		t.Fatal("token signed with the wrong secret was accepted")
	}
}

// The classic JWT attack: strip the signature and claim no algorithm.
func TestVerifyRejectsAlgNone(t *testing.T) {
	v := NewVerifier(testSecret, "")

	enc := func(v any) string {
		b, _ := json.Marshal(v)
		return base64.RawURLEncoding.EncodeToString(b)
	}
	tok := enc(map[string]any{"alg": "none", "typ": "JWT"}) + "." + enc(validClaims()) + "."

	if _, err := v.Verify(tok); err == nil {
		t.Fatal("alg:none token was accepted")
	}
}

// An attacker must not be able to downgrade RS256 to HS256 and sign with a
// public key. We only ever accept HS256, so the header alg is pinned.
func TestVerifyRejectsUnexpectedAlg(t *testing.T) {
	v := NewVerifier(testSecret, "")
	tok := mint(t, testSecret, map[string]any{"alg": "RS256"}, validClaims())

	if _, err := v.Verify(tok); err == nil {
		t.Fatal("RS256 header was accepted")
	}
}

func TestVerifyRejectsExpired(t *testing.T) {
	v := NewVerifier(testSecret, "")
	c := validClaims()
	c["exp"] = time.Now().Add(-2 * time.Hour).Unix()
	tok := mint(t, testSecret, map[string]any{"alg": "HS256"}, c)

	if _, err := v.Verify(tok); err != ErrExpired {
		t.Fatalf("expected ErrExpired, got %v", err)
	}
}

func TestVerifyRejectsTamperedPayload(t *testing.T) {
	v := NewVerifier(testSecret, "")
	tok := mint(t, testSecret, map[string]any{"alg": "HS256"}, validClaims())

	parts := strings.Split(tok, ".")
	forged := validClaims()
	forged["sub"] = "22222222-2222-2222-2222-222222222222"
	b, _ := json.Marshal(forged)
	parts[1] = base64.RawURLEncoding.EncodeToString(b)

	if _, err := v.Verify(strings.Join(parts, ".")); err != ErrBadSignature {
		t.Fatalf("expected ErrBadSignature after swapping the subject, got %v", err)
	}
}

func TestVerifyRejectsBadAudienceAndIssuer(t *testing.T) {
	v := NewVerifier(testSecret, "myprojectref")

	c := validClaims()
	c["aud"] = "some-other-service"
	if _, err := v.Verify(mint(t, testSecret, map[string]any{"alg": "HS256"}, c)); err != ErrBadAudience {
		t.Errorf("expected ErrBadAudience, got %v", err)
	}

	c = validClaims()
	c["iss"] = "https://evil.supabase.co/auth/v1"
	if _, err := v.Verify(mint(t, testSecret, map[string]any{"alg": "HS256"}, c)); err != ErrBadIssuer {
		t.Errorf("expected ErrBadIssuer, got %v", err)
	}

	c = validClaims()
	c["iss"] = "https://myprojectref.supabase.co/auth/v1"
	if _, err := v.Verify(mint(t, testSecret, map[string]any{"alg": "HS256"}, c)); err != nil {
		t.Errorf("matching issuer should verify, got %v", err)
	}
}

func TestVerifyRejectsMalformed(t *testing.T) {
	v := NewVerifier(testSecret, "")
	for _, tok := range []string{"", "abc", "a.b", "a.b.c.d", "!!!.???.###"} {
		if _, err := v.Verify(tok); err == nil {
			t.Errorf("malformed token %q was accepted", tok)
		}
	}
}

func TestVerifyRequiresSubject(t *testing.T) {
	v := NewVerifier(testSecret, "")
	c := validClaims()
	delete(c, "sub")
	if _, err := v.Verify(mint(t, testSecret, map[string]any{"alg": "HS256"}, c)); err == nil {
		t.Fatal("token without a subject was accepted")
	}
}

func TestRolePermissions(t *testing.T) {
	cases := []struct {
		role                              Role
		read, write, sensitive, adminPerm bool
	}{
		{RoleOwner, true, true, true, true},
		{RoleAdmin, true, true, true, true},
		{RoleCaseworker, true, true, true, false},
		{RoleVolunteer, true, true, false, false},
		{RoleViewer, true, false, false, false},
		{Role("bogus"), false, false, false, false},
	}
	for _, c := range cases {
		p := &Principal{Role: c.role}
		if p.CanRead() != c.read {
			t.Errorf("%s CanRead = %v, want %v", c.role, p.CanRead(), c.read)
		}
		if p.CanWrite() != c.write {
			t.Errorf("%s CanWrite = %v, want %v", c.role, p.CanWrite(), c.write)
		}
		if p.CanAccessSensitive() != c.sensitive {
			t.Errorf("%s CanAccessSensitive = %v, want %v", c.role, p.CanAccessSensitive(), c.sensitive)
		}
		if p.IsAdmin() != c.adminPerm {
			t.Errorf("%s IsAdmin = %v, want %v", c.role, p.IsAdmin(), c.adminPerm)
		}
	}
}
