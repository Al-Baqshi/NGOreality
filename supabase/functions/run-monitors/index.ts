// Website monitoring.
//
// Members pay $70/year for "~daily website checks and an email if your site
// looks down". The Go worker that performed them was never deployed — checks
// last ran on 2 June 2026. Selling a check that does not happen is the worst
// kind of defect in a product whose entire subject is trust.
//
// Runs as an Edge Function on pg_cron, like email delivery: no database
// password, nothing kept running.
//
// CALIBRATION — read before changing CONCURRENCY or the timeout.
// The Go worker measured 86.2% of these sites up across 39,728 checks. That is
// the reference. A first version of this function used 12 concurrent fetches
// and a 12s timeout and reported 4.5% up, with "The signal has been aborted"
// as the dominant error: the runtime serialises outbound connections, so
// queued requests spent their whole timeout waiting for a socket rather than
// waiting for the site. It was measuring its own concurrency limit and calling
// it an outage — and writing false "down" rows against real charities.
//
// So: modest concurrency, generous timeout, and the run is compared against the
// 86% baseline before trusting it. If the up-rate collapses again, suspect this
// function before suspecting the internet.
//
// If backend/cmd/worker is ever deployed, unschedule this or sites get checked
// twice and members get duplicate alerts.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BATCH_SIZE = 25;
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 25_000;

// Consecutive failures before a site is called down. One timeout is usually the
// network, not an outage; alerting on it trains members to ignore us.
const FAILURE_THRESHOLD = 2;

// Below this up-rate the run is treated as suspect and NOT written, because the
// likeliest explanation is that this function is failing, not that most of New
// Zealand's charities went offline in the last two minutes. Poisoning 14,700
// monitors with false outages is far worse than skipping a cycle.
const MIN_PLAUSIBLE_UP_RATE = 0.35;
const MIN_SAMPLE_FOR_SANITY = 10;

interface Monitor {
  organization_id: string;
  url: string;
  tier: string;
  check_interval_minutes: number;
  consecutive_failures: number;
  last_status: string;
}

interface CheckOutcome {
  monitor: Monitor;
  up: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string;
  abortedByUs: boolean;
}

async function checkOne(m: Monitor): Promise<CheckOutcome> {
  const started = Date.now();
  const controller = new AbortController();
  let aborted = false;
  const timer = setTimeout(() => {
    aborted = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    // GET, not HEAD: many charity sites answer HEAD with 405 while being
    // perfectly healthy, which would report a false outage.
    const res = await fetch(m.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "NGOreality-Monitor/1.0 (+https://www.ngoreality.com)" },
    });
    await res.arrayBuffer().catch(() => undefined);

    // 4xx still means the server answered. Only 5xx is an outage the charity
    // can act on; a 403 from a firewall is not.
    const up = res.status < 500;
    return {
      monitor: m,
      up,
      statusCode: res.status,
      latencyMs: Date.now() - started,
      error: up ? "" : `HTTP ${res.status}`,
      abortedByUs: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      monitor: m,
      up: false,
      statusCode: null,
      latencyMs: Date.now() - started,
      error: aborted ? `timeout after ${REQUEST_TIMEOUT_MS}ms` : msg.slice(0, 300),
      abortedByUs: aborted,
    };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || BATCH_SIZE, 100);
  // ?dry_run=true measures without writing — use it to re-calibrate safely.
  const dryRun = url.searchParams.get("dry_run") === "true";
  const force = url.searchParams.get("force") === "true";

  const { data: due, error: readErr } = await supabase.rpc("monitors_due_for_check", {
    p_limit: limit,
  });
  if (readErr) {
    return json({ error: "could not read due monitors", detail: readErr.message }, 500);
  }

  const monitors = (due ?? []) as Monitor[];
  if (monitors.length === 0) {
    return json({ checked: 0, recorded: 0, message: "nothing due" });
  }

  const outcomes: CheckOutcome[] = [];
  for (let i = 0; i < monitors.length; i += CONCURRENCY) {
    outcomes.push(...(await Promise.all(monitors.slice(i, i + CONCURRENCY).map(checkOne))));
  }

  const upCount = outcomes.filter((o) => o.up).length;
  const timeouts = outcomes.filter((o) => o.abortedByUs).length;
  const upRate = upCount / outcomes.length;

  const stats = {
    checked: outcomes.length,
    up: upCount,
    down: outcomes.length - upCount,
    timeouts,
    up_rate: Number(upRate.toFixed(3)),
    baseline_up_rate: 0.862,
  };

  if (dryRun) return json({ dry_run: true, ...stats });

  // Refuse to write a result set that looks like our own failure.
  if (!force && outcomes.length >= MIN_SAMPLE_FOR_SANITY && upRate < MIN_PLAUSIBLE_UP_RATE) {
    console.error("implausible up-rate, refusing to write", stats);
    return json(
      {
        ...stats,
        recorded: 0,
        error:
          "up-rate far below the 86% baseline; refusing to record. This almost always means " +
          "the checker is failing (usually connection queueing seen as timeouts), not that the " +
          "sites are down. Investigate before overriding with ?force=true.",
      },
      503,
    );
  }

  let opened = 0;
  let resolved = 0;
  let recorded = 0;
  const writeErrors: string[] = [];

  for (const o of outcomes) {
    const failures = o.up ? 0 : o.monitor.consecutive_failures + 1;
    const status = o.up ? "up" : failures >= FAILURE_THRESHOLD ? "down" : o.monitor.last_status;

    const { data: applied, error: applyErr } = await supabase.rpc("record_monitor_check", {
      p_organization_id: o.monitor.organization_id,
      p_status: status,
      p_status_code: o.statusCode,
      p_latency_ms: o.latencyMs,
      p_error: o.error,
      p_consecutive_failures: failures,
      p_failure_threshold: FAILURE_THRESHOLD,
    });

    if (applyErr) {
      // An earlier version logged this and moved on, so a run in which EVERY
      // write failed still answered 200 with "checked: 12". Reporting work that
      // did not happen hides a dead feature behind a healthy number.
      if (writeErrors.length < 5) writeErrors.push(applyErr.message);
      continue;
    }
    recorded++;
    if (applied === "opened") opened++;
    if (applied === "resolved") resolved++;
  }

  const body = { ...stats, recorded, incidents_opened: opened, incidents_resolved: resolved, write_errors: writeErrors };

  if (recorded === 0) return json({ ...body, error: "no check results could be recorded" }, 500);
  if (writeErrors.length > 0) return json({ ...body, error: "some results could not be recorded" }, 207);
  return json(body);
});
