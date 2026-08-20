# NGOreality

Platform for NGO verification, directory, staff CRM, business planning, and website monitoring — built for the New Zealand charity sector with export to other registries in mind.

**Stack:** React (Vite) + Supabase (Postgres, Auth, RLS) + Go backend (monitoring, notifications).

---

## Quick start

### Prerequisites

| Tool | Version | Used for |
|------|---------|----------|
| Node.js | 20+ | Frontend dev server and scripts |
| Yarn | 1.x or 3.x | Package manager (`package.json` scripts) |
| Go | 1.22+ | Background worker and monitor API (optional locally) |
| Supabase project | — | Database, auth, storage |

### 1. Clone and install

```bash
git clone <repo-url>
cd ngoreality
yarn install
```

### 2. Configure the frontend

```bash
cp .env.example .env.local
```

Edit `.env.local` and set at minimum:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Get both from **Supabase Dashboard → Project Settings → API**.

### 3. Apply database migrations

Schema lives in `supabase/migrations/`. Apply to your Supabase project before using CRM or cash-flow features:

```bash
# Option A — Supabase CLI (if project is linked)
npx supabase db push

# Option B — Dashboard SQL editor: paste each migration file in order

# Verify tables exist
yarn db:verify
```

See [docs/DATABASE.md](docs/DATABASE.md) for troubleshooting schema-cache errors.

Before bulk registry outreach, follow [docs/OUTREACH_PILOT.md](docs/OUTREACH_PILOT.md).
See [docs/OUTREACH_PILOT.md](docs/OUTREACH_PILOT.md) before bulk outreach to the registry.

### 4. Run the app

```bash
yarn dev
```

Open **http://localhost:5173**

| URL | Purpose |
|-----|---------|
| `/public` | Marketing site and directory |
| `/staff/login` | Staff CRM (requires `is_staff` on profile) |
| `/ngo/login` | NGO portal |

**Staff access:** create a user in Supabase Auth, then run:

```sql
UPDATE public.profiles SET is_staff = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'you@ngoreality.com');
```

### 5. (Optional) Run the Go backend

Monitoring and email delivery use a separate Go service. See [backend/README.md](backend/README.md).

```bash
cp backend/.env.example backend/.env
# Set DATABASE_URL (Supabase → Database → Connection string → URI, pooler port 6543)

cd backend && make dev    # API :8080 + worker
```

Or from repo root:

```bash
yarn dev:all    # frontend + API (no worker)
yarn worker     # monitoring loop only
```

For full stack with Docker: `docker compose up` (see [docker-compose.yml](docker-compose.yml)).

---

## Repository structure

```
ngoreality/
├── src/                    # React SPA (Vite + TypeScript)
│   ├── pages/
│   │   ├── public/         # Marketing, directory, blog
│   │   ├── crm/            # Staff CRM (outreach, cash flow, monitoring, …)
│   │   ├── ngo/            # NGO portal (profile, badge, membership)
│   │   └── staff/          # Staff login
│   ├── components/         # UI (shadcn-style) + domain components
│   ├── config/             # Business rules, pricing, funnel assumptions
│   ├── lib/                # Supabase clients, cashflow engine, monitor API
│   └── hooks/              # Data hooks
├── backend/                # Go module — worker + HTTP API
│   ├── cmd/api/            # HTTP server (:8080)
│   ├── cmd/worker/         # Scheduled monitoring + notifications
│   └── internal/           # Store, config, monitor logic
├── supabase/migrations/    # Postgres schema (apply to remote Supabase)
├── scripts/                # Registry import, schema verify, dev helpers
├── docs/                   # Architecture, database, business plan notes
└── ref/                    # Reference spreadsheets/docs (not runtime)
```

---

## Architecture (short)

```
┌─────────────────┐     ┌──────────────────────────────┐
│  React (Vite)   │────►│  Supabase (Auth + Postgres)  │
│  Browser SPA    │     │  RLS per staff / NGO         │
└────────┬────────┘     └──────────────▲───────────────┘
         │                             │
         │  VITE_MONITOR_API_*         │  DATABASE_URL
         ▼                             │
┌─────────────────┐                    │
│  Go API :8080   │────────────────────┘
│  Go worker      │  monitoring, incidents, Resend email
└─────────────────┘
```

- **Browser → Supabase:** CRUD for orgs, outreach, cash flow, NGO portal (one row at a time).
- **Go backend:** Background jobs — HTTP uptime checks, incident state, notification queue flush.
- **Single database:** All layers write to the same Supabase Postgres.

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Main features

| Area | Routes / location | Notes |
|------|-------------------|-------|
| Public directory | `/public/directory` | Listed NGOs, search, profiles |
| Staff CRM | `/dashboard`, `/organizations`, `/outreach` | Pipeline, verification, customers |
| Business plan | `/plan`, `/cash-flow` | MSD-style plan + unit-driven cashflow forecast |
| Monitoring | `/monitoring`, NGO `/ngo/monitoring` | Requires Go worker |
| Notifications | `/email-notifications` | Resend; optional `VITE_MONITOR_API_*` |
| Registry import | `yarn import:nz-charities` | Needs `SUPABASE_SERVICE_ROLE_KEY` |

---

## Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Frontend dev server (:5173) |
| `yarn dev:all` | Frontend + Go API |
| `yarn build` | Production build → `dist/` |
| `yarn typecheck` | TypeScript check |
| `yarn lint` | ESLint |
| `yarn db:verify` | Check Supabase schema vs migrations |
| `yarn import:nz-charities` | Import NZ charity registry (service role) |
| `yarn api` / `yarn worker` | Go processes from repo root |

Makefile shortcuts: `make dev`, `make dev-backend` — see [Makefile](Makefile).

---

## Environment variables

**Frontend** (`.env.local` — see [.env.example](.env.example)):

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Anon/public key |
| `VITE_SITE_URL` | Prod | Canonical URL for SEO and email links |
| `VITE_MONITOR_API_URL` | Optional | Go API base (e.g. `http://localhost:8080`) |
| `VITE_MONITOR_API_KEY` | Optional | Matches backend `API_KEY` |

**Backend** (`backend/.env` — see [backend/.env.example](backend/.env.example)):

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Supabase Postgres URI |
| `API_KEY` | Recommended | Protects monitor/notification endpoints |
| `RESEND_API_KEY` | For email | Transactional email via Resend |

Never commit `.env`, `.env.local`, or `backend/.env`.

---

## Deployment

- **Frontend:** static build (`yarn build`) — typically Vercel or similar. Set all `VITE_*` vars at build time.
- **Backend:** same Docker image, two services — `/worker` (always on) and `/api` (HTTP). See [backend/README.md](backend/README.md).
- **Database:** apply migrations to production Supabase before deploying UI that depends on new tables.

After deploy, add your production URL(s) in **Supabase → Authentication → URL Configuration**.

---

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layer split, scaling rules |
| [docs/DATABASE.md](docs/DATABASE.md) | Migrations, schema verify |
| [docs/OUTREACH_PILOT.md](docs/OUTREACH_PILOT.md) | Pilot checklist before 29k outreach |
| [docs/BUSINESS_PLAN.md](docs/BUSINESS_PLAN.md) | Business plan feature notes |
| [backend/README.md](backend/README.md) | Go worker/API setup |
| [SHORTEXET.md](SHORTEXET.md) | Session handoff / current work status |

---

## Quality checks before shipping

```bash
yarn typecheck
yarn lint
yarn build
yarn db:verify          # against linked Supabase
```

---

## License

Private — NGOreality. All rights reserved unless otherwise noted in the repository.
