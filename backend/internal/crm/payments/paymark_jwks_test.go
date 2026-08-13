package payments

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

/*
Paymark's sandbox JWKS serves ONE key, on curve P-521:

	{"keys":[{"crv":"P-521","kid":"5322fb2d-…","kty":"EC","x":"…","y":"…"}]}

The verifier accepted only P-256, so the key set parsed to nothing and
/v1/payments/paymark/health reported "paymark jwks contained no usable keys".
Every notification would have failed verification — the payment succeeds at the
bank and the platform records nothing, which is the worst way for this to fail
because it looks like the customer never paid.

These tests pin the fix against a real P-521 key and a real ES512 signature.
*/

// jwksServer publishes one EC public key and returns its kid.
func jwksServer(t *testing.T, pub *ecdsa.PublicKey, crv string) (*httptest.Server, string) {
	t.Helper()
	kid := "test-kid"
	byteLen := (pub.Curve.Params().BitSize + 7) / 8
	pad := func(b []byte) string {
		out := make([]byte, byteLen)
		copy(out[byteLen-len(b):], b)
		return base64.RawURLEncoding.EncodeToString(out)
	}
	body, err := json.Marshal(map[string]any{
		"keys": []map[string]string{{
			"kty": "EC", "crv": crv, "kid": kid,
			"x": pad(pub.X.Bytes()), "y": pad(pub.Y.Bytes()),
		}},
	})
	if err != nil {
		t.Fatalf("marshal jwks: %v", err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv, kid
}

// signES builds a JOSE token signed with the given key, r||s zero-padded to the
// curve width — exactly the shape Paymark sends.
func signES(t *testing.T, key *ecdsa.PrivateKey, alg, kid string, claims map[string]any) string {
	t.Helper()
	hdr, err := json.Marshal(map[string]string{"alg": alg, "typ": "JWT", "kid": kid})
	if err != nil {
		t.Fatalf("marshal header: %v", err)
	}
	pay, err := json.Marshal(claims)
	if err != nil {
		t.Fatalf("marshal claims: %v", err)
	}
	signingInput := base64.RawURLEncoding.EncodeToString(hdr) + "." +
		base64.RawURLEncoding.EncodeToString(pay)

	var digest []byte
	switch alg {
	case "ES512":
		d := sha512.Sum512([]byte(signingInput))
		digest = d[:]
	case "ES384":
		d := sha512.Sum384([]byte(signingInput))
		digest = d[:]
	default:
		t.Fatalf("unsupported test alg %q", alg)
	}

	r, s, err := ecdsa.Sign(rand.Reader, key, digest)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	n := (key.Curve.Params().BitSize + 7) / 8
	sig := make([]byte, 2*n)
	r.FillBytes(sig[:n])
	s.FillBytes(sig[n:])

	return signingInput + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func newTestVerifier(t *testing.T, url string) *Verifier {
	t.Helper()
	v := NewVerifier(Sandbox)
	v.jwksURLOverride = url
	v.MinRefreshInterval = 0
	if err := v.Warm(); err != nil {
		t.Fatalf("Warm: %v", err)
	}
	return v
}

// The regression: a P-521 key set must parse, and an ES512 token must verify.
func TestVerifyES512OnP521(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P521(), rand.Reader)
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}
	srv, kid := jwksServer(t, &key.PublicKey, "P-521")
	v := newTestVerifier(t, srv.URL)

	token := signES(t, key, "ES512", kid, map[string]any{
		"merchantReference": "NGR-TEST",
		"status":            "AUTHORISED",
		"amount":            "1.00",
		"currency":          "NZD",
		"transactionId":     "txn-1",
		"exp":               time.Now().Add(time.Hour).Unix(),
	})

	n, err := v.Verify(token)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !n.Succeeded() {
		t.Errorf("AUTHORISED should count as success")
	}
	if n.Reference != "NGR-TEST" {
		t.Errorf("reference = %q", n.Reference)
	}
	cents, err := n.AmountCents()
	if err != nil || cents != 100 {
		t.Errorf("AmountCents() = %d, %v; want 100", cents, err)
	}
}

func TestVerifyES384OnP384(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}
	srv, kid := jwksServer(t, &key.PublicKey, "P-384")
	v := newTestVerifier(t, srv.URL)

	token := signES(t, key, "ES384", kid, map[string]any{
		"status": "AUTHORISED", "transactionId": "txn-1",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	if _, err := v.Verify(token); err != nil {
		t.Fatalf("Verify: %v", err)
	}
}

// A tampered payload must not verify, or the signature is decoration.
func TestVerifyRejectsTamperedPayload(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P521(), rand.Reader)
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}
	srv, kid := jwksServer(t, &key.PublicKey, "P-521")
	v := newTestVerifier(t, srv.URL)

	token := signES(t, key, "ES512", kid, map[string]any{
		"status": "DECLINED", "amount": "1.00",
		"exp": time.Now().Add(time.Hour).Unix(),
	})

	forged, err := json.Marshal(map[string]any{
		"status": "AUTHORISED", "amount": "1000.00",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	h, _, s := splitToken(t, token)
	tampered := h + "." + base64.RawURLEncoding.EncodeToString(forged) + "." + s

	if _, err := v.Verify(tampered); !errors.Is(err, ErrBadSignature) {
		t.Fatalf("tampered token verified or wrong error: %v", err)
	}
}

// Claiming ES256 over a P-521 key must be refused: the alg is pinned to the
// key's own curve, which is the defence against algorithm confusion.
func TestVerifyRejectsAlgCurveMismatch(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P521(), rand.Reader)
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}
	srv, kid := jwksServer(t, &key.PublicKey, "P-521")
	v := newTestVerifier(t, srv.URL)

	token := signES(t, key, "ES512", kid, map[string]any{
		"status": "AUTHORISED", "transactionId": "txn-1",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	_, p, s := splitToken(t, token)

	hdr, err := json.Marshal(map[string]string{"alg": "ES256", "typ": "JWT", "kid": kid})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	swapped := base64.RawURLEncoding.EncodeToString(hdr) + "." + p + "." + s

	if _, err := v.Verify(swapped); !errors.Is(err, ErrBadSignature) {
		t.Fatalf("alg/curve mismatch accepted or wrong error: %v", err)
	}
}

// An unknown curve must leave the key set empty rather than half-trusted.
func TestUnsupportedCurveYieldsNoKeys(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}
	srv, _ := jwksServer(t, &key.PublicKey, "P-999")
	v := NewVerifier(Sandbox)
	v.jwksURLOverride = srv.URL
	v.MinRefreshInterval = 0

	if err := v.Warm(); err == nil {
		t.Fatal("expected Warm to fail for an unsupported curve")
	}
}

func splitToken(t *testing.T, token string) (string, string, string) {
	t.Helper()
	var h, p, s string
	n := 0
	start := 0
	for i := 0; i < len(token); i++ {
		if token[i] == '.' {
			switch n {
			case 0:
				h = token[start:i]
			case 1:
				p = token[start:i]
			}
			n++
			start = i + 1
		}
	}
	s = token[start:]
	if n != 2 {
		t.Fatalf("token does not have three parts: %q", token)
	}
	return h, p, s
}
