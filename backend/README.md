# NGOreality backend (Go)

Background services for work that should **not** run in the browser: website uptime monitoring today; email queues and AI agents later.

The React app talks to **Supabase** directly (Auth + Postgres + RLS). This backend connects with a **Postgres URL** and writes system data (checks, incidents) using the same database.

---

## One backend, two processes

This is **not** two separate backends. It is **one Go module** (`backend/`) compiled into two small programs:

| Process | Command | What it does | Do you need it locally? |
|--------|---------|--------------|-------------------------|
| **Worker** | `make worker` | Runs on a timer: sync org websites → HTTP checks → incidents → activity log | **Yes**, if you want monitoring to run automatically |
| **API** | `make api` | HTTP server on `:8080`: health, stats, manual “run checks now” | **Optional** — useful for debugging and `curl` triggers |

```
┌──────────────────────────────────────────────────────────┐
│                    backend/ (Go module)                   │
│  ┌─────────────────────┐    ┌─────────────────────────┐  │
│  │  cmd/worker         │    │  cmd/api                │  │
│  │  loop every 15m     │    │  HTTP :8080             │  │
│  │  (production core)  │    │  (ops / manual trigger) │  │
│  └──────────┬──────────┘    └────────────┬────────────┘  │
│             └──────────────┬─────────────┘               │
│                            ▼                             │
│                   Supabase Postgres                      │
│                   (website_monitors, etc.)               │
└──────────────────────────────────────────────────────────┘

┌─────────────┐         ┌─────────────┐
│  React app  │ ──────► │  Supabase   │  (auth, CRM, NGO portal)
│  yarn dev   │         │  (browser)  │
└─────────────┘         └─────────────┘
```

**Production:** deploy the same Docker image twice (Railway/Fly/etc.) — one service runs `/worker`, one runs `/api`. Same env vars, different start command.

**Why split?** The worker must stay up and poll on an interval. The API is a thin HTTP layer for health checks and on-demand runs. Keeping them separate lets you scale or restart one without the other.

---

## Quick start (local)

### 1. Prerequisites

- Go 1.22+
- Supabase project with migration applied:

  `supabase/migrations/20260518140000_009_website_monitoring.sql`

### 2. Configure env

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set **`DATABASE_URL`**:

Supabase Dashboard → **Project Settings → Database → Connection string → URI**

- Prefer the **Transaction pooler** (port **6543**) for the worker.
- Paste the full URI including password (special characters are handled automatically).

### 3. Run the backend

From **`backend/`** (recommended):

```bash
cd backend
make dev
```

This starts **both** the API and the worker in one terminal. Stop with `Ctrl+C`.

| Goal | Command (from `backend/`) |
|------|---------------------------|
| **Full backend** (API + worker) | `make dev` |
| Worker only (monitoring loop) | `make worker` |
| API only (HTTP on :8080) | `make api` |
| One check cycle, then exit | `make run-once` |

From **repo root** (equivalent):

```bash
yarn api          # API only
yarn worker       # worker only
yarn dev:all      # frontend + API only (does not start worker)
```

> **`make dev` in the repo root runs the frontend (`yarn dev`), not the Go backend.**  
> For the Go backend use `cd backend && make dev`.

### 4. Verify

```bash
curl -s http://localhost:8080/health
# {"status":"ok"}

# Optional: trigger a check cycle via API (set API_KEY in backend/.env for production)
curl -s -H "X-API-Key: $API_KEY" -X POST http://localhost:8080/v1/monitor/run
curl -s -H "X-API-Key: $API_KEY" http://localhost:8080/v1/monitor/stats
```

If `API_KEY` is empty in `.env`, the API allows requests without a key (local dev only).

---

## Full stack local dev

Three terminals (clearest):

```bash
# Terminal 1 — frontend
yarn dev

# Terminal 2 — backend (API + worker)
cd backend && make dev
```

Or two terminals:

```bash
yarn dev:all          # frontend + API
cd backend && make worker   # monitoring loop
```

---

## How monitoring works

1. **Sync** — Orgs with `website_url` and `status` in `MONITOR_STATUSES` get a row in `website_monitors`.
2. **Check** — HTTP GET with timeout; results in `website_check_results`.
3. **State** — After `CHECK_FAILURE_THRESHOLD` consecutive failures → `down` + incident.
4. **Recovery** — Site responds again → incident closed + `activity_log` entries (`website_up` / `website_down`).

Disable a monitor: `UPDATE website_monitors SET enabled = false WHERE organization_id = '...';`

---

## Environment variables

See `backend/.env.example`. Required:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | Supabase Postgres URI |

Common optional:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_ADDR` | `:8080` | API listen address |
| `API_KEY` | (empty) | If set, require `X-API-Key` header |
| `WORKER_CHECK_INTERVAL` | `15m` | Time between check cycles |
| `WORKER_RUN_ONCE` | `false` | Exit after one cycle |
| `MONITOR_STATUSES` | `listed,...` | Which org statuses to monitor |

---

## Build & deploy

```bash
cd backend
make build    # → bin/api, bin/worker
```

Docker (one image, two commands):

```bash
docker build -t ngoreality-backend ./backend
# Run worker: docker run ... ngoreality-backend /worker
# Run API:    docker run -p 8080:8080 ... ngoreality-backend /api
```

On Railway: two services from the same image — start command `/worker` and `/api`. Set `DATABASE_URL` in each service.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `make: *** No rule to make target 'dev'` inside `backend/` | Pull latest; `make dev` is defined in `backend/Makefile`. Use `make help` to list targets. |
| `make dev` at repo root starts Vite only | Expected. Run `cd backend && make dev` for Go. |
| `DATABASE_URL is required` | Create `backend/.env` from `.env.example`. |
| API works, sites never checked | Start the **worker** (`make worker` or `make dev`). |
| Port 8080 in use | Change `API_ADDR=:8081` in `backend/.env`. |

Do **not** commit `backend/.env` or database passwords.

---

## Email notifications (Resend)

Set in `backend/.env`:

```env
RESEND_API_KEY=re_...
NOTIFY_FROM_EMAIL=NGOreality <notifications@onboarding.ngoreality.com>
NOTIFY_STAFF_EMAIL=ops@ngoreality.com   # optional BCC
```

The worker (and `POST /v1/notifications/process` on the API) sends rows from `notification_events`:

- **site_down** — when a paying member’s site fails checks (queued on new incident)
- **membership_welcome** / **badge_issued** — queued from CRM when membership is recorded

CRM: `/notifications` → **Send pending now** (needs `VITE_MONITOR_API_URL` + `VITE_MONITOR_API_KEY` in frontend `.env.local`).

## Roadmap (same repo)

- Outreach email campaigns (daily caps)
- AI draft endpoints (still writing to Supabase)
