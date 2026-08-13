package payments

// Payment initiation for Paymark (Worldline NZ) Online EFTPOS.
//
// Two calls, in order:
//
//	POST {base}/bearer
//	     Basic auth with base64(consumerKey:consumerSecret), body
//	     grant_type=client_credentials. Returns access_token + expires_in.
//
//	POST {base}/oe/transactions/v2/payments/create-intent
//	     Bearer auth with that token. Returns paymentId and, in HOSTED mode,
//	     a paymentUrl to send the payer to.
//
// HOSTED is used deliberately: Paymark renders the "enter your mobile number,
// approve in your banking app" flow, so no card data or bank credential ever
// touches this service, and there is nothing here to get PCI wrong.
//
// This file only STARTS a payment. Whether money actually arrived is decided
// solely by the signed notification verified in paymark.go — never by the
// response below, and never by the payer being redirected back. A payer can
// close the tab after approving, and an attacker can forge a return.
//
// Docs: https://developer.paymark.co.nz/wlob/

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// tokenSkew renews the bearer token this long before it actually expires, so a
// request cannot set off holding a token that dies in flight.
const tokenSkew = 60 * time.Second

// Client initiates Online EFTPOS payments. Safe for concurrent use.
type Client struct {
	env        Environment
	key        string
	secret     string
	merchantID string
	http       *http.Client

	// baseOverride points the client at a stub server in tests. Empty in
	// production, where the host is derived from the environment.
	baseOverride string

	mu       sync.Mutex
	token    string
	tokenExp time.Time
}

// base is the API host to call.
func (c *Client) base() string {
	if c.baseOverride != "" {
		return c.baseOverride
	}
	return c.env.APIBase()
}

func NewClient(env Environment, consumerKey, consumerSecret, merchantID string) *Client {
	return &Client{
		env:        env,
		key:        strings.TrimSpace(consumerKey),
		secret:     strings.TrimSpace(consumerSecret),
		merchantID: strings.TrimSpace(merchantID),
		http:       &http.Client{Timeout: 20 * time.Second},
	}
}

// Configured reports whether initiation is possible. All three parts are
// required: Paymark rejects a create-intent with no merchant, so refusing here
// gives a clear error instead of a confusing 4xx from a third party.
func (c *Client) Configured() bool {
	return c != nil && c.key != "" && c.secret != "" && c.merchantID != ""
}

// MerchantID exposes the configured merchant for diagnostics.
func (c *Client) MerchantID() string { return c.merchantID }

// Environment reports which Paymark host this client talks to.
func (c *Client) Environment() Environment { return c.env }

// bearer returns a cached token, fetching a new one when needed.
func (c *Client) bearer(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.token != "" && time.Now().Before(c.tokenExp) {
		return c.token, nil
	}

	form := url.Values{"grant_type": {"client_credentials"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.base()+"/bearer", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Basic "+
		base64.StdEncoding.EncodeToString([]byte(c.key+":"+c.secret)))

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("paymark token request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode != http.StatusOK {
		// The body is Paymark's, not ours, and may name the credential that is
		// wrong. Truncate rather than log a wall of HTML from an error page.
		return "", fmt.Errorf("paymark token: status %d: %s", resp.StatusCode, snippet(body))
	}

	var out struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("paymark token: decode: %w", err)
	}
	if out.AccessToken == "" {
		return "", fmt.Errorf("paymark token: response contained no access_token")
	}

	ttl := time.Duration(out.ExpiresIn) * time.Second
	if ttl <= tokenSkew {
		// Either a very short token or an absent expires_in. Do not cache a
		// token whose lifetime we cannot reason about.
		c.token, c.tokenExp = "", time.Time{}
		return out.AccessToken, nil
	}
	c.token = out.AccessToken
	c.tokenExp = time.Now().Add(ttl - tokenSkew)
	return c.token, nil
}

// IntentRequest is one payment to start.
type IntentRequest struct {
	AmountCents int64
	Currency    string // defaults to NZD
	// Reference is what the merchant sees on the statement and what ties the
	// notification back to an organisation — the NGR- payment reference.
	Reference       string
	NotificationURL string
	ReturnURL       string
	UserAgent       string
	UserIP          string
}

// Intent is the created payment.
type Intent struct {
	PaymentID             string `json:"paymentId"`
	MerchantTransactionID string `json:"merchantTransactionId"`
	// PaymentURL is where the payer completes the payment. HOSTED mode only.
	PaymentURL string `json:"paymentUrl"`
}

// CreateIntent starts a payment and returns the URL to send the payer to.
func (c *Client) CreateIntent(ctx context.Context, in IntentRequest) (*Intent, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("paymark initiation is not configured")
	}
	if in.AmountCents <= 0 {
		return nil, fmt.Errorf("amount must be positive")
	}
	if strings.TrimSpace(in.Reference) == "" {
		return nil, fmt.Errorf("reference is required")
	}
	if !strings.HasPrefix(in.NotificationURL, "https://") {
		// Paymark will not call back to http, and a silent non-callback looks
		// exactly like a customer who never paid.
		return nil, fmt.Errorf("notification URL must be https, got %q", in.NotificationURL)
	}

	currency := strings.TrimSpace(in.Currency)
	if currency == "" {
		currency = "NZD"
	}
	merchantTxnID, err := uuidV4()
	if err != nil {
		return nil, err
	}

	// Amount goes as a decimal string, matching the decimal string Paymark
	// sends back in the notification (see Notification.AmountCents).
	body := map[string]any{
		"merchantTransactionId": merchantTxnID,
		"integrationMode":       "HOSTED",
		"merchant": map[string]any{
			"merchantId":      c.merchantID,
			"url":             in.ReturnURL,
			"notificationUrl": in.NotificationURL,
		},
		"oepayment": map[string]any{
			"amount":    formatAmount(in.AmountCents),
			"currency":  currency,
			"reference": in.Reference,
		},
		"risk": map[string]any{
			"userAgentInfo": map[string]any{
				"userAgent":     firstNonEmpty(in.UserAgent, "NGOreality/1.0"),
				"userIpAddress": firstNonEmpty(in.UserIP, "0.0.0.0"),
			},
		},
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	token, err := c.bearer(ctx)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.base()+"/oe/transactions/v2/payments/create-intent",
		strings.NewReader(string(payload)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("paymark create-intent: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("paymark create-intent: status %d: %s", resp.StatusCode, snippet(raw))
	}

	var out Intent
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("paymark create-intent: decode: %w", err)
	}
	if out.PaymentURL == "" {
		// HOSTED mode is supposed to return one. Without it there is nowhere to
		// send the payer, so fail loudly rather than hand back a dead button.
		return nil, fmt.Errorf("paymark create-intent: no paymentUrl in response: %s", snippet(raw))
	}
	if out.MerchantTransactionID == "" {
		out.MerchantTransactionID = merchantTxnID
	}
	return &out, nil
}

// formatAmount renders cents as the decimal string Paymark expects: 7000 -> "70.00".
func formatAmount(cents int64) string {
	neg := ""
	if cents < 0 {
		neg, cents = "-", -cents
	}
	return fmt.Sprintf("%s%d.%02d", neg, cents/100, cents%100)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// snippet trims a third-party error body to something loggable.
func snippet(b []byte) string {
	s := strings.TrimSpace(string(b))
	if len(s) > 300 {
		return s[:300] + "…"
	}
	return s
}

// uuidV4 builds a random UUID without pulling in a dependency for one value.
func uuidV4() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("uuid: %w", err)
	}
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
