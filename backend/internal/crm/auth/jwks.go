package auth

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"
)

// Supabase signs access tokens with an asymmetric key (ES256) and publishes
// the public half at /auth/v1/.well-known/jwks.json. Verifying against that
// needs no shared secret at all — which is both simpler to operate and safer
// than distributing a symmetric signing key to every service that reads tokens.
//
// Legacy projects still use HS256 with the project JWT secret; that path is
// kept in jwt.go and used when SUPABASE_JWT_SECRET is configured.

type jwk struct {
	Kty string `json:"kty"`
	Crv string `json:"crv"`
	Kid string `json:"kid"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

type jwkSet struct {
	Keys []jwk `json:"keys"`
}

// JWKSCache fetches and caches Supabase's public signing keys.
type JWKSCache struct {
	url    string
	client *http.Client

	mu          sync.RWMutex
	keys        map[string]*ecdsa.PublicKey
	fetchedAt   time.Time
	lastAttempt time.Time

	// TTL is how long a successful fetch is trusted before refresh.
	TTL time.Duration
	// MinRefreshInterval throttles refetches. Without it, tokens carrying
	// unknown key IDs would let an unauthenticated caller drive one upstream
	// request per request.
	MinRefreshInterval time.Duration
}

func NewJWKSCache(projectRef string) *JWKSCache {
	return newJWKSCacheFromURL(fmt.Sprintf("https://%s.supabase.co/auth/v1/.well-known/jwks.json", projectRef))
}

// newJWKSCacheFromURL builds a cache for any JWKS endpoint — the central
// Baqshi issuer publishes the same document shape at its own URL.
func newJWKSCacheFromURL(url string) *JWKSCache {
	return &JWKSCache{
		url:                url,
		client:             &http.Client{Timeout: 10 * time.Second},
		keys:               map[string]*ecdsa.PublicKey{},
		TTL:                10 * time.Minute,
		MinRefreshInterval: 30 * time.Second,
	}
}

// key returns the public key for a kid, refreshing the set if needed.
func (c *JWKSCache) key(kid string) (*ecdsa.PublicKey, error) {
	c.mu.RLock()
	k, ok := c.keys[kid]
	fresh := time.Since(c.fetchedAt) < c.TTL
	c.mu.RUnlock()

	if ok && fresh {
		return k, nil
	}

	// Either the kid is unknown (key rotation) or the set is stale.
	if err := c.refresh(); err != nil {
		// A stale key still verifies correctly; prefer it over failing every
		// request because the JWKS endpoint is briefly unreachable.
		if ok {
			return k, nil
		}
		return nil, err
	}

	c.mu.RLock()
	k, ok = c.keys[kid]
	c.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("%w: unknown key id", ErrBadSignature)
	}
	return k, nil
}

func (c *JWKSCache) refresh() error {
	c.mu.Lock()
	if time.Since(c.lastAttempt) < c.MinRefreshInterval {
		c.mu.Unlock()
		return fmt.Errorf("jwks refresh throttled")
	}
	c.lastAttempt = time.Now()
	c.mu.Unlock()

	resp, err := c.client.Get(c.url)
	if err != nil {
		return fmt.Errorf("fetch jwks: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("fetch jwks: unexpected status %d", resp.StatusCode)
	}

	var set jwkSet
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return fmt.Errorf("decode jwks: %w", err)
	}

	parsed := make(map[string]*ecdsa.PublicKey, len(set.Keys))
	for _, k := range set.Keys {
		if k.Kty != "EC" || k.Crv != "P-256" {
			continue // only ES256 is supported
		}
		pub, err := k.toECDSA()
		if err != nil {
			continue
		}
		parsed[k.Kid] = pub
	}
	if len(parsed) == 0 {
		return fmt.Errorf("jwks contained no usable P-256 keys")
	}

	c.mu.Lock()
	c.keys = parsed
	c.fetchedAt = time.Now()
	c.mu.Unlock()
	return nil
}

func (k jwk) toECDSA() (*ecdsa.PublicKey, error) {
	xb, err := base64.RawURLEncoding.DecodeString(k.X)
	if err != nil {
		return nil, fmt.Errorf("jwk x: %w", err)
	}
	yb, err := base64.RawURLEncoding.DecodeString(k.Y)
	if err != nil {
		return nil, fmt.Errorf("jwk y: %w", err)
	}
	pub := &ecdsa.PublicKey{
		Curve: elliptic.P256(),
		X:     new(big.Int).SetBytes(xb),
		Y:     new(big.Int).SetBytes(yb),
	}
	if !pub.Curve.IsOnCurve(pub.X, pub.Y) {
		return nil, fmt.Errorf("jwk point is not on P-256")
	}
	return pub, nil
}

// Warm pre-loads the key set so the first request does not pay for the fetch,
// and so a misconfigured project ref shows up at boot rather than at login.
func (c *JWKSCache) Warm() error { return c.refresh() }

// verifyES256 checks an ECDSA P-256 signature over the JWT signing input.
func verifyES256(pub *ecdsa.PublicKey, signingInput string, sig []byte) bool {
	// JWS encodes ES256 signatures as the fixed-width concatenation r||s,
	// not as the ASN.1 DER that crypto/ecdsa's ASN.1 helpers expect.
	if len(sig) != 64 {
		return false
	}
	r := new(big.Int).SetBytes(sig[:32])
	s := new(big.Int).SetBytes(sig[32:])
	digest := sha256.Sum256([]byte(signingInput))
	return ecdsa.Verify(pub, digest[:], r, s)
}
