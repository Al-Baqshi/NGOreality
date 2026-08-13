// Package payments receives and verifies payment notifications.
//
// Paymark (Cuscal / Worldline NZ) Online EFTPOS posts a SIGNED JWT to the
// notificationUrl once a payment reaches a terminal state, and publishes the
// public keys at a JWKS endpoint. That is the same verification shape as
// Supabase Auth, so the reasoning here mirrors internal/crm/auth — with one
// addition: Paymark may sign with RS256, so both RSA and ECDSA are supported.
//
// Docs: https://developer.paymark.co.nz/wlob/
package payments

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

var (
	ErrMalformed    = errors.New("malformed notification token")
	ErrBadSignature = errors.New("invalid notification signature")
	ErrExpired      = errors.New("notification token expired")
)

// Environment selects the Paymark JWKS and API host.
type Environment string

const (
	Sandbox    Environment = "sandbox"
	Production Environment = "production"
)

// JWKSURL returns the key set for the environment.
//
// The sandbox path is literally /worldlinejwks/ on a paymark.nz host — an
// artefact of the half-finished Worldline rebrand. It is correct; do not
// "tidy" it.
func (e Environment) JWKSURL() string {
	if e == Production {
		return "https://api.paymark.nz/worldlinejwks/OETransaction"
	}
	return "https://apitest.paymark.nz/worldlinejwks/OETransaction"
}

func (e Environment) APIBase() string {
	if e == Production {
		return "https://api.paymark.nz"
	}
	return "https://apitest.paymark.nz"
}

// Notification is the subset of the callback payload we act on.
//
// Field names are best-effort against the published documentation and MUST be
// confirmed against a real sandbox callback before go-live. Unknown fields are
// preserved in Raw so nothing is lost while the shape is being confirmed.
type Notification struct {
	TransactionID string         `json:"transactionId"`
	MerchantID    string         `json:"merchantId"`
	Reference     string         `json:"merchantReference"`
	Status        string         `json:"status"`
	AmountString  string         `json:"amount"`
	Currency      string         `json:"currency"`
	IssuedAt      int64          `json:"iat"`
	ExpiresAt     int64          `json:"exp"`
	Raw           map[string]any `json:"-"`
}

// Succeeded reports whether this notification represents money received.
//
// AUTHORISED is the one that matters: it is what Online EFTPOS actually sends
// for a successful payment (the documented terminal states are AUTHORISED,
// DECLINED, EXPIRED and ERROR). It was missing from this list, so every real
// sandbox success would have been recorded as a failure — the payment lands in
// the bank and the platform says it did not.
//
// The rest are kept because Paymark's vocabulary varies by product. Match
// generously but explicitly; never treat "unknown" as success.
func (n *Notification) Succeeded() bool {
	switch strings.ToUpper(strings.TrimSpace(n.Status)) {
	case "AUTHORISED", "AUTHORIZED",
		"COMPLETED", "COMPLETE", "SUCCESS", "SUCCESSFUL", "APPROVED", "PAID", "SETTLED":
		return true
	}
	return false
}

// AmountCents parses the amount, which Paymark sends as a decimal string.
func (n *Notification) AmountCents() (int64, error) {
	s := strings.TrimSpace(n.AmountString)
	if s == "" {
		return 0, fmt.Errorf("amount is empty")
	}
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")

	whole, frac, _ := strings.Cut(s, ".")
	if frac == "" {
		frac = "00"
	}
	for len(frac) < 2 {
		frac += "0"
	}
	if len(frac) > 2 {
		frac = frac[:2] // Paymark sends 2dp; refuse to guess at rounding
	}

	var cents int64
	if _, err := fmt.Sscanf(whole+frac, "%d", &cents); err != nil {
		return 0, fmt.Errorf("amount %q is not a number", n.AmountString)
	}
	if neg {
		cents = -cents
	}
	return cents, nil
}

// ---------------------------------------------------------------------------
// JWKS
// ---------------------------------------------------------------------------

