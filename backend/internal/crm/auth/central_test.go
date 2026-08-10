package auth

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"errors"
	"testing"
	"time"
)

// centralTestVerifier builds a central-issuer verifier over a pre-seeded key
// cache, the same technique testVerifierES256 uses for the Supabase path.
func centralTestVerifier(t *testing.T, key *ecdsa.PrivateKey, kid string) *Verifier {
	t.Helper()
	v := NewCentralVerifier("https://auth.baqshi.com", "ngoreality")
	v.jwks.keys = map[string]*ecdsa.PublicKey{kid: &key.PublicKey}
	v.jwks.fetchedAt = time.Now()
	v.jwks.TTL = time.Hour
	// An unknown kid must fail fast in tests, not reach for the real network.
	v.jwks.lastAttempt = time.Now()
	v.jwks.MinRefreshInterval = time.Hour
	return v
}

func centralClaims() map[string]any {
	return map[string]any{
		"sub": "3f1c0a52-0000-0000-0000-000000000001",
		"iss": "https://auth.baqshi.com",
		"aud": "ngoreality",
		"exp": time.Now().Add(time.Minute).Unix(),
		"iat": time.Now().Unix(),
	}
}

func TestCentralVerifierAcceptsItsTokens(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	v := centralTestVerifier(t, key, "central-1")

	claims, err := v.Verify(mintES256(t, key, "central-1", centralClaims()))
	if err != nil {
		t.Fatalf("expected valid central token, got %v", err)
	}
	if claims.Subject != "3f1c0a52-0000-0000-0000-000000000001" {
		t.Fatalf("subject = %q", claims.Subject)
	}
}

func TestCentralVerifierRequiresOurAudience(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	v := centralTestVerifier(t, key, "central-1")

	// A genuine token for a SIBLING product. The central service signs every
	// Baqshi app with one key, so this is exactly what an attacker who
	// compromised qsme would present here.
	sibling := centralClaims()
	sibling["aud"] = "qsme"
	if _, err := v.Verify(mintES256(t, key, "central-1", sibling)); !errors.Is(err, ErrBadAudience) {
		t.Fatalf("sibling audience: got %v, want ErrBadAudience", err)
	}

	// The Supabase verifier treats an ABSENT aud as permitted (Supabase omits
	// it in some flows). The central verifier must not inherit that leniency:
	// central tokens always carry aud, so its absence is a forgery signal.
	absent := centralClaims()
	delete(absent, "aud")
	if _, err := v.Verify(mintES256(t, key, "central-1", absent)); !errors.Is(err, ErrBadAudience) {
		t.Fatalf("absent audience: got %v, want ErrBadAudience", err)
	}
}

func TestCentralVerifierRequiresItsIssuer(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	v := centralTestVerifier(t, key, "central-1")

	wrong := centralClaims()
	wrong["iss"] = "https://evil.example.com"
	if _, err := v.Verify(mintES256(t, key, "central-1", wrong)); !errors.Is(err, ErrBadIssuer) {
		t.Fatalf("wrong issuer: got %v, want ErrBadIssuer", err)
	}

	// Absent issuer: the Supabase path tolerates it for legacy HS256 tokens;
	// strictClaims must not.
	missing := centralClaims()
	delete(missing, "iss")
	if _, err := v.Verify(mintES256(t, key, "central-1", missing)); !errors.Is(err, ErrBadIssuer) {
		t.Fatalf("absent issuer: got %v, want ErrBadIssuer", err)
	}
}

func TestCentralVerifierHasNoHS256Path(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	v := centralTestVerifier(t, key, "central-1")

	// The downgrade attack: an HS256 token "signed" with public material. The
	// central verifier is constructed with no secret at all, so the HS256
	// branch is structurally closed, whatever the header claims.
	tok := mint(t, "any-bytes-the-attacker-likes",
		map[string]any{"alg": "HS256", "typ": "JWT", "kid": "central-1"}, centralClaims())
	if _, err := v.Verify(tok); err == nil {
		t.Fatal("an HS256 token was accepted by the central verifier")
	}
}

func TestChainTriesEachIssuerInOrder(t *testing.T) {
	supaKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	centralKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	supa := testVerifierES256(t, supaKey, "supa-1")
	// The shared fixture's cache has no HTTP client; make sure an unknown kid
	// is refused by the throttle instead of attempting a fetch.
	supa.jwks.lastAttempt = time.Now()
	supa.jwks.MinRefreshInterval = time.Hour
	central := centralTestVerifier(t, centralKey, "central-1")
	chain := Chain{supa, central}

	// A Supabase token verifies via the first link…
	if _, err := chain.Verify(mintES256(t, supaKey, "supa-1", validClaims())); err != nil {
		t.Fatalf("supabase token through chain: %v", err)
	}
	// …a central token via the second…
	claims, err := chain.Verify(mintES256(t, centralKey, "central-1", centralClaims()))
	if err != nil {
		t.Fatalf("central token through chain: %v", err)
	}
	if claims.Issuer != "https://auth.baqshi.com" {
		t.Fatalf("issuer = %q — the middleware routes on this, it must survive the chain", claims.Issuer)
	}
	// …and a token neither issuer signed fails both links.
	strangerKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if _, err := chain.Verify(mintES256(t, strangerKey, "supa-1", validClaims())); err == nil {
		t.Fatal("a stranger's token passed the chain")
	}
}
