# NGOreality — Staff CRM implementation plan

_Operational roadmap: run verification as a business from the staff panel, list all NZ registry orgs without duplicates, automate website health, then add cybersecurity checks. Financial transparency stays behind `FINANCIAL_VERIFICATION_ENABLED`._

**Stack (unchanged):** Supabase Auth + Postgres + RLS · React staff CRM · Go workers/API for scale jobs.

---

## Your daily operating model (target)

| Step | You do | System supports |
|------|--------|-----------------|
| 1 | Open **Dashboard** — see real totals, outreach due, badges expiring, website % | Aggregate stats (no 1,000-row cap) |
| 2 | **Outreach board** — pick N orgs/day from `listed` + `not_contacted` | Kanban / queue with registry id visible |
| 3 | Call/email NGO — update **outreach status** | Already on org detail |
| 4 | They agree → **Begin verification** | Already on org detail; creates criteria |
| 5 | Walk criteria one-by-one (website, security, privacy…) | Checklist on org detail + notes |
| 6 | **Issue badge** when green | Already on org detail |
| 7 | Record **fee / stage** (manual first) | Phase 2: `service_engagements` |
| 8 | Platform keeps them **green** | Go monitor worker + incidents + renewals |

---

## When to use Supabase vs Go

| Work | Layer | Why |
|------|-------|-----|
| Login, one org edit, criteria, badge issue, outreach | **React → Supabase** (RLS) | Per-org, low volume, secure |
| Dashboard totals, filtered org list (29k+) | **React → Supabase** with **count + pagination** (Phase 1) | No Go required yet |
| NZ registry import (29k upsert) | **Go or `npm run import:nz-charities`** | Long-running; upsert by `(source_registry, external_id)` |
| Website uptime checks | **Go worker** (exists) | Thousands of HTTP checks, concurrency |
| Email when site down / outreach campaigns | **Go worker** (Phase 4) | Rate limits, retries, audit log |
| Cybersecurity scans (headers, TLS, etc.) | **Go worker** (Phase 5) | Scheduled, stores `security_findings` |
| AI drafts for NGOs | **Go API** (Phase 6) | Keys server-side; human approve before send |

**Rule:** If it touches **one org** → Supabase from CRM. If it touches **many orgs** or **runs on a timer** → Go.

---

## Phase 0 — Data truth (half day)

**Goal:** All registered NZ charities in DB; CRM numbers match reality.

| # | Task | How |
|---|------|-----|
| 0.1 | Confirm counts | SQL: `select status, count(*) from organizations group by 1;` |
| 0.2 | Full import | `npm run import:nz-charities` — **no** `IMPORT_LIMIT` |
| 0.3 | Apply migration `010_crm_dashboard_stats.sql` | `supabase db push` or dashboard |
| 0.4 | Start Go worker locally | `cd backend && make worker` (syncs monitors for orgs with URLs) |

**Dedup:** Never create registry rows manually without `source_registry` + `external_id`. Re-import only **updates**.

---

## Phase 1 — CRM works at 29k scale (this week)

**Goal:** Staff panel shows correct totals; browse/search all listed orgs.

| # | Task | Status |
|---|------|--------|
| 1.1 | `crm_dashboard_stats()` RPC | Migration 010 |
| 1.2 | `useCrmDashboardStats` + paginated `useOrganizationsPage` | Frontend hooks |
| 1.3 | Dashboard uses RPC counts | Includes website %, badge expiry |
| 1.4 | Organizations list: server filters + pages (50/page) | Not client filter on 1k rows |
| 1.5 | Show **registry id** on list + detail | `charity_registration_number` / `external_id` |
| 1.6 | Block duplicate manual create if registry id exists | Org new form validation (Phase 1b) |

**You can operate:** accurate pipeline metrics, find any listed NGO, no false “1,000 total”.

---

## Phase 2 — Outreach & verification queue (week 2)

**Goal:** Daily call list; kanban; accept “jobs” (engagements).

### DB (migration 011)

```text
service_engagements
  id, organization_id, type (verification|renewal|consulting),
  status (lead|active|completed|cancelled),
  fee_cents, currency, notes, assigned_staff_id,
  started_at, completed_at, created_at

staff_tasks (optional)
  id, organization_id, engagement_id, due_date, title, status, created_at
```

### CRM UI

| Route | Purpose |
|-------|---------|
| `/outreach` | Kanban: outreach_status × listed |
| `/work-queue` | Today: outreach due + badge_requests pending + incidents open |
| Org detail | Tab: **Engagement** (fee, stage, next call date) |

### Metrics on dashboard

- **Calls today target** (config: e.g. 10/day) vs completed outreach updates
- **In verification** = `onboarding` + `under_review`
- **Badge renewals due** (from `verification_badges.expires_at`)