type jwk struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Alg string `json:"alg"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// Verifier validates Paymark notification tokens.
type Verifier struct {
	env    Environment
	client *http.Client

	mu          sync.RWMutex
	keys        map[string]crypto.PublicKey
	fetchedAt   time.Time
	lastAttempt time.Time

	TTL                time.Duration
	MinRefreshInterval time.Duration
	Leeway             time.Duration

	// jwksURLOverride points the verifier at a stub key set in tests. Empty in
	// production, where the URL comes from the environment.
	jwksURLOverride string
}

// jwksURL is the key set to fetch.
func (v *Verifier) jwksURL() string {
	if v.jwksURLOverride != "" {
		return v.jwksURLOverride
	}
	return v.env.JWKSURL()
}

func NewVerifier(env Environment) *Verifier {
	return &Verifier{
		env:                env,
		client:             &http.Client{Timeout: 10 * time.Second},
		keys:               map[string]crypto.PublicKey{},
		TTL:                10 * time.Minute,
		MinRefreshInterval: 30 * time.Second,
		Leeway:             5 * time.Minute, // webhooks retry; be generous
	}
}

func (v *Verifier) Warm() error { return v.refresh() }

func (v *Verifier) refresh() error {
	v.mu.Lock()
	if time.Since(v.lastAttempt) < v.MinRefreshInterval {
		v.mu.Unlock()
		return fmt.Errorf("jwks refresh throttled")
	}
	v.lastAttempt = time.Now()
	v.mu.Unlock()

	resp, err := v.client.Get(v.jwksURL())
	if err != nil {
		return fmt.Errorf("fetch paymark jwks: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("fetch paymark jwks: status %d", resp.StatusCode)
	}

	var set struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return fmt.Errorf("decode paymark jwks: %w", err)
	}

	parsed := map[string]crypto.PublicKey{}
	for _, k := range set.Keys {
		pub, err := k.publicKey()
		if err != nil {
			continue
		}
		parsed[k.Kid] = pub
	}
	if len(parsed) == 0 {
		return fmt.Errorf("paymark jwks contained no usable keys")
	}

	v.mu.Lock()
	v.keys = parsed
	v.fetchedAt = time.Now()
	v.mu.Unlock()
	return nil
}

func (k jwk) publicKey() (crypto.PublicKey, error) {
	switch k.Kty {
	case "EC":
		// All three JOSE curves, not just P-256.
		//
		// Paymark's sandbox JWKS serves a single P-521 key. Accepting only
		// P-256 meant the key set parsed to nothing, Warm() reported "no usable
		// keys", and every payment notification would have failed signature
		// verification — money taken at the bank, nothing recorded here.
		var curve elliptic.Curve
		switch k.Crv {
		case "P-256":
			curve = elliptic.P256()
		case "P-384":
			curve = elliptic.P384()
		case "P-521":
			curve = elliptic.P521()
		default:
			return nil, fmt.Errorf("unsupported curve %q", k.Crv)
		}
		xb, err := base64.RawURLEncoding.DecodeString(k.X)
		if err != nil {
			return nil, err
		}
		yb, err := base64.RawURLEncoding.DecodeString(k.Y)
		if err != nil {
			return nil, err
		}
		pub := &ecdsa.PublicKey{
			Curve: curve,
			X:     new(big.Int).SetBytes(xb),
			Y:     new(big.Int).SetBytes(yb),
		}
		if !pub.Curve.IsOnCurve(pub.X, pub.Y) {
			return nil, fmt.Errorf("point is not on %s", k.Crv)
		}
		return pub, nil

	case "RSA":
		nb, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			return nil, err
		}
		eb, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			return nil, err
		}
		// The exponent is big-endian and usually 3 bytes (65537).
		padded := make([]byte, 8)
		copy(padded[8-len(eb):], eb)
		exp := binary.BigEndian.Uint64(padded)
		if exp == 0 || exp > 1<<31 {
			return nil, fmt.Errorf("implausible RSA exponent")
		}
		return &rsa.PublicKey{N: new(big.Int).SetBytes(nb), E: int(exp)}, nil
	}
	return nil, fmt.Errorf("unsupported key type %q", k.Kty)
}

func (v *Verifier) key(kid string) (crypto.PublicKey, error) {
	v.mu.RLock()
	k, ok := v.keys[kid]
	fresh := time.Since(v.fetchedAt) < v.TTL
	v.mu.RUnlock()
	if ok && fresh {
		return k, nil
	}

	if err := v.refresh(); err != nil {
		if ok {
			return k, nil // a stale key still verifies correctly
		}
		return nil, err
	}

	v.mu.RLock()
	k, ok = v.keys[kid]
	v.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("%w: unknown key id", ErrBadSignature)
	}
	return k, nil
}

// Verify validates the signed callback and returns its payload.
func (v *Verifier) Verify(token string) (*Notification, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return nil, ErrMalformed
	}

	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	hb, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || json.Unmarshal(hb, &header) != nil {
		return nil, ErrMalformed
	}

	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, ErrMalformed
	}

	pub, err := v.key(header.Kid)
	if err != nil {
		return nil, err
	}

	signingInput := []byte(parts[0] + "." + parts[1])

	// Pin the algorithm to the key type AND, for ECDSA, to the key's own curve.
	// Trusting the header alone is how algorithm-confusion attacks work — and
	// accepting ES256 against a P-521 key would also simply fail, since the
	// digest size and coordinate width both come from the curve.
	switch header.Alg {
	case "ES256", "ES384", "ES512":
		ecKey, ok := pub.(*ecdsa.PublicKey)
		if !ok {
			return nil, fmt.Errorf("%w: %s header but key is not ECDSA", ErrBadSignature, header.Alg)
		}

		var digest []byte
		var wantCurve elliptic.Curve
		switch header.Alg {
		case "ES256":
			d := sha256.Sum256(signingInput)
			digest, wantCurve = d[:], elliptic.P256()
		case "ES384":
			d := sha512.Sum384(signingInput)
			digest, wantCurve = d[:], elliptic.P384()
		default: // ES512
			d := sha512.Sum512(signingInput)
			digest, wantCurve = d[:], elliptic.P521()
		}
		if ecKey.Curve != wantCurve {
			return nil, fmt.Errorf("%w: %s header does not match the key's curve", ErrBadSignature, header.Alg)
		}

		// JOSE ECDSA signatures are the fixed-width r||s pair, each padded to
		// the curve's coordinate size — 32 bytes for P-256, 66 for P-521.
		n := (ecKey.Curve.Params().BitSize + 7) / 8
		if len(sig) != 2*n {
			return nil, ErrBadSignature
		}
		r := new(big.Int).SetBytes(sig[:n])
		s := new(big.Int).SetBytes(sig[n:])
		if !ecdsa.Verify(ecKey, digest, r, s) {
			return nil, ErrBadSignature
		}

	case "RS256":
		rsaKey, ok := pub.(*rsa.PublicKey)
		if !ok {
			return nil, fmt.Errorf("%w: RS256 header but key is not RSA", ErrBadSignature)
		}
		digest := sha256.Sum256(signingInput)
		if err := rsa.VerifyPKCS1v15(rsaKey, crypto.SHA256, digest[:], sig); err != nil {
			return nil, ErrBadSignature
		}
	default:
		return nil, fmt.Errorf("%w: unsupported alg %q", ErrBadSignature, header.Alg)
	}

	pb, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, ErrMalformed
	}

	var n Notification
	if err := json.Unmarshal(pb, &n); err != nil {
		return nil, ErrMalformed
	}
	_ = json.Unmarshal(pb, &n.Raw) // keep everything while the shape is unconfirmed

	if n.ExpiresAt > 0 && time.Now().After(time.Unix(n.ExpiresAt, 0).Add(v.Leeway)) {
		return nil, ErrExpired
	}
	if strings.TrimSpace(n.TransactionID) == "" {
		return nil, fmt.Errorf("%w: no transaction id", ErrMalformed)
	}

	return &n, nil
}
