package monitor

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type CheckResult struct {
	IsUp         bool
	StatusCode   *int
	LatencyMS    int
	ErrorMessage string
}

type Checker struct {
	client  *http.Client
	timeout time.Duration
}

func NewChecker(timeout time.Duration) *Checker {
	return &Checker{
		timeout: timeout,
		client: &http.Client{
			Timeout: timeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return fmt.Errorf("too many redirects")
				}
				return nil
			},
		},
	}
}

func NormalizeURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("empty url")
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("unsupported scheme: %s", u.Scheme)
	}
	if u.Host == "" {
		return "", fmt.Errorf("missing host")
	}
	return u.String(), nil
}

func (c *Checker) Check(ctx context.Context, rawURL string) CheckResult {
	start := time.Now()

	normalized, err := NormalizeURL(rawURL)
	if err != nil {
		return CheckResult{
			IsUp:         false,
			LatencyMS:    int(time.Since(start).Milliseconds()),
			ErrorMessage: err.Error(),
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, normalized, nil)
	if err != nil {
		return failResult(start, err)
	}
	req.Header.Set("User-Agent", "NGOreality-Monitor/1.0 (+https://www.ngoreality.com)")

	resp, err := c.client.Do(req)
	latency := int(time.Since(start).Milliseconds())
	if err != nil {
		msg := err.Error()
		if ne, ok := err.(net.Error); ok && ne.Timeout() {
			msg = fmt.Sprintf("timeout after %s", c.timeout)
		}
		return CheckResult{IsUp: false, LatencyMS: latency, ErrorMessage: msg}
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))

	code := resp.StatusCode
	up := code >= 200 && code < 400
	msg := ""
	if !up {
		msg = fmt.Sprintf("HTTP %d", code)
	}

	return CheckResult{
		IsUp:         up,
		StatusCode:   &code,
		LatencyMS:    latency,
		ErrorMessage: msg,
	}
}

func failResult(start time.Time, err error) CheckResult {
	return CheckResult{
		IsUp:         false,
		LatencyMS:    int(time.Since(start).Milliseconds()),
		ErrorMessage: err.Error(),
	}
}
