package auth

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"testing"
	"time"
)

func mintES256(t *testing.T, key *ecdsa.PrivateKey, kid string, claims map[string]any) string {
	t.Helper()
	enc := func(v any) string {
		b, err := json.Marshal(v)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		return base64.RawURLEncoding.EncodeToString(b)
	}
	input := enc(map[string]any{"alg": "ES256", "typ": "JWT", "kid": kid}) + "." + enc(claims)
	digest := sha256.Sum256([]byte(input))
	r, s, err := ecdsa.Sign(rand.Reader, key, digest[:])
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	// JWS wants fixed-width r||s, left-padded to the curve size.
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	return input + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func testVerifierES256(t *testing.T, key *ecdsa.PrivateKey, kid string) *Verifier {
	t.Helper()
	v := &Verifier{Leeway: 60 * time.Second}
	v.jwks = &JWKSCache{
		keys:      map[string]*ecdsa.PublicKey{kid: &key.PublicKey},
		fetchedAt: time.Now(),
		TTL:       time.Hour,
	}
	return v
}

func TestVerifyES256Valid(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	v := testVerifierES256(t, key, "kid-1")

	claims, err := v.Verify(mintES256(t, key, "kid-1", validClaims()))
	if err != nil {
		t.Fatalf("expected valid ES256 token, got %v", err)
	}
	if claims.Subject != "11111111-1111-1111-1111-111111111111" {
		t.Errorf("subject = %q", claims.Subject)
	}
}

func TestVerifyES256RejectsWrongKey(t *testing.T) {
	real, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	attacker, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	v := testVerifierES256(t, real, "kid-1")

	if _, err := v.Verify(mintES256(t, attacker, "kid-1", validClaims())); err == nil {
		t.Fatal("token signed by a different key was accepted")
	}
}

func TestVerifyES256RejectsUnknownKid(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	v := testVerifierES256(t, key, "kid-1")
	// Throttle the refresh so the test does not reach the network.
	v.jwks.lastAttempt = time.Now()
	v.jwks.MinRefreshInterval = time.Hour
	v.jwks.fetchedAt = time.Time{} // force a refresh attempt

	if _, err := v.Verify(mintES256(t, key, "kid-unknown", validClaims())); err == nil {
		t.Fatal("token with an unknown key id was accepted")
	}
}

// The central risk of mixing algorithms: an attacker who knows the PUBLIC key
// signs an HS256 token using it as the HMAC secret. Rejecting HS256 when no
// symmetric secret is configured closes that off.
func TestVerifyRejectsHS256WhenOnlyAsymmetricConfigured(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	v := testVerifierES256(t, key, "kid-1")

	pubBytes := elliptic.Marshal(elliptic.P256(), key.PublicKey.X, key.PublicKey.Y)
	forged := mint(t, string(pubBytes), map[string]any{"alg": "HS256"}, validClaims())

	if _, err := v.Verify(forged); err == nil {
		t.Fatal("HS256 token was accepted although only asymmetric keys are configured")
	}
}

func TestVerifyRejectsES256WhenOnlySecretConfigured(t *testing.T) {
	v := NewVerifier(testSecret, "") // no project ref => no JWKS
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)

	if _, err := v.Verify(mintES256(t, key, "kid-1", validClaims())); err == nil {
		t.Fatal("ES256 token was accepted with no JWKS configured")
	}
}

func TestVerifyES256RejectsMalformedSignatureLength(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if verifyES256(&key.PublicKey, "a.b", []byte{1, 2, 3}) {
		t.Fatal("a signature of the wrong length was accepted")
	}
}

func TestJWKToECDSARejectsOffCurvePoint(t *testing.T) {
	bad := jwk{
		Kty: "EC", Crv: "P-256",
		X: base64.RawURLEncoding.EncodeToString(big.NewInt(1).Bytes()),
		Y: base64.RawURLEncoding.EncodeToString(big.NewInt(1).Bytes()),
	}
	if _, err := bad.toECDSA(); err == nil {
		t.Fatal("a point that is not on P-256 was accepted")
	}
}
