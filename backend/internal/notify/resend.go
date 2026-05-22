package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type ResendClient struct {
	apiKey     string
	from       string
	staffBCC   string
	httpClient *http.Client
}

func NewResendClient(apiKey, from, staffBCC string) *ResendClient {
	return &ResendClient{
		apiKey:   strings.TrimSpace(apiKey),
		from:     strings.TrimSpace(from),
		staffBCC: strings.TrimSpace(staffBCC),
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *ResendClient) Enabled() bool {
	return c != nil && c.apiKey != "" && c.from != ""
}

type sendPayload struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	BCC     []string `json:"bcc,omitempty"`
	Subject string   `json:"subject"`
	Text    string   `json:"text"`
}

func (c *ResendClient) Send(ctx context.Context, to, subject, text string) error {
	if !c.Enabled() {
		return fmt.Errorf("resend not configured (set RESEND_API_KEY and NOTIFY_FROM_EMAIL)")
	}
	to = strings.TrimSpace(to)
	if to == "" {
		return fmt.Errorf("empty recipient")
	}

	body := sendPayload{
		From:    c.from,
		To:      []string{to},
		Subject: subject,
		Text:    text,
	}
	if c.staffBCC != "" {
		body.BCC = []string{c.staffBCC}
	}

	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("resend HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(respBody)))
	}
	return nil
}
