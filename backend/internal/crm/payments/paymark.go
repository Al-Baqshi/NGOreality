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
	"sort"
	"strconv"
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
// The tags below are the flat, documented spelling. A real sandbox callback
// does NOT use them: it carries paymentId rather than transactionId, and it
// nests the payment detail under an "oepayment" object the same way the
// create-intent request body does. Decoding by tag alone therefore yields an
// empty TransactionID and the notification is rejected as malformed — which is
// exactly what happened to the first sandbox payment, a verified AUTHORISED
// callback answered with a 401.
//
// So the tags are a fast path only, and normalise() recovers whatever they
// missed from Raw. Raw keeps the whole payload regardless.
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

// normalise backfills the fields the struct tags did not catch.
//
// Every field we depend on is looked up by a list of aliases rather than a
// single tag, because Paymark's vocabulary differs between its request bodies,
// its notification and its products. Matching generously here costs nothing
// and survives the next rename; guessing one name and being wrong loses a
// payment silently.
func (n *Notification) normalise() {
	if n.Raw == nil {
		return
	}
	// paymentId is Paymark's own identifier and is what the merchant portal
	// shows in its "Transaction ID" column, so it is both the right
	// idempotency key and the value staff reconcile against. Prefer it.
	// merchantTransactionId is OUR uuid from create-intent, useful only as a
	// last resort.
	n.TransactionID = firstNonEmpty(n.TransactionID,
		claimString(n.Raw, "paymentId", "transactionId", "merchantTransactionId"))
	n.MerchantID = firstNonEmpty(n.MerchantID, claimString(n.Raw, "merchantId"))
	n.Reference = firstNonEmpty(n.Reference,
		claimString(n.Raw, "merchantReference", "reference"))
	n.Status = firstNonEmpty(n.Status,
		claimString(n.Raw, "status", "transactionStatus", "paymentStatus"))
	n.AmountString = firstNonEmpty(n.AmountString, claimString(n.Raw, "amount"))
	n.Currency = firstNonEmpty(n.Currency, claimString(n.Raw, "currency"))
}

// claimString returns the first non-empty value among keys, as a string.
func claimString(raw map[string]any, keys ...string) string {
	for _, key := range keys {
		if s := lookupClaim(raw, key, true); s != "" {
			return s
		}
	}
	return ""
}

// lookupClaim finds key at the top level, then one level down inside nested
// objects. One level is enough for Paymark's shape and stops the search from
// wandering into the payer and bank detail, where a "reference" could mean
// something else entirely. Nested objects are visited in sorted key order so
// the result never depends on Go's random map iteration.
func lookupClaim(obj map[string]any, key string, descend bool) string {
	if s := claimToString(obj[key]); s != "" {
		return s
	}
	if !descend {
		return ""
	}
	for _, name := range sortedKeys(obj) {
		if child, ok := obj[name].(map[string]any); ok {
			if s := lookupClaim(child, key, false); s != "" {
				return s
			}
		}
	}
	return ""
}

// claimToString renders a JSON scalar. Numbers are formatted without exponent
// notation so an amount sent as 0.01 rather than "0.01" still parses.
func claimToString(v any) string {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case json.Number:
		return t.String()
	}
	return ""
}

func sortedKeys(obj map[string]any) []string {
	names := make([]string, 0, len(obj))
	for name := range obj {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// claimPaths lists the claim names present, including one level of nesting, as
// "parent.child". Names only, never values: the payload carries payer and bank
// detail that has no business in a log line.
func claimPaths(raw map[string]any) []string {
	var paths []string
	for _, name := range sortedKeys(raw) {
		if child, ok := raw[name].(map[string]any); ok {
			for _, sub := range sortedKeys(child) {
				paths = append(paths, name+"."+sub)
			}
			continue
		}
		paths = append(paths, name)
	}
	return paths
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
	_ = json.Unmarshal(pb, &n.Raw) // the whole payload, whatever its shape
	n.normalise()

	if n.ExpiresAt > 0 && time.Now().After(time.Unix(n.ExpiresAt, 0).Add(v.Leeway)) {
		return nil, ErrExpired
	}
	if strings.TrimSpace(n.TransactionID) == "" {
		// Name the claims that did arrive. A token that passes signature
		// verification and then fails to parse means Paymark renamed a field,
		// and without the names in the log the only way to learn the new shape
		// is another live payment.
		return nil, fmt.Errorf("%w: no transaction id in claims [%s]",
			ErrMalformed, strings.Join(claimPaths(n.Raw), " "))
	}

	return &n, nil
}
