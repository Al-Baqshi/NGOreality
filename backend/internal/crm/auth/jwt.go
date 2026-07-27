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

// Verifier checks tokens against the project JWT secret.
type Verifier struct {
	secret         []byte
	expectedIssuer string
	// Leeway absorbs small clock differences between Supabase and this host.
	Leeway time.Duration
}

func NewVerifier(secret, projectRef string) *Verifier {
	v := &Verifier{secret: []byte(secret), Leeway: 60 * time.Second}
	if projectRef != "" {
		v.expectedIssuer = fmt.Sprintf("https://%s.supabase.co/auth/v1", projectRef)
	}
	return v
}

// Verify parses and validates a compact JWS, returning its claims.
func (v *Verifier) Verify(token string) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, ErrMalformed
	}

	var header struct {
		Alg string `json:"alg"`
		Typ string `json:"typ"`
	}
	headerJSON, err := decodeSegment(parts[0])
	if err != nil {
		return nil, ErrMalformed
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, ErrMalformed
	}
	// Pin the algorithm. Accepting whatever the header claims is how "alg:none"
	// and RS256->HS256 confusion attacks work.
	if header.Alg != "HS256" {
		return nil, fmt.Errorf("%w: unsupported alg %q", ErrBadSignature, header.Alg)
	}

	signingInput := parts[0] + "." + parts[1]
	expectedMAC := signHS256(v.secret, signingInput)
	actualMAC, err := decodeSegment(parts[2])
	if err != nil {
		return nil, ErrMalformed
	}
	if !hmac.Equal(expectedMAC, actualMAC) {
		return nil, ErrBadSignature
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
