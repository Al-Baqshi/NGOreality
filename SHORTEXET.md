# SHORTEXET — NGOreality session status

_Last updated: 2026-05-21_

## Where we are

**NZ launch product** is aligned in code + remote DB: **$100/year membership** (badge + monitoring + alert emails), **public trust standards before badge**, **passive monitoring for listed charities** (outreach data), **member-only security checklist** after login.

Supabase: `cpbilbskfbzqlynjhdvm` — migrations **`021`–`024`** applied via Supabase MCP: claim search RLS, `ngo_setup_requests`, `portal_notifications`, **outreach columns + outreach email templates** (`024_outreach_email_pipeline`).

**If CRM shows “schema cache” / missing table:** run `npm run db:verify` after `npx supabase db push` or MCP `apply_migration`. See `docs/DATABASE.md`.

**If browser shows `ERR_CONNECTION_REFUSED` on :5173:** run `npm run dev` (Vite was stopped).

### CRM plan split (sidebar)
- **Business plan** (`/plan`) — narrative, MSD checklist **with full answers**, infographics, services (CRM, landing pages, membership). **Download PDF** = full plan only (no CRM sidebar/header, no back/theme/download chrome; multi-page A4; darker contrast).
- **Cash flow** (`/cash-flow`) — **Volume units drive expected $**: badges→membership, packages→$650, workspace_active→MRR; (A) total receipts and profit/loss roll up; **Overheads** has office rent placeholder from month 10; linked to **Business plan** financial snapshot card.

---

## What was implemented (latest — Outreach v2)

- **Kanban:** 7 lead columns — Not contacted, **Cold email**, **No website**, **Website issues**, Contacted, Follow-up, Declined (20 cards/column, tall scroll).
- **Multi-select:** per-column All visible / First 50; global “first 50 per column”; checkboxes; **drag moves whole selection**; **named batches** (localStorage) + bulk move toolbar.
- **Collapsible** top sections: Inbound/customers shortcuts + Registry insights (more board space when collapsed).
- **Bulk email** (Cold / No website / Website issues): templates → `notification_events`; badges on cards (Queued/Sent/Failed); preview in column header.
- **Auto-fill:** No website / Website issues columns pull up to 100 matching leads.
- **Pipeline copy:** Leads until inbound (registered) → customer when verified/services; track sends in **Email notifications** (`/email-notifications`).

Key files: `src/pages/crm/OutreachBoard.tsx`, `src/lib/crmOutreach.ts`, `src/lib/notifications.ts`, `supabase/migrations/20260522150000_024_outreach_email_pipeline.sql`.

**Email sending:** set `VITE_MONITOR_API_URL` + `VITE_MONITOR_API_KEY` (Go API + Resend) and `VITE_SITE_URL` for signup links in templates. Queue still works without API (worker/manual flush).

---

## What was implemented (NGO portal onboarding)

- **Link existing org:** directory search preview (`NgoDirectoryOrgPreview`) shows registry fields + profile % before submit.
- **After link:** **Profile** section — completion checklist, edit mission/description/logo/brand colours/website.
- **Setup request:** questionnaire (has website? → skip landing ask; else $650 landing package); logo required unless they have a site; creates `ngo_setup_requests` row.
- **Staff:** `notify_staff_ngo_portal_event` RPC + auto task on registration (signup) and setup request; **Work queue → NGO setup requests**; dashboard stat `ngo_setup_requests_pending`.

Key files: `src/components/ngo/NgoProfileSection.tsx`, `src/lib/ngoProfileCompletion.ts`, `supabase/migrations/20260522130000_022_ngo_setup_requests.sql`.

---

## What was implemented (earlier session)

### Product
- **Single SKU:** `membership_annual` = **$100 NZD/year** (`src/config/pricing.ts`)
- **Flow:** Public standards pass → staff records membership → membership row + **paid_live** monitoring + **badge** (if standards pass) + welcome emails queued
- **No free membership on signup** — payment activates benefits (`src/lib/ngoSignup.ts`)

