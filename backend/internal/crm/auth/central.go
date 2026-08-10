package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Central Baqshi auth (auth.baqshi.com) as a second trusted issuer.
//
// The CRM keeps trusting Supabase tokens exactly as before — staff and the
// super admin stay where they are — and additionally accepts ES256 tokens from
// the central Baqshi identity service, verified against its JWKS with the
// issuer and OUR audience required. The central service signs every Baqshi
// product with the same key, so the audience requirement is what stops a token
// minted for a sibling product from opening the CRM.
//
// Central subjects are foreign uuids: seats in platform.tenant_users are keyed
// by Supabase user ids. platform.identity_links bridges the two — resolved
// once per subject by matching the central account's VERIFIED email against
// the seat's email, then remembered. After resolution the Principal carries
// the seat's original user id, so ownership and audit columns downstream never
// see a second id for the same human.

// TokenVerifier is what the middleware needs from a verifier. *Verifier
// (Supabase) and Chain both satisfy it.
type TokenVerifier interface {
	Verify(token string) (*Claims, error)
}

// Chain tries each verifier in order and returns the first success. With two
// issuers the first is the overwhelmingly common one (Supabase today).
type Chain []TokenVerifier

func (c Chain) Verify(token string) (*Claims, error) {
	var lastErr error = ErrMalformed
	for _, v := range c {
		claims, err := v.Verify(token)
		if err == nil {
			return claims, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

// NewCentralVerifier builds a Verifier for the central Baqshi issuer.
// audience is this product's application slug there ("ngoreality").
func NewCentralVerifier(issuer, audience string) *Verifier {
	issuer = strings.TrimRight(issuer, "/")
	return &Verifier{
		Leeway: 60 * time.Second,
		// Reuse the ES256/JWKS machinery wholesale; only the URL and the
		// claim requirements differ from the Supabase path.
		jwks:             newJWKSCacheFromURL(issuer + "/.well-known/jwks.json"),
		expectedIssuer:   issuer,
		expectedAudience: audience,
		strictClaims:     true,
	}
}

// ── subject resolution ───────────────────────────────────────────────────────

// ErrNoSeat: the central account is real but no workspace seat matches it.
var ErrNoSeat = errors.New("no workspace seat for this central account")

// CentralResolver maps central subjects to the Supabase-era user ids that
// tenant seats are keyed by.
type CentralResolver struct {
	pool       *pgxpool.Pool
	issuer     string
	profileURL string
	appKey     string
	httpc      *http.Client
}

func NewCentralResolver(pool *pgxpool.Pool, issuer, appKey string) *CentralResolver {
	issuer = strings.TrimRight(issuer, "/")
	return &CentralResolver{
		pool:       pool,
		issuer:     issuer,
		profileURL: issuer + "/me",
		appKey:     appKey,
		httpc:      &http.Client{Timeout: 5 * time.Second},
	}
}

// Issuer reports which iss claim this resolver is responsible for.
func (r *CentralResolver) Issuer() string { return r.issuer }

// Resolve turns a central subject into the local (seat) user id and email.
// rawToken is the presented bearer token, forwarded on first sight so we can
// only ever learn about the person actually calling us.
func (r *CentralResolver) Resolve(ctx context.Context, subject, rawToken string) (string, string, error) {
	var userID, email string
	err := r.pool.QueryRow(ctx, `
		SELECT user_id::text, email FROM platform.identity_links WHERE central_subject = $1`,
		subject).Scan(&userID, &email)
	if err == nil {
		return userID, email, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", "", err
	}

	// First sight: ask the central service who this token belongs to.
	profile, err := r.fetchProfile(ctx, rawToken)
	if err != nil {
		return "", "", err
	}
	if profile.ID != subject {
		return "", "", fmt.Errorf("central profile id does not match token subject")
	}
	// Only a VERIFIED central email may claim a seat. Seats grant access to a
	// workspace's client data; an unverified address is just typed text, and
	// matching on it would let anyone seat themselves as any invitee.
	if profile.Email == "" || profile.EmailVerifiedAt == nil {
		return "", "", ErrNoSeat
	}

	// The seat's email is the bridge. Exactly one distinct seat-holder may
	// match: zero means no access, several means the email is ambiguous as an
	// identity and a human has to sort it out — guessing here would seat
	// someone in the wrong workspace.
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT user_id::text FROM platform.tenant_users
		WHERE lower(email) = lower($1) AND status = 'active'`, profile.Email)
	if err != nil {
		return "", "", err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return "", "", err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return "", "", err
	}
	if len(ids) != 1 {
		return "", "", ErrNoSeat
	}

	if _, err := r.pool.Exec(ctx, `
		INSERT INTO platform.identity_links (central_subject, user_id, email)
		VALUES ($1, $2::uuid, $3) ON CONFLICT (central_subject) DO NOTHING`,
		subject, ids[0], profile.Email); err != nil {
		return "", "", err
	}
	return ids[0], profile.Email, nil
}

type centralProfile struct {
	ID              string     `json:"id"`
	Email           string     `json:"email"`
	EmailVerifiedAt *time.Time `json:"email_verified_at"`
}

func (r *CentralResolver) fetchProfile(ctx context.Context, rawToken string) (*centralProfile, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.profileURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+rawToken)
	req.Header.Set("X-Baqshi-App", r.appKey)
	resp, err := r.httpc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("central profile: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("central profile: status %d", resp.StatusCode)
	}
	var p centralProfile
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&p); err != nil {
		return nil, err
	}
	return &p, nil
}
