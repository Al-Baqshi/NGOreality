# Privacy & data residency — Organisation Workspace

_Status: **DRAFT — decisions 1 and 2 are open and block Phase 1 sign-off.**_
_Owner: Moe Baqshi. Last updated: 2026-07-28._

The Organisation Workspace stores **beneficiary case records** on behalf of
charities: names, contact details, dates of birth, ethnicity and iwi
affiliation, health notes, legal status, risk flags and caseworker notes. This
is the most sensitive data NGOreality will ever hold, and unlike the badge and
monitoring products, **it is not our data — we are a processor acting for the
charity.**

This document records the decisions that must be made before the module is
enabled for any real tenant.

---

## Roles

| Party | Role under the Privacy Act 2020 |
|---|---|
| The charity (tenant) | **Agency** — decides what is collected and why; owes IPP obligations to its clients |
| NGOreality | **Processor / service provider** — holds and processes on the charity's instruction |
| The beneficiary | The **individual** whose information it is |

Because the charity is the agency, our contract must make clear that we do not
use beneficiary data for our own purposes — not for analytics, not for product
improvement, not for outreach, not for AI training.

---

## Decision 1 — Data residency **[OPEN — blocks Phase 1]**

The production Supabase project (`cpbilbskfbzqlynjhdvm`) is hosted in
**`ap-southeast-2` (Sydney, Australia)**. NZ beneficiary data stored there is a
**cross-border disclosure under IPP12**.

IPP12 permits offshore disclosure where the receiving jurisdiction provides
comparable safeguards or the receiving party is contractually bound to
comparable standards. Australia is generally accepted as comparable, and the
contractual route is available regardless — but the position must be
**documented, disclosed to tenants, and disclosed to beneficiaries in the
collection notice**. It cannot be left implicit.

Options:

| Option | Effect | Cost |
|---|---|---|
| **A. Stay in Sydney, document IPP12** | Contractual safeguards in the DPA + disclosure in the tenant-facing collection notice | Lowest; a paperwork exercise |
| **B. NZ-hosted Postgres for workspace tables only** | Removes the offshore question for beneficiary data; splits the database | High — breaks the single-database architecture in `docs/ARCHITECTURE.md` |
| **C. Move the whole project to an NZ region** | Cleanest story | Supabase has no NZ region today; would mean leaving Supabase |

**Recommendation: Option A**, with the residency disclosed explicitly rather
than buried. Some funders and government-contracted social services will
require NZ residency; treat those as out of scope for v1 rather than
re-architecting for them speculatively.

**This is the one decision that is expensive to reverse** — `workspace_settings.data_region`
exists so the choice is recorded per tenant from day one.

> **Decision:** _pending_
> **Decided by / date:** _—_

---

## Decision 2 — Health information **[OPEN — blocks Phase 1]**

If any tenant delivers **health or disability services**, the information they
record is health information and is governed by the **Health Information
Privacy Code 2020**, not the general IPPs. The Code is stricter, particularly
on retention and disclosure.

`workspace_client_sensitive.health_notes` exists in the schema, which means we
must either accept HIPC scope or explicitly exclude health providers from v1.

**Recommendation:** exclude health and disability providers from the v1 design
partner cohort, and say so in the tenant agreement. Revisit once the module has
paying customers.

> **Decision:** _pending_
> **Decided by / date:** _—_

---

## What the schema already enforces

Migration `20260728090000_027_workspace_case_management.sql` implements these
as database constraints, not policy documents:

| Control | Mechanism |
|---|---|
| **Tenant isolation** | RLS on all 10 workspace tables, scoped by `organization_id` |
| **No anonymous access** | No `anon` policy on any workspace table. *(Note: migration 006 grants `anon` blanket access to the legacy CRM tables — see Known gaps.)* |
| **No NGOreality staff access** | `is_staff_user()` deliberately grants **nothing** on workspace tables. We cannot read a charity's client records, by construction. This is an IPP11 boundary. |
| **Least privilege inside the tenant** | 5 roles; `volunteer` and `viewer` cannot read `workspace_client_sensitive` or `restricted` notes |
| **Sensitive data separated** | Own table + own policy, rather than fragile column-level rules |
| **Tamper-evident notes** | `workspace_case_notes` has SELECT and INSERT policies only — no UPDATE, no DELETE |
| **Access logging (IPP5)** | `workspace_audit_log` records `read` and `export`, not only writes |
| **Consent capture (IPP3/IPP11)** | `workspace_consents`, including `withdrawn_at` |
| **Retention (IPP9)** | `workspace_settings.client_retention_months`, default 84 months |

Verified by `yarn test:isolation` (`tests/isolation/crossTenant.mjs`), which
must pass on every PR.

---

## Obligations still to build

| Obligation | Where it lands | Status |
|---|---|---|
| **IPP6** — individual's right to access their own information | Export-one-client function in `/ngo/workspace/clients/:id` | Not built |
| **IPP7** — right to request correction | Correction request log; note that case notes are immutable by design, so corrections append rather than overwrite | Not built |
| **IPP9** — retention enforcement | Scheduled purge in the Go worker driven by `client_retention_months` | Not built — currently records the policy without enforcing it |
| **Notifiable breach scheme** | Runbook: assess, notify OPC and affected tenants without undue delay | Not written |
| **Tenant DPA** | Processor terms: purpose limitation, sub-processors, breach notification, deletion on exit | Not drafted |
| **Collection notice template** | `workspace_settings.collection_notice`, seeded with an NZ default | Field exists, default text empty |
| **Sub-processor register** | Supabase (AU), Vercel (US/global edge), Resend (US) — all must be disclosed | Not written |

Note that Vercel and Resend mean the platform already has US-touching
sub-processors. Beneficiary data should never reach Resend — **do not put
client or case content into notification emails.**

---

## Known gaps in the existing platform

1. **Legacy `anon` policies.** Migration 006 grants `anon` full read/write on
   `organizations`, `contacts`, `verification_criteria`, `verification_badges`
   and `activity_log`, with the comment "replace with staff auth in
   production". That is still live. It does not expose workspace tables, but it
   should be closed before the workspace is sold.

2. **Privilege escalation in org claiming (fixed in migration 027).** Migration
   006's INSERT policy on `organization_members` checked only
   `user_id = auth.uid()` — any authenticated user could insert themselves as
   `owner` of any of the ~29k imported charities. Migration 027 restricts
   self-claim to unclaimed organisations and routes everything else through org
   admins or staff. **Any rows created under the old policy should be audited
   before the workspace goes live.**

3. **No retention enforcement anywhere** on existing tables.

---

## Before enabling a tenant

- [ ] Decisions 1 and 2 recorded above
- [ ] Tenant DPA signed
- [ ] `workspace_settings` row created with a real `collection_notice`
- [ ] `yarn test:isolation` green against a disposable project
- [ ] Tenant briefed that `volunteer`/`viewer` seats cannot see sensitive fields
- [ ] Legacy `anon` policies reviewed (gap 1)
- [ ] Existing `organization_members` rows audited (gap 2)