### Standards split
| Tier | Where | Examples |
|------|--------|----------|
| **Public** | CRM + NGO portal (outreach-safe) | Website, mission, contact, privacy, mobile, tone |
| **Member** | NGO portal + CRM (not public marketing) | Code repo, security baseline, shared credentials, donation copy |

### Monitoring tiers
| Tier | Who | Cadence |
|------|-----|---------|
| **passive** | Listed registry (no membership) | ~7 days — marketing / outreach stats |
| **active** | Verified, no membership | ~24h |
| **paid_live** | Paid membership | ~1h + down-alert queue |

### CRM
- **Registry insights** on Dashboard + Outreach (`RegistryInsights` + `registry_readiness_stats` RPC)
- **One button:** “Record membership paid ($100)” on org detail
- Org detail: **Public trust standards** + **Member security checklist**

### Email (queue, not SMTP yet)
- `notification_events` table + templates in `src/lib/notifications.ts`
- Queued on: membership welcome, badge issued
- **Next:** wire Go worker or Resend to send `pending` rows; queue `site_down` on incident open

### Backend
- `has_active_membership()` drives **paid_live** tier in Go worker (`backend/internal/store/store.go`)

---

## Your outreach script (NZ)

1. Use **Dashboard / Outreach → NZ registry insights** (% no site, % down, % profile-ready).
2. Call listed charity — share what you already know from the directory.
3. **Initialize criteria** on org → walk **public** standards.
4. When all public = pass → invoice **$100** with **NGR-…** reference.
5. **Record membership paid** → badge + hourly monitoring + emails (when sender wired).

**Separate products (later):** consulting, custom site, NGO CRM build, **hourly support** when site is down.

---

## Verify locally

```bash
npm run dev
# Staff: /staff/login → /dashboard (registry insights)
# Org: /organizations/:id → public standards → record membership
# NGO: /ngo/signup → link org → /ngo → Profile + Setup request sections
# Apply: npx supabase db push  (021 claim search RLS, 022 setup requests)
npm run build
```

---

## Email (implemented)

- **Resend** in Go: `backend/internal/notify` + `RESEND_API_KEY` in `backend/.env`
- **Site down:** queued when incident opens for **paying members** (deduped 24h)
- **Welcome / badge:** queued on membership payment; optional instant send if API configured
- **CRM:** `/notifications` → Send pending now (`VITE_MONITOR_API_URL` + `VITE_MONITOR_API_KEY`)

## Still to do

| Item | Notes |
|------|--------|
| Resend domain verify | Verify `NOTIFY_FROM_EMAIL` domain in Resend dashboard |
| Stripe checkout | Optional; bank transfer OK for first cohort |
| Supabase Auth URLs | Production + preview redirects |
| Daily volume actuals | `business_cashflow_units.actual_count` is monthly for now; day-by-day log + roll-up TBD |
| Commit & deploy | All changes local on `main` until you commit |

---

## Key files

| Area | Path |
|------|------|
| Pricing | `src/config/pricing.ts` |
| Payment → benefits | `src/lib/payments.ts`, `src/lib/membershipBenefits.ts` |
| Criteria | `src/types/index.ts` (`PUBLIC_BADGE_CRITERIA`, `MEMBER_CRITERIA`), `src/lib/criteria.ts` |
| Verification | `src/lib/verification.ts` (no auto-badge on pass) |
| Registry stats | `src/components/crm/RegistryInsights.tsx` |
| Business plan PDF | `src/lib/businessPlanPdf.ts`, `src/pages/crm/BusinessPlan.tsx` |
| Cashflow funnel | `src/config/salesFunnelModel.ts`, `src/config/cashflowAssumptions.ts` |
| Cashflow UI | `src/pages/crm/CashFlow.tsx`, `src/components/crm/CashflowForecastTable.tsx` |
| Migration 019–020 | `supabase/migrations/20260521130000_019_*.sql`, `20260521140000_020_business_cashflow_units.sql` |
