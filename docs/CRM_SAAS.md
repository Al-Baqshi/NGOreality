# NGO Workspace CRM — multi-tenant Go service

Beneficiary and case management sold to NGOs as "Organisation Workspace SaaS".
Runs as its own Railway service against its own Postgres. Separate from the
Supabase database that powers the public site, directory and monitoring.

---

## Why two databases

Beneficiary case records are the most sensitive data on the platform. Keeping
them out of the Supabase cluster means:

- A compromise of the public site cannot reach client records.
- The 29k-charity registry can stay broadly readable without touching CRM data.
- The CRM can be moved to an NZ region later without migrating the marketing site.

The only thing shared between the two systems is the **Supabase JWT secret**,
used to verify tokens. An NGO signs in once on ngoreality.com and the same
token works against the CRM API.

---

## Tenancy model: schema-per-tenant

One Postgres cluster. Each NGO gets its own schema, `tenant_<slug>`.

```
platform.tenants          ← control plane: identity, seats, billing, versions
platform.tenant_users
platform.provisioning_log

tenant_redcross.clients   ← one NGO's data
tenant_redcross.cases
tenant_foodbank.clients   ← another NGO's data, different namespace
tenant_foodbank.cases
```

**Why not database-per-tenant:** on Railway one Postgres is one container.
Thousands of NGOs would be thousands of containers — beyond platform limits,
with minutes-long provisioning and a fan-out of backup configs. Schema-per-tenant
provisions in ~200ms, keeps per-tenant backup/export/delete, and lets a large
tenant be promoted onto a dedicated database later via `tenants.dedicated_dsn`
without a rewrite.

**Why not shared-schema + RLS:** every NGO's rows would sit in the same tables.
Schemas give a real namespace boundary.

### The isolation boundary

There is exactly one way to reach tenant data:

```go
conn, err := registry.Acquire(ctx, principal.Tenant)
```

`Acquire` opens a transaction and pins `search_path` to that tenant's schema —
`public` is deliberately excluded, so an unqualified query cannot fall through
to a shared table. Store functions take the resulting `pgx.Tx` and use
unqualified table names with no tenant filter.

Three defences on the schema name:

1. `ValidSchemaName` — regexp `^tenant_[a-z0-9_]{1,50}$`, checked before every use.
2. `set_config('search_path', quote_ident($1), true)` — the name is a bind
   parameter, never concatenated into SQL.
3. `Slugify` strips anything non-alphanumeric at provisioning time.

Covered by `internal/crm/tenant/tenant_test.go`, including injection attempts.

---

## Roles

Seats live in `platform.tenant_users`. The API enforces them; there is no
database-level role separation inside a tenant schema.

| Role | Clients & cases | Sensitive data & restricted notes | Settings, seats, delete |
|---|---|---|---|
| `owner` | read/write | yes | yes |
| `admin` | read/write | yes | yes |
| `caseworker` | read/write | yes | no |
| `volunteer` | read/write | **no** | no |
| `viewer` | read only | **no** | no |

Sensitive attributes live in a separate table (`client_sensitive`). For a role
without access the columns are **never selected** — not fetched and filtered.

---

## API

Base: `https://crm-api-production-1b72.up.railway.app`

Auth: `Authorization: Bearer <supabase access token>`.
With several workspaces, add `X-Tenant-ID: <tenant uuid>`.

| Method | Path | Role |
|---|---|---|
| GET | `/health` | public |
| GET | `/v1/me` | any seat |
| GET | `/v1/workspaces` | any seat |
| GET | `/v1/clients?search=&status=&limit=&offset=` | any seat |
| POST | `/v1/clients` | write |
| GET | `/v1/clients/{id}` | any seat (sensitive included only if permitted) |
| PATCH | `/v1/clients/{id}` | write |
| DELETE | `/v1/clients/{id}` | admin |
| PUT | `/v1/clients/{id}/sensitive` | sensitive |
| GET/POST | `/v1/clients/{id}/consents` | any seat / write |
| POST | `/v1/consents/{id}/withdraw` | sensitive |
| GET | `/v1/cases?client_id=&status=&assigned_to=` | any seat |
| POST | `/v1/cases` | write |
| GET/PATCH | `/v1/cases/{id}` | any seat / write |
| DELETE | `/v1/cases/{id}` | admin |
| GET/POST | `/v1/cases/{id}/notes` | any seat / write |
| GET | `/v1/sessions?client_id=&case_id=&from=&to=` | any seat |
| POST/PATCH | `/v1/sessions`, `/v1/sessions/{id}` | write |
| DELETE | `/v1/sessions/{id}` | admin |
| GET | `/v1/stats?from=&to=` | any seat |
| GET | `/v1/field-defs?entity=` | any seat (sensitive definitions hidden) |
| POST/PATCH/DELETE | `/v1/field-defs`, `/v1/field-defs/{id}` | admin (DELETE archives) |
| GET | `/v1/service-types` | any seat |
| PUT | `/v1/service-types` | admin |
| GET/PATCH | `/v1/settings` | any seat / admin |
| GET | `/v1/documents?client_id=&case_id=` | any seat |
| POST | `/v1/documents` | write (restricted needs sensitive) |
| DELETE | `/v1/documents/{id}` | admin |
| GET | `/v1/export/clients.csv` | admin |
| GET | `/v1/export/sessions.csv?from=&to=` | admin |
| POST | `/v1/import/clients` (raw CSV body) | admin |

