// Command monitor performs the website checks members pay for.
//
// WHY THIS EXISTS SEPARATELY FROM cmd/worker
//
// cmd/worker does the same job over a direct Postgres connection, which needs
// DATABASE_URL. Supabase never exposes the database password through its API —
// it can only be reset in the dashboard — so that binary cannot be deployed
// without a human pasting a credential.
//
// This one talks to Supabase over PostgREST using a worker key that can call
// exactly two functions: monitor_fetch_due and monitor_record. That is
// deliberately less power than DATABASE_URL, not a lesser substitute for it. If
// this container is compromised, the attacker can record website check results.
// They cannot read a member's beneficiary records, issue a badge, or touch
// payments.
//
// It also has to run somewhere with real outbound HTTP. A Supabase Edge
// Function cannot do this job: sites that answer 200 from an ordinary host time
// out there, and an earlier attempt reported 4.5% of the sector up against a
// measured baseline of 86.2% — it was recording its own connection limit as
// charity outages.
//
// Only ONE monitor may run at a time. If cmd/worker is deployed, do not run
// this as well, or every site is checked twice and members get duplicate alerts.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type config struct {
	supabaseURL string
	anonKey     string
	workerKey   string
	batchSize   int
	concurrency int
	interval    time.Duration
	timeout     time.Duration
	runOnce     bool
}

// failureThreshold is how many consecutive failures before a site is called
// down. One timeout is usually the network, not an outage; alerting on a single
// blip trains members to ignore us, which is worse than not alerting at all.
const failureThreshold = 2

// baselineUpRate is what the original Go worker measured across 39,728 checks.
// A run far below it means this checker is broken, not that the sector went
// offline, so we refuse to write and say so.
const baselineUpRate = 0.862
const minPlausibleUpRate = 0.35
const minSampleForSanity = 10

func loadConfig() (config, error) {
	ref := strings.TrimSpace(os.Getenv("SUPABASE_PROJECT_REF"))
	url := strings.TrimSpace(os.Getenv("SUPABASE_URL"))
	if url == "" && ref != "" {
		url = "https://" + ref + ".supabase.co"
	}
	if url == "" {
		return config{}, fmt.Errorf("SUPABASE_URL or SUPABASE_PROJECT_REF is required")
	}

	anon := strings.TrimSpace(os.Getenv("SUPABASE_ANON_KEY"))
	if anon == "" {
		return config{}, fmt.Errorf("SUPABASE_ANON_KEY is required (public key; PostgREST needs it)")
	}
	worker := strings.TrimSpace(os.Getenv("MONITOR_WORKER_KEY"))
	if worker == "" {
		return config{}, fmt.Errorf("MONITOR_WORKER_KEY is required — without it every call is refused")
	}

	return config{
		supabaseURL: strings.TrimRight(url, "/"),
		anonKey:     anon,
		workerKey:   worker,
		batchSize:   envInt("MONITOR_BATCH_SIZE", 50),
		concurrency: envInt("MONITOR_CONCURRENCY", 10),
		interval:    envDuration("MONITOR_INTERVAL", 2*time.Minute),
		timeout:     envDuration("MONITOR_TIMEOUT", 20*time.Second),
		runOnce:     os.Getenv("MONITOR_RUN_ONCE") == "true",
	}, nil
}

type monitor struct {
	OrganizationID      string `json:"organization_id"`
	URL                 string `json:"url"`
	Tier                string `json:"tier"`
	ConsecutiveFailures int    `json:"consecutive_failures"`
	LastStatus          string `json:"last_status"`
}

type outcome struct {
	mon        monitor
	up         bool
	statusCode *int
	latencyMs  int
	errMsg     string
}

type client struct {
	cfg  config
	http *http.Client
	log  *slog.Logger
}

func (c *client) rpc(ctx context.Context, fn string, payload map[string]any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.cfg.supabaseURL+"/rest/v1/rpc/"+fn, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.cfg.anonKey)
	req.Header.Set("Authorization", "Bearer "+c.cfg.anonKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s: %w", fn, err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Never log the key itself, only that it was rejected.
		return fmt.Errorf("%s: status %d: %s", fn, resp.StatusCode, truncate(string(raw), 200))
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(raw, out)
}

// check performs one HTTP request against a charity's website.
func (c *client) check(ctx context.Context, m monitor) outcome {
	reqCtx, cancel := context.WithTimeout(ctx, c.cfg.timeout)
	defer cancel()

	started := time.Now()
	// GET, not HEAD: plenty of charity sites answer HEAD with 405 while being
	// perfectly healthy, which would be recorded as an outage.
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, m.URL, nil)
	if err != nil {
		return outcome{mon: m, up: false, latencyMs: 0, errMsg: "invalid URL"}
	}
	req.Header.Set("User-Agent", "NGOreality-Monitor/1.0 (+https://www.ngoreality.com)")

	resp, err := c.http.Do(req)
	if err != nil {
		return outcome{
			mon: m, up: false,
			latencyMs: int(time.Since(started).Milliseconds()),
			errMsg:    truncate(err.Error(), 300),
		}
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))

	code := resp.StatusCode
	// 4xx means the server answered. Only 5xx is an outage a charity can act
	// on; a 403 from a firewall is not something they can fix.
	up := code < 500
	msg := ""
	if !up {
		msg = fmt.Sprintf("HTTP %d", code)
	}
	return outcome{
		mon: m, up: up, statusCode: &code,
		latencyMs: int(time.Since(started).Milliseconds()),
		errMsg:    msg,
	}
}

