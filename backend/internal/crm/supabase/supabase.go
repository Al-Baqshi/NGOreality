// Package supabase talks to the main platform's PostgREST API to answer one
// question: does this user actually belong to this organisation?
//
// The call is made with the END USER'S own access token, never a service-role
// key. Supabase's RLS then decides what they can see, so this service cannot
// read more than the user could themselves — and no privileged Supabase
// credential has to exist in the CRM deployment at all.
package supabase

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	baseURL string
	anonKey string
	http    *http.Client
}

func New(projectRef, anonKey string) *Client {
	return &Client{
		baseURL: fmt.Sprintf("https://%s.supabase.co", projectRef),
		anonKey: anonKey,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// Configured reports whether membership checks are possible.
func (c *Client) Configured() bool {
	return c != nil && c.anonKey != "" && c.baseURL != ""
}

type orgMember struct {
	OrganizationID string `json:"organization_id"`
	UserID         string `json:"user_id"`
	Role           string `json:"role"`
}

// OrganizationRole returns THIS USER'S role in an organisation, or an empty
// string when they have none.
//
// SECURITY: the query filters on user_id explicitly. An earlier version relied
// on RLS alone, reasoning that "the request carries the user's own token, so a
// non-member gets zero rows back". That reasoning was wrong and the result was
// a workspace-takeover bug:
//
//	Migration 021 added a policy on organization_members whose USING clause is
//	  user_id = auth.uid() OR is_staff_user()
//	  OR organization_id IN (SELECT id FROM organizations
//	                         WHERE status IN ('listed','verified','active'))
//
//	— so ANY authenticated user can read the membership rows of ANY of the
//	~29,000 listed charities. The unfiltered query therefore returned the REAL
//	owner's row to a stranger, this function reported "owner", and the signup
//	handler provisioned that charity's workspace to the attacker, locking the
//	genuine charity out of its own organisation.
//
// Never infer "these rows are mine" from the presence of a token. Filter on
// the verified subject, and treat RLS as the second line, not the first.
func (c *Client) OrganizationRole(ctx context.Context, userToken, userID, organizationID string) (string, error) {
	if !c.Configured() {
		return "", fmt.Errorf("supabase membership checks are not configured")
	}
	if strings.TrimSpace(userID) == "" {
		return "", fmt.Errorf("membership lookup: userID is required")
	}

	endpoint := fmt.Sprintf(
		"%s/rest/v1/organization_members?select=organization_id,user_id,role&organization_id=eq.%s&user_id=eq.%s&limit=1",
		c.baseURL, url.QueryEscape(organizationID), url.QueryEscape(userID),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("apikey", c.anonKey)
	req.Header.Set("Authorization", "Bearer "+userToken)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("membership lookup: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return "", nil // treated as "not a member"
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("membership lookup: unexpected status %d", resp.StatusCode)
	}

	var rows []orgMember
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return "", fmt.Errorf("membership lookup: decode: %w", err)
	}
	if len(rows) == 0 {
		return "", nil
	}

	// Belt and braces: confirm the row that came back is actually this user's.
	// If a future policy or query change ever widens the result again, this
	// fails closed instead of handing over someone else's role.
	if rows[0].UserID != userID || rows[0].OrganizationID != organizationID {
		return "", fmt.Errorf(
			"membership lookup returned a row for a different user or organisation; refusing")
	}

	return rows[0].Role, nil
}

type organization struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Country *string `json:"country"`
}

// Organization fetches an organisation the caller can see. Returns nil when
// they cannot — again decided by RLS, not by this service.
func (c *Client) Organization(ctx context.Context, userToken, organizationID string) (*organization, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("supabase lookups are not configured")
	}

	endpoint := fmt.Sprintf(
		"%s/rest/v1/organizations?select=id,name,country&id=eq.%s&limit=1",
		c.baseURL, url.QueryEscape(organizationID),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", c.anonKey)
	req.Header.Set("Authorization", "Bearer "+userToken)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("organization lookup: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, nil
	}

	var rows []organization
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, fmt.Errorf("organization lookup: decode: %w", err)
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}
