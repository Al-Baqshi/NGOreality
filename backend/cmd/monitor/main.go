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
// Kept as documentation and logged for comparison, but deliberately NOT used as
// a gate: a batch can sit far below it for the honest reason that the queue has
// filled with charities whose domains have lapsed. Judging a batch by its
// up-rate alone once blocked six hours of perfectly accurate checks.
const baselineUpRate = 0.862
const minSampleForSanity = 10

// maxSelfInflictedRate is the share of a batch that may fail for reasons that
// implicate us — timeouts, unreachable connections — before the batch is
// discarded. Dead domains do not count towards it.
const maxSelfInflictedRate = 0.5

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
	// selfInflicted marks a failure that says more about US than about the
	// site: a timeout we imposed, or a connection we could not open. A DNS
	// NXDOMAIN is the opposite — a definitive answer that the domain is dead.
	selfInflicted bool
}

// looksSelfInflicted distinguishes "we could not complete the request" from
// "the domain does not exist".
//
// This distinction is the whole guard. An earlier version compared the batch
// up-rate to the population baseline and refused anything far below it. That
// correctly caught a broken checker once, then spent hours refusing a perfectly
// accurate batch — because the queue had filled with genuinely dead domains and
// a biased sample looks identical to a broken checker if you only count.
func looksSelfInflicted(msg string) bool {
	m := strings.ToLower(msg)
	switch {
	case strings.Contains(m, "no such host"),
		strings.Contains(m, "nxdomain"),
		strings.Contains(m, "server misbehaving"):
		// DNS answered: the domain is dead. That is real data about a real
		// charity, and refusing to record it is how monitoring stalls.
		return false
	case strings.Contains(m, "connection refused"),
		strings.Contains(m, "connection reset"),
		strings.Contains(m, "tls handshake"),
		strings.Contains(m, "certificate"):
		// The host ANSWERED and the answer was a failure: a RST, or a
		// handshake it could not complete. Our network reached it. That is a
		// finding about the charity's hosting, not about us.
		return false
	case strings.Contains(m, "timeout"),
		strings.Contains(m, "deadline exceeded"),
		strings.Contains(m, "context canceled"),
		strings.Contains(m, "no route to host"),
		strings.Contains(m, "network is unreachable"):
		// AMBIGUOUS, and this is the important case. A dead-but-registered
		// domain — DNS resolves, nothing listens — produces exactly the same
		// connect timeout as our own egress being broken. It is the single most
		// common state in a charity registry, and it cannot be told apart from
		// the error string alone. Corroborate at the batch level instead: see
		// the up-count condition where this rate is used.
		return true
	}
	return false
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
		msg := truncate(err.Error(), 300)
		return outcome{
			mon: m, up: false,
			latencyMs:     int(time.Since(started).Milliseconds()),
			errMsg:        msg,
			selfInflicted: looksSelfInflicted(msg),
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

	// Refuse only when the failures look like OUR failure.
	//
	// The Edge Function attempt reported 4.5% up because the runtime serialised
	// outbound connections and every request hit our own timeout. That is the
	// signature worth refusing: a batch dominated by timeouts and unreachable
	// connections. A batch full of "no such host" is not a malfunction — it is
	// an accurate finding about charities whose domains have lapsed, and it is
	// exactly what the registry statistics are meant to capture.
	selfInflicted := 0
	for _, o := range outcomes {
		if o.selfInflicted {
			selfInflicted++
		}
	}
	selfRate := float64(selfInflicted) / float64(len(outcomes))

	// Refusing needs BOTH signals, and the second one is what was missing.
	//
	// A high ambiguous-failure rate on its own is not evidence against us: a
	// batch of registry charities whose hosting has lapsed produces exactly
	// that, and it is accurate data. What distinguishes "our network is broken"
	// is that NOTHING works — a broken egress fails every request, not 87% of
	// them.
	//
	// Without this second condition the guard was permanently tripped by a
	// correct result: monitoring recorded nothing for thirteen days while
	// reporting self_inflicted_rate 0.54 with four sites in every batch
	// answering perfectly well. Retuning concurrency did not move it, because
	// contention was never the cause — the sites really are dead. Verified by
	// hand: nsmedicaltrust.nz, qes.org.nz and southlandbeesociety.co.nz all
	// resolve DNS in under 130ms and then never complete a TCP connection,
	// from this container and from a laptop on a different continent.
	//
	// So: if even one site in the batch responded, our egress works, and every
	// timeout in that batch is a finding about a charity rather than about us.
	if len(outcomes) >= minSampleForSanity && selfRate > maxSelfInflictedRate && upCount == 0 {
		samples := make([]string, 0, 3)
		for _, o := range outcomes {
			if o.selfInflicted && len(samples) < 3 {
				samples = append(samples, fmt.Sprintf("%s => %s", o.mon.URL, o.errMsg))
			}
		}
		c.log.Error("too many failures look self-inflicted, refusing to record",
			"self_inflicted_rate", fmt.Sprintf("%.3f", selfRate),
			"up_rate", fmt.Sprintf("%.3f", upRate),
			"checked", len(outcomes),
			"sample_errors", strings.Join(samples, " | "),
			"note", "timeouts and unreachable hosts mean the checker or its network, not the sites")
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

	// Self-test against sites known to answer 200 from an ordinary machine.
	//
	// Without this, "up_rate 0.04" is ambiguous forever: it could mean the
	// queue is full of dead charities, or it could mean this container cannot
	// reach the New Zealand internet. Those need opposite responses, and
	// guessing has already cost hours. Three requests at boot settles it.
	selfTest(context.Background(), c, log)

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

// selfTest checks a few known-good hosts so the logs distinguish "the sites are
// dead" from "this container cannot resolve or reach them".
func selfTest(ctx context.Context, c *client, log *slog.Logger) {
	known := []string{
		"https://cminz.org/",
		"https://www.rda.org.nz",
		"https://www.google.com",
	}
	ok := 0
	for _, u := range known {
		o := c.check(ctx, monitor{URL: u, LastStatus: "unknown"})
		if o.up {
			ok++
			log.Info("self-test reachable", "url", u, "latency_ms", o.latencyMs)
		} else {
			log.Error("self-test UNREACHABLE", "url", u, "err", o.errMsg)
		}
	}
	switch ok {
	case len(known):
		log.Info("self-test passed: outbound HTTP works from this container")
	case 0:
		log.Error("self-test FAILED for every host: this container cannot reach the " +
			"public internet. A low up-rate says nothing about the charities.")
	default:
		log.Warn("self-test partially failed", "reachable", ok, "of", len(known))
	}
}