func (c *client) runCycle(ctx context.Context) {
	var due []monitor
	if err := c.rpc(ctx, "monitor_fetch_due", map[string]any{
		"p_key": c.cfg.workerKey, "p_limit": c.cfg.batchSize,
	}, &due); err != nil {
		c.log.Error("could not fetch due monitors", "err", err)
		return
	}
	if len(due) == 0 {
		c.log.Info("nothing due")
		return
	}

	outcomes := make([]outcome, len(due))
	sem := make(chan struct{}, c.cfg.concurrency)
	done := make(chan struct{})

	for i, m := range due {
		go func(i int, m monitor) {
			sem <- struct{}{}
			defer func() { <-sem; done <- struct{}{} }()
			outcomes[i] = c.check(ctx, m)
		}(i, m)
	}
	for range due {
		<-done
	}

	upCount := 0
	for _, o := range outcomes {
		if o.up {
			upCount++
		}
	}
	upRate := float64(upCount) / float64(len(outcomes))

	// A monitor that has never been checked has no baseline to be measured
	// against, and the ~120 never-checked URLs in this database are precisely
	// the malformed residue the previous worker could not handle — an email
	// address in a URL field, mixed-case hostnames that do not resolve. They
	// are genuinely down, and if the guard below applied to them it would
	// refuse every batch forever and monitoring would never start.
	firstEverCheck := true
	for _, o := range outcomes {
		if o.mon.LastStatus != "" && o.mon.LastStatus != "unknown" {
			firstEverCheck = false
			break
		}
	}

	// Refuse to write a batch that looks like our own failure rather than a
	// real outage. Poisoning 14,700 monitors with false downtime would corrupt
	// the registry statistics the whole outreach strategy rests on, and could
	// email members that their working site is down.
	//
	// Calibration note: measured against the 86.2% baseline, this checker
	// returns 90% up on the mainstream population. A run far below that means
	// the checker broke, not the sector.
	if !firstEverCheck && len(outcomes) >= minSampleForSanity && upRate < minPlausibleUpRate {
		c.log.Error("implausible up-rate, refusing to record",
			"up_rate", fmt.Sprintf("%.3f", upRate),
			"baseline", baselineUpRate, "checked", len(outcomes),
			"note", "suspect the checker, not the internet")
		return
	}

	recorded, opened, resolved := 0, 0, 0
	for _, o := range outcomes {
		failures := 0
		status := "up"
		if !o.up {
			failures = o.mon.ConsecutiveFailures + 1
			if failures >= failureThreshold {
				status = "down"
			} else {
				status = o.mon.LastStatus
			}
		}

		var applied string
		err := c.rpc(ctx, "monitor_record", map[string]any{
			"p_key":                  c.cfg.workerKey,
			"p_organization_id":      o.mon.OrganizationID,
			"p_status":               status,
			"p_status_code":          o.statusCode,
			"p_latency_ms":           o.latencyMs,
			"p_error":                o.errMsg,
			"p_consecutive_failures": failures,
		}, &applied)
		if err != nil {
			c.log.Error("could not record check", "org", o.mon.OrganizationID, "err", err)
			continue
		}
		recorded++
		switch applied {
		case "opened":
			opened++
		case "resolved":
			resolved++
		}
	}

	c.log.Info("cycle complete",
		"checked", len(outcomes), "recorded", recorded,
		"up", upCount, "down", len(outcomes)-upCount,
		"up_rate", fmt.Sprintf("%.3f", upRate),
		"incidents_opened", opened, "incidents_resolved", resolved)
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := loadConfig()
	if err != nil {
		fmt.Fprintln(os.Stderr, "FATAL: "+err.Error())
		log.Error("startup failed: " + err.Error())
		os.Exit(1)
	}

	c := &client{
		cfg: cfg,
		// One shared client so connections are reused across checks.
		http: &http.Client{
			Timeout: cfg.timeout + 5*time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return fmt.Errorf("too many redirects")
				}
				return nil
			},
		},
		log: log,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	log.Info("monitor starting",
		"batch", cfg.batchSize, "concurrency", cfg.concurrency,
		"interval", cfg.interval.String(), "timeout", cfg.timeout.String())

	c.runCycle(ctx)
	if cfg.runOnce {
		log.Info("MONITOR_RUN_ONCE=true, exiting")
		return
	}

	ticker := time.NewTicker(cfg.interval)
	defer ticker.Stop()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	for {
		select {
		case <-ticker.C:
			c.runCycle(ctx)
		case <-sigCh:
			log.Info("shutting down")
			cancel()
			return
		}
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func envInt(key string, fallback int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			return d
		}
	}
	return fallback
}