Control plane — `X-Admin-Key`, not a user token:

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/admin/tenants` | Provision a workspace (idempotent per organization_id) |
| POST | `/v1/admin/tenants/migrate` | Fan migrations across all tenant schemas |
| POST | `/v1/admin/tenants/{id}/users` | Grant or change a seat |

---

## Data model notes

- **Case notes are append-only**, enforced by a `BEFORE UPDATE OR DELETE`
  trigger that raises. Corrections append a new note.
- **The audit log records reads and exports**, not just writes — opening a
  client record writes an `action='read'` row. It is append-only too.
- **`custom jsonb` + `field_defs`** is the customisation escape hatch. Each NGO
  adds fields without DDL. This is deliberately *not* a table builder.
- **`service_types`** lets each NGO name its own programmes.
- **Closure integrity**: `UpdateCase` maintains `closed_at` in the same
  statement as `status`, so they cannot drift and corrupt closure counts in
  funder reports.

---

## Deploying

Railway project **NGOreality** (`e37078e2-c94b-45a5-b8c7-d63ba80aee5f`):

| Service | Purpose |
|---|---|
| `Postgres` | CRM database |
| `crm-api` | This service — root `backend/`, Dockerfile, start `/crm` |
| `NGOreality` | Pre-existing, unconfigured |

Build config: root directory `backend`, `Dockerfile`, start command `/crm`,
health check `/health`, watch pattern `backend/**`.

### Environment variables

| Variable | Set? | Notes |
|---|---|---|
| `CRM_DATABASE_URL` | ✅ | Reference to `${{ Postgres.DATABASE_URL }}` |
| `CRM_ADMIN_API_KEY` | ✅ | Generated; guards the control plane |
| `SUPABASE_PROJECT_REF` | ✅ | `cpbilbskfbzqlynjhdvm` — pins the issuer claim |
| `CRM_ALLOWED_ORIGINS` | ✅ | CORS allowlist |
| `SUPABASE_JWT_SECRET` | ❌ **required** | Supabase → Project Settings → API → JWT Settings |
| `PORT` | auto | Railway injects it; the service binds it |

**The service will refuse to start without `SUPABASE_JWT_SECRET`** — failing
closed is intentional, since starting without token verification would expose
every workspace.

### Migrations

Both run automatically on boot and are idempotent:

1. `migrate.Platform` — control-plane schema.
2. `registry.MigrateAll` — every tenant schema up to the version compiled into
   the binary. A tenant that fails is logged and skipped so one broken schema
   cannot block a deploy; the failure count is logged at error level.

Set `CRM_SKIP_TENANT_MIGRATIONS=true` to skip the fan-out on boot and run it
later via the admin endpoint.

To add a tenant migration: drop `0002_*.sql` into
`internal/crm/migrate/sql/tenant/`. Versions must be consecutive from 1 —
the loader rejects gaps rather than silently skipping.

---

## Local development

```bash
cd backend
export CRM_DATABASE_URL='postgres://localhost:5432/ngoreality_crm'
export SUPABASE_JWT_SECRET='<from supabase dashboard>'
export CRM_ADMIN_API_KEY='local-dev-key'
go run ./cmd/crm
```

Provision a test tenant:

```bash
curl -X POST localhost:8081/v1/admin/tenants \
  -H 'X-Admin-Key: local-dev-key' \
  -H 'Content-Type: application/json' \
  -d '{"organization_id":"<uuid from supabase organizations>",
       "name":"Test Charity",
       "owner_user_id":"<uuid from supabase auth.users>",
       "owner_email":"you@example.com"}'
```

Then call the API with a real Supabase access token from the browser
(`supabase.auth.getSession()`).

---

## Import and export

`POST /v1/import/clients` takes a raw CSV body (max 16 MB, 10,000 rows).

- **Header matching is forgiving** — "First name", "firstname", "Given name"
  all map to `given_name`; "Surname", "Last name" to `family_name`, and so on.
- **Unrecognised columns are preserved** into the row's `custom` jsonb rather
  than dropped, so a spreadsheet migration loses nothing.
- **Dates are day-first** (`28/07/2026` → 28 July). This is a New Zealand
  product; `TestParseFlexibleDatePrefersDayFirst` pins the behaviour.
- **A bad row does not sink the import.** Each row runs inside a savepoint, so
  a duplicate reference code skips that row and keeps the rest. The response
  lists every skipped row with a reason.
- **The whole import is one transaction** — it commits or rolls back together,
  so there is never a half-imported caseload.
- Excel's UTF-8 BOM is stripped, which would otherwise corrupt the first
  column name and silently lose that column.

Exports are admin-only and always write an `action='export'` audit row
recording the row count and whether sensitive columns were included.

---

## Not yet built

- PDF funder reports (CSV export exists)
- Retention enforcement (`settings.client_retention_months` is recorded, not applied)
- Seat-count enforcement against `tenants.seats_purchased`
- Frontend workspace UI (the API client `src/lib/crmApi.ts` is complete)
- Supabase Storage upload flow behind `/v1/documents` (the table records paths;
  it does not yet issue signed upload URLs)

See `docs/PRIVACY_AND_RESIDENCY.md` for the Privacy Act obligations that still
gate onboarding a real tenant.
