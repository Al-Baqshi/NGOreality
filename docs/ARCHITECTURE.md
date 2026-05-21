# NGOreality architecture

**Source of truth:** Supabase Postgres (one database).

| Layer | Role |
|-------|------|
| **Supabase Auth + RLS** | Staff and NGO login; each user sees only allowed rows |
| **React (Vite)** | Public site, staff CRM, NGO portal |
| **Go (`backend/`)** | Scheduled/heavy work: monitoring, imports, email queues, security scans, AI orchestration |

**Split rule**

- **One organization** (edit, criteria, badge, notes) → React calls Supabase.
- **Many organizations** or **background jobs** → Go (or Supabase RPC for aggregates only).

**Processes**

- `cmd/worker` — uptime monitoring (production)
- `cmd/api` — health, manual monitor run, future BFF
- Import — `scripts/import-nz-charities.mjs` or Go job; upsert `(source_registry, external_id)`

**Dedup:** Unique index on registry keys; never duplicate NZ rows on re-import.

**Scale:** Staff lists use pagination + `crm_dashboard_stats()` RPC, not `select *` in the browser.

Operational build order: `docs/IMPLEMENTATION_PLAN.md`.
