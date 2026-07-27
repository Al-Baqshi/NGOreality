// Package auth verifies Supabase Auth access tokens.
//
// Supabase signs access tokens with HS256 using the project's JWT secret, so
// verification is an HMAC check — no key fetch, no extra dependency. Users who
// sign in on ngoreality.com can therefore call this API with the token they
// already hold; there is no second identity system to keep in sync.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrMalformed    = errors.New("malformed token")
	ErrBadSignature = errors.New("invalid token signature")
	ErrExpired      = errors.New("token expired")
	ErrNotYetValid  = errors.New("token not yet valid")
	ErrBadAudience  = errors.New("unexpected token audience")
	ErrBadIssuer    = errors.New("unexpected token issuer")
)

// Claims is the subset of the Supabase access token we rely on.
type Claims struct {
	Subject   string `json:"sub"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	Audience  string `json:"aud"`
	Issuer    string `json:"iss"`
	ExpiresAt int64  `json:"exp"`
	IssuedAt  int64  `json:"iat"`
	NotBefore int64  `json:"nbf"`
}

// Verifier checks Supabase access tokens.
//
// Supabase issues ES256 tokens signed by a key whose public half is published
// at a JWKS endpoint; that path needs no shared secret. Older projects sign
// HS256 with the project JWT secret, which is still accepted when configured.
type Verifier struct {
	secret         []byte
	jwks           *JWKSCache
	expectedIssuer string
	// Leeway absorbs small clock differences between Supabase and this host.
	Leeway time.Duration
}

// NewVerifier builds a verifier. `secret` may be empty when the project uses
// asymmetric keys; `projectRef` is then required so the JWKS URL can be built.
func NewVerifier(secret, projectRef string) *Verifier {
	v := &Verifier{secret: []byte(secret), Leeway: 60 * time.Second}
	if projectRef != "" {
		v.expectedIssuer = fmt.Sprintf("https://%s.supabase.co/auth/v1", projectRef)
		v.jwks = NewJWKSCache(projectRef)
	}
	return v
}

// WarmKeys pre-fetches the JWKS so a bad project ref surfaces at boot rather
// than on the first login. Returns nil when only HS256 is configured.
func (v *Verifier) WarmKeys() error {
	if v.jwks == nil {
		return nil
	}
	return v.jwks.Warm()
}

// SupportsAsymmetric reports whether JWKS verification is available.
func (v *Verifier) SupportsAsymmetric() bool { return v.jwks != nil }

// Verify parses and validates a compact JWS, returning its claims.
func (v *Verifier) Verify(token string) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, ErrMalformed
	}

	var header struct {
		Alg string `json:"alg"`
		Typ string `json:"typ"`
		Kid string `json:"kid"`
	}
	headerJSON, err := decodeSegment(parts[0])
	if err != nil {
		return nil, ErrMalformed
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, ErrMalformed
	}
	signingInput := parts[0] + "." + parts[1]
	signature, err := decodeSegment(parts[2])
	if err != nil {
		return nil, ErrMalformed
	}

	// Pin the algorithm to what this verifier is actually configured for.
	// Accepting whatever the header claims is how "alg:none" and
	// asymmetric->symmetric confusion attacks work: an attacker who knows the
	// public key could otherwise sign an HS256 token with it.
	switch header.Alg {
	case "ES256":
		if v.jwks == nil {
			return nil, fmt.Errorf("%w: ES256 token but no project ref configured", ErrBadSignature)
		}
		pub, err := v.jwks.key(header.Kid)
		if err != nil {
			return nil, err
		}
		if !verifyES256(pub, signingInput, signature) {
			return nil, ErrBadSignature
		}
	case "HS256":
		if len(v.secret) == 0 {
			return nil, fmt.Errorf("%w: HS256 token but no JWT secret configured", ErrBadSignature)
		}
		if !hmac.Equal(signHS256(v.secret, signingInput), signature) {
			return nil, ErrBadSignature
		}
	default:
		return nil, fmt.Errorf("%w: unsupported alg %q", ErrBadSignature, header.Alg)
	}

	payload, err := decodeSegment(parts[1])
	if err != nil {
		return nil, ErrMalformed
	}
	var claims Claims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, ErrMalformed
	}

	now := time.Now()
	if claims.ExpiresAt > 0 && now.After(time.Unix(claims.ExpiresAt, 0).Add(v.Leeway)) {
		return nil, ErrExpired
	}
	if claims.NotBefore > 0 && now.Before(time.Unix(claims.NotBefore, 0).Add(-v.Leeway)) {
		return nil, ErrNotYetValid
	}
	if claims.Audience != "" && claims.Audience != "authenticated" {
		return nil, ErrBadAudience
	}
	if v.expectedIssuer != "" && claims.Issuer != "" && claims.Issuer != v.expectedIssuer {
		return nil, ErrBadIssuer
	}
	if claims.Subject == "" {
		return nil, fmt.Errorf("%w: missing sub", ErrMalformed)
	}

	return &claims, nil
}

func signHS256(secret []byte, input string) []byte {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(input))
	return mac.Sum(nil)
}

// decodeSegment handles base64url without padding, as used by JWT.
func decodeSegment(seg string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(seg, "="))
}
