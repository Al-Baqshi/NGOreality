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
	Role           string `json:"role"`
}

// OrganizationRole returns the caller's role in an organisation, or an empty
// string when they have none.
//
// Because the request carries the user's own token, a user who is not a member
// simply gets zero rows back — there is no way to probe another NGO's data.
func (c *Client) OrganizationRole(ctx context.Context, userToken, organizationID string) (string, error) {
	if !c.Configured() {
		return "", fmt.Errorf("supabase membership checks are not configured")
	}

	endpoint := fmt.Sprintf(
		"%s/rest/v1/organization_members?select=organization_id,role&organization_id=eq.%s&limit=1",
		c.baseURL, url.QueryEscape(organizationID),
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