**Still Supabase** for CRUD; no Go required.

---

## Phase 3 — Verification ops you already half-have (week 2–3)

| # | Task |
|---|------|
| 3.1 | **Verification** page: load only `onboarding` / `under_review` (paginated), not all orgs |
| 3.2 | **Badges** page: active / expiring in 30d / expired lists |
| 3.3 | Criteria templates: digital trust checklist (website, HTTPS, privacy page, accessibility…) |
| 3.4 | “Publish finding to NGO” toggle on criterion notes → later `security_findings` |
| 3.5 | `badge_requests` queue on staff **Work queue** (accept/reject) |

**Issue badge / criteria** — keep current org detail flows.

---

## Phase 4 — Website intelligence (week 3–4)

**Goal:** % with website; notify when down; staff + NGO see status.

| # | Task | Layer |
|---|------|-------|
| 4.1 | Dashboard: `listed_with_website`, `monitors_up`, `monitors_down`, `open_incidents` | RPC + Go stats |
| 4.2 | CRM **Monitoring** page: open incidents, filter no-website | Supabase read |
| 4.3 | Go worker: tiered intervals (listed=weekly, verified=hourly) | Go config |
| 4.4 | Notify staff on new incident (email/Slack later) | Go notify |
| 4.5 | Notify NGO when `org_notified_at` null | Go + template |
| 4.6 | Retention job: prune `website_check_results` > 30 days | Go scheduled |

**Import script** already sets `website_url` from registry where available.

---

## Phase 5 — Cybersecurity checks (week 5+)

**Goal:** Cord-wise-style checks stored per org; staff reviews before NGO sees.

### DB (migration 012)

```text
security_findings
  id, organization_id, check_key, severity, title, description,
  status (open|acknowledged|fixed|false_positive),
  visible_to_org boolean, detected_at, resolved_at,
  metadata jsonb
```

### Go worker `cmd/scanner` or extend worker

- TLS cert expiry, HTTPS redirect, security headers, mixed content (lightweight)
- Write findings; append `activity_log`
- Staff CRM: **Security** tab on org + global “open critical” count

**Not** full pentest — automated baseline aligned with verification criteria keys.

---

## Phase 6 — Automation “stay green” (ongoing)

| Automation | Trigger |
|------------|---------|
| Badge expiry reminder | 30/7 days before `expires_at` |
| Re-check verification criteria | Quarterly for verified |
| Site down | Incident → email NGO + staff task |
| Outreach segment | “No website” → manual approve → email queue (Go) |

---

## Phase 7 — Financial transparency (later)

- Flip `FINANCIAL_VERIFICATION_ENABLED` in `src/config/features.ts`
- Extra criteria + badge level already scaffolded
- No schema fork — same org/criteria pattern

---

## Phase 8 — NGO portal mirror (parallel after Phase 2)

NGOs see: application status, criteria progress, monitoring summary, findings (when `visible_to_org`), badge requests.

Staff CRM remains source of truth; NGO portal read-only via RLS.

---

## Go deployment map

| Process | Command | When |
|---------|---------|------|
| Monitor worker | `/worker` | Always in prod |
| API | `/api` | Health, manual run, later BFF |
| Import job | one-shot or cron | After registry updates |
| Scanner | `/scanner` (future) | Nightly security pass |

Same Docker image, different entrypoints (Railway/Fly).

---

## Success criteria (MVP operations)

- [ ] Dashboard **Listed** ≈ 29,000 (not 1,000)
- [ ] Search any NZ charity by name in CRM (< 1s with pagination)
- [ ] Zero duplicate registry rows on re-import
- [ ] Daily outreach list from `listed` + `not_contacted`
- [ ] Issue badge + see expiring badges list
- [ ] Website % on dashboard; open incidents visible
- [ ] Go worker running in prod for monitors

---

## Suggested order to build (for you / dev)

1. **Phase 0 + 1** — data + CRM scale (start here)
2. **Phase 2** — outreach kanban + engagements (your daily workflow)
3. **Phase 3** — verification + badges pages
4. **Phase 4** — monitoring UI + notifications
5. **Phase 5** — security findings
6. **Phase 8** — NGO portal visibility

---

## Files touched in Phase 1

| File | Change |
|------|--------|
| `supabase/migrations/20260520100000_010_crm_dashboard_stats.sql` | Stats RPC |
| `src/hooks/useCrm.ts` | Dashboard stats + paginated orgs |
| `src/pages/crm/Dashboard.tsx` | Use RPC |
| `src/pages/crm/OrganizationsList.tsx` | Pagination + registry column |

See `docs/ARCHITECTURE.md` for platform-wide split (Supabase vs Go).
