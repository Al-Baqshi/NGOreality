I have everything verified. Writing the document now.

---

# NGOreality — Technical Strategy: Identity, Money, and Data Across Two Systems

**Date:** 28 July 2026 · **Author:** Lead architect · **Status:** Decisive. Act on this today.

**Verification note.** Before writing I re-read the live code, not just the briefs. Three things the briefs said are still true in the working tree and I confirmed them by hand: the workspace-takeover bug in `backend/internal/crm/supabase/supabase.go:53-56` is **live** (no `user_id` filter), the permissive RLS policy that makes it exploitable (`"Authenticated can read members on directory orgs for claim guard"`, migration 021 line 15) is **never dropped** by 028, 029 or 030, and `seats_purchased` still defaults to `1` so the first invite in every workspace fails. Two things the briefs did **not** know: migrations **029 and 030 exist** in the repo (029 closes the reclaim escalation with `claimed_at`; 030 revokes `EXECUTE` on every `SECURITY DEFINER` function from `PUBLIC` — this is the Reality Badge RLS fix referenced in the prompt, and it has landed). One structural fact neither brief stated plainly: **there are two Go binaries, not one**, and they have different database relationships. That changes the blast-radius story in §1.

---

## 0. The one-paragraph version

You have one identity provider (Supabase Auth) and that is correct — keep it, and keep JWKS verification, because it is your only real vendor escape hatch. You have two data planes and that is also correct — never revisit it. What you do **not** have is a way to take money, and the four things blocking that are all small. The decision on payments is **Stripe, and it is not close** — but for a sharper reason than the research brief gives: all three of your launch revenue lines are *your own* revenue, where NGOreality is legitimately the seller, so you do not need Stripe Connect at launch at all. Connect is a donations problem, and donations should not ship until you have an IRD ruling on platform-issued receipts. Before any of that, three security defects must land, because two of them let a stranger take over a charity's beneficiary records and one of them lets any NGO give itself a free membership.

---

# 1. The identity strategy

## 1.1 The shape: one identity, two data planes, three services

There is exactly **one** place a human account exists: `auth.users` in Supabase project `cpbilbskfbzqlynjhdvm` (ap-southeast-2). Nothing else creates users. Nothing else stores a password. The Go CRM's `platform.tenant_users.user_id` is a *copy* of the Supabase `sub` claim — a cross-database reference with no foreign key, and that is deliberate.

But the topology is not "Supabase + one Go service". It is:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  BROWSER — ngoreality.com (Vercel, React + supabase-js)                   │
│  Holds: Supabase access token (ES256, ~1h) + refresh token (localStorage) │
└───┬─────────────────────────┬───────────────────────────────┬────────────┘
    │ anon key + user JWT     │ Authorization: Bearer <JWT>   │ 303 redirect
    │ (PostgREST, RLS)        │ (no anon key)                 │
    ▼                         ▼                               ▼
┌───────────────────────┐  ┌────────────────────────┐  ┌──────────────────┐
│ SUPABASE              │  │ GO CRM  (cmd/crm)      │  │ STRIPE           │
│ ap-southeast-2        │  │ crm-api-production-    │  │ (§2 — not yet    │
│                       │  │ 1b72.up.railway.app    │  │  built)          │
│ • auth.users          │  │                        │  │                  │
│ • organizations (29k) │  │ own Railway Postgres:  │  │ holds the PAN,   │
│ • organization_members│  │ • platform.tenants     │  │ the subscription │
│ • organization_       │  │ • platform.tenant_users│  │ schedule, and    │
│   memberships         │  │ • platform.tenant_     │  │ the card vault   │
│ • organization_       │  │   invites              │  │                  │
│   payments  ◄─── §2   │  │ • tenant_<x>.clients   │  └──────────────────┘
│ • verification_*      │  │ • tenant_<x>.cases     │
│ • website_monitors    │  │ • tenant_<x>.case_notes│
│ • notification_events │  │   ← BENEFICIARY DATA   │
│ • portal_notifications│  └────────────────────────┘
└───────────▲───────────┘         ▲
            │                     │ PostgREST call with the END USER'S token
            │ direct Postgres     │ (membership check only, §1.4)
            │ (DATABASE_URL)      └─────────────────────────────
            │
┌───────────┴────────────────────────────────────┐
│ GO MONITOR/NOTIFIER  (cmd/worker + cmd/api)    │   ← SECOND Go binary.
│ internal/store, internal/monitor,              │     Connects DIRECTLY to
│ internal/notify → Resend                       │     Supabase Postgres.
│ NOT DEPLOYED, NOT SCHEDULED (§4)               │     Inside Supabase's
└────────────────────────────────────────────────┘     blast radius, not the
                                                        CRM's.
```

**Why this matters and the briefs missed it:** `backend/cmd/crm` (`CRM_DATABASE_URL` → Railway) and `backend/cmd/worker` + `backend/cmd/api` (`DATABASE_URL` → Supabase Postgres, confirmed at `backend/internal/config/config.go:31-37`) are different programs with different credentials. The worker holds a **direct Postgres superuser-adjacent connection to Supabase** and bypasses RLS entirely. The CRM holds **no privileged Supabase credential at all** — only the anon key, and it always presents the end user's token. That asymmetry is a feature: the CRM cannot read the public platform beyond what its caller can, which is exactly right, and it is why the S1 bug below is a *logic* bug rather than a credential leak. Keep it. Never give `cmd/crm` a service-role key.

## 1.2 How a session is established

```
 1. Browser → supabase.auth.signUp / signInWithPassword
                (src/contexts/AuthContext.tsx:98-104)
 2. GoTrue    → validates, issues:
                  access_token  : JWT, alg=ES256, kid=<rotating>, exp≈now+1h
                  refresh_token : opaque, long-lived
 3. supabase-js persists both in localStorage; auto-refreshes at ~t-60s
 4. Every PostgREST call carries:  apikey: <anon>  +  Authorization: Bearer <JWT>
    Postgres sets request.jwt.claims; RLS reads auth.uid()
 5. Every CRM call carries:        Authorization: Bearer <same JWT>   (no anon key)
```

There is no second login. There is no CRM password. A user who is signed in to ngoreality.com is, by construction, signed in to the workspace.

## 1.3 How the token reaches the Go service, and how it is verified

The browser sends the *same* Supabase access token to `crm-api-production-1b72.up.railway.app`. The CRM verifies it offline:

```
Authorization: Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6IjhmMy...
        │
        ▼  backend/internal/crm/auth/jwt.go
   parse header → alg must be ES256, kid must be present
        │        (bidirectional alg-confusion check, jwt.go:106-127 — this is
        │         correctly implemented and is the best security code in the repo)
        ▼  backend/internal/crm/auth/jwks.go
   kid → cached JWKS → *ecdsa.PublicKey
        │  cache miss → GET https://cpbilbskfbzqlynjhdvm.supabase.co
        │                   /auth/v1/.well-known/jwks.json
        ▼
   verify fixed-width r‖s signature over header.payload
        │
        ▼
   claims.Subject  = auth.users.id   ← THE ONLY THING THAT MATTERS DOWNSTREAM
   claims.Email    = display only (do NOT authorise on this — see §1.6d)
```

**No shared secret. No service-role key. No network call on the hot path once the JWKS is warm.** This is the correct design and it is the single thing that makes Supabase replaceable later: swap the issuer URL, keep everything else. Do not trade it away for convenience.

## 1.4 How a tenant seat is resolved

There are two distinct paths and conflating them is how you get breached.

**Path A — first provision (`POST /v1/signup`, one time per org):** the CRM must ask Supabase "is this caller an owner/admin of this organisation?" because the CRM has never heard of the org before. It does this via PostgREST with the user's own token (`supabase.OrganizationRole`). **This path contains the live critical bug — §1.6 below.**

**Path B — every subsequent request (`GET /v1/clients`, `POST /v1/cases/{id}/notes`, …):** the CRM resolves the seat **entirely from its own database**:

```sql
SELECT tu.role, t.id, t.schema_name, t.status
  FROM platform.tenant_users tu
  JOIN platform.tenants t ON t.id = tu.tenant_id
 WHERE tu.user_id = $1        -- claims.Subject, cryptographically verified
   AND tu.status  = 'active'
   AND t.status   = 'active';
```

Then `Registry.Acquire` (`backend/internal/crm/tenant/tenant.go:437-463`) opens a transaction and pins `search_path` to that tenant's schema with `SET LOCAL`. **Supabase is not consulted.** That is correct and must stay correct: it means a Supabase outage does not stop a caseworker mid-shift (until their token expires — §1.6e), and it means the beneficiary data plane has no runtime dependency on the public trust plane.

**The rule, stated once:** Supabase authenticates. The CRM authorises. Cross-system authorisation happens exactly once per tenant, at provisioning, and never again.

## 1.5 Source of truth — the authoritative table

| Fact | Source of truth | Where it physically lives | Who may write it | How the other system learns it |
|---|---|---|---|---|
| A human exists; their password; email verified | **Supabase Auth** | `auth.users` | GoTrue only | `sub` claim in the JWT |
| A charity exists (29k NZ registry) | **Supabase** | `public.organizations` | Staff CRM; registry import (008) | `POST /v1/signup` copies `id`, `name`, `country` into `platform.tenants` at provision |
| Who administers a charity's **public** presence | **Supabase** | `public.organization_members.role` | RLS-gated self-claim (029) + staff | Read once, at provision, to decide *whether* to provision |
| Whether a charity is a paying **member** | **Supabase** | `organization_memberships` + `organization_payments` | Stripe webhook (§2); staff CRM | `public.has_active_membership(uuid)` — read directly by `cmd/worker` |
| Reality Badge validity | **Supabase** | `verification_badges` | Staff CRM / activation trigger (§5 Phase 3) | Public directory renders it; CRM does not care |
| Trust-standards pass/fail | **Supabase** | `verification_criteria` | Staff only (RLS `028:49-53`) | — |
| Website up/down, monitoring tier | **Supabase** | `website_monitors`, `website_check_results`, `website_incidents` | `cmd/worker` via direct Postgres | — |
| A **workspace tenant** exists; its schema; its plan | **Go CRM** | `platform.tenants` | `cmd/crm` only | Supabase never reads this |
| Who holds a **seat** on beneficiary data; their CRM role | **Go CRM** | `platform.tenant_users.role` | `cmd/crm` only | Supabase never reads this |
| Beneficiary clients, cases, case notes, sessions, consents | **Go CRM** | `tenant_<x>.*` on Railway Postgres | `cmd/crm` only, through `Acquire` | **Never leaves. Not replicated. Not backed up to Supabase.** |
| Seats paid for | **Stripe** (subscription quantity) | Stripe | Stripe Billing | Webhook → `platform.tenants.seats_purchased` |
| Money received | **Stripe** (the charge), **Supabase** (the ledger of record) | `organization_payments` | Webhook only (§2.5) | `has_active_membership()` |

**Read this table as a set of prohibitions.** Supabase must never contain a beneficiary record. The CRM must never contain a password, a card, or a badge. Stripe must never be the ledger you query for entitlement at request time — you query your own copy, written by the webhook.

**Corollary — delete migration 027's `workspace_*` tables.** Migration 027 built ten `workspace_*` tables in Supabase with their own RLS: a complete second implementation of case management, in the public cluster, behind the anon key. `grep` finds zero frontend references. They are empty. `src/config/features.ts` still ships `WORKSPACE_ENABLED` describing them as the enforcement mechanism — that comment is now false. **Drop the tables and fix the comment.** Two implementations of beneficiary case records is worse than either one, and this one directly contradicts the founding constraint in `docs/PLATFORM_STRATEGY.md:31-33`.

## 1.6 Failure modes and their correct handling

### (a) LIVE CRITICAL — workspace takeover via unfiltered membership lookup

**This is not a failure mode. It is an open door, today, in `main`.**

`backend/internal/crm/supabase/supabase.go:52-56`:

```go
endpoint := fmt.Sprintf(
  "%s/rest/v1/organization_members?select=organization_id,role&organization_id=eq.%s&limit=1",
  c.baseURL, url.QueryEscape(organizationID),
)
```

No `user_id` filter. The function's own doc comment says *"a user who is not a member simply gets zero rows back"* — that is false against your actual RLS, because migration 021 line 15 adds a **permissive, OR'd** SELECT policy letting any authenticated user read `organization_members` rows for **any** org with `status IN ('listed','verified','active')`. All ~29,000 imported charities are `status='listed'`. I confirmed 028, 029 and 030 never drop it.

So `OrganizationRole()` returns **somebody else's role**, and `organization_members.role` defaults to `'owner'`.

```
attacker signs up (free, self-serve)
   │
   ├─► picks any listed charity that has claimed its portal but not yet
   │   pressed "Create workspace"
   │
   ├─► POST /v1/signup {"organization_id":"<victim>"}
   │        OrganizationRole → "owner"   ← the victim's row, not the attacker's
   │        signup.go:77 check passes
   │        Provision() succeeds
   │        ProvisionInput.OwnerUserID = claims.Subject  ← THE ATTACKER
   │
   └─► real charity later clicks "Create workspace" → 409 "ask one of its
       administrators to invite you". The attacker is the administrator, and
       reads every client, case note and health record entered from then on.
```

**Correct handling — three changes, all today:**

1. `supabase.go`: append `&user_id=eq.` + `url.QueryEscape(claims.Subject)`, drop `limit=1`-as-authorization, and assert `rows[0].OrganizationID == organizationID` before returning. Pass `claims.Subject` down from `signup.go` — the signature must change to `OrganizationRole(ctx, userToken, userID, organizationID string)`.
2. New migration `031`: drop the 021 policy and replace it. The claim guard needs "does this org have *any* member", which is `public.organization_is_claimable(uuid)` — already built in 029 and already granted to `authenticated` in 030. The UI does not need to read other people's membership rows at all.
3. `tests/isolation/crossTenant.mjs`: an authenticated non-member must receive **zero rows** from `organization_members` for a `listed` org, and `POST /v1/signup` for an org they do not belong to must return 403.

Migration 029 closed the *reclaim* variant. This is the *first-claim* variant, and it is upstream of `Provision`, so 029 does not touch it. **This blocks signup opening. Nothing else in this document matters until it lands.**

### (b) Key rotation → 401 storm

`jwks.go:96-102`: `refresh()` returns `"jwks refresh throttled"` if called within 30s. `key()` falls back to a stale key **only if the kid was already known** (`jwks.go:81`). On rotation the kid is new, so N concurrent requests all call `refresh()`; one wins, N−1 get an error, and N−1 perfectly valid tokens are rejected.

**Correct handling:** singleflight the refresh. On throttle, **block on the in-flight result** rather than returning an error. Never fail a request because another request is already fetching the thing you need.

### (c) Key rotation → old-key eviction

`jwks.go:135-137` replaces `c.keys` wholesale. Supabase publishes both keys during rotation, but one partial or CDN-stale response drops the old key and every unexpired token signed by it 401s instantly.

**Correct handling:** **union** new keys over old. Expire retired `kid`s after max token lifetime (~1h), not immediately. A key you have seen is never worse than a key you have not.

### (d) Claims change → total outage (the landmine)

`jwt.go:34` declares `Audience string`. RFC 7519 permits `aud` to be a **JSON array**, and GoTrue has emitted `["authenticated"]`. `json.Unmarshal` into `string` fails → `ErrMalformed` → **every request 401s** with the deliberately vague message `"invalid token"` — the exact message that makes this undiagnosable at 2am. This is entirely under Supabase's control and can land in any GoTrue release.

Related and backwards: `jwt.go:145` checks `if claims.Audience != "" && ...` — `exp`, `aud` and `iss` are all validated **only if present**. A token with no `exp` never expires.

**Correct handling:** custom `UnmarshalJSON` accepting string-or-array. Make `exp`, `aud`, `iss` **mandatory** — absent means reject. Add RS256 to the JWKS parser now (`jwks.go:122` silently skips non-EC keys); if Supabase moves to RS256 you currently have no fallback and no error message that says so.

### (e) Supabase outage

Stale JWKS keeps verification alive indefinitely — good, and deliberate. But access tokens live ~1 hour and refresh goes to GoTrue. **A 2-hour Supabase Auth outage is a 2-hour total beneficiary-records outage**, in a product whose entire pitch is that this data is separate from the public site.

**Correct handling:** after the first successful Supabase verification, `POST /v1/signup` and a new `POST /v1/session/exchange` mint a **CRM session token** — 24h, signed by a CRM-held key, containing `{sub, tenant_id, role, seat_version}`. The browser sends that to the CRM instead of the Supabase token. Supabase stays on the login path and off the request path. This also removes JWKS from the hot path entirely, which retires (b) and (c) as availability risks. Include `seat_version` so a revoked seat invalidates outstanding tokens without a blocklist.

This is Phase 5 work, not launch work — but design the header handling now so it is a swap, not a rewrite.

### (f) User deleted upstream → orphaned seat

`auth.users` delete cascades `organization_members` (documented at length in 029). `platform.tenant_users` is in another database with no FK. The seat persists forever, counts against `seats_purchased` — which you are about to charge $15/mo for — and appears in `GET /v1/team`. Nothing consumes Supabase auth webhooks.

**Correct handling:** a nightly reconciliation job in `cmd/worker`. For each distinct `platform.tenant_users.user_id`, confirm the `sub` still exists in `auth.users` (the worker already has direct Supabase Postgres access — this is a single `SELECT id FROM auth.users WHERE id = ANY($1)`). For missing subs, `UPDATE platform.tenant_users SET status='disabled'`. **`disabled` is already the correct tombstone**: it preserves `case_notes.author_id` attribution for the audit trail and is excluded from `activeSeatCount` (`tenant/seats.go:141-144`), so it stops billing too. Never delete the row — deleting it destroys the Privacy Act audit story.

Same job handles the harder case in reverse: **an organisation deleted in Supabase leaves its tenant schema alive, ownerless, and invisible to the staff CRM, with every beneficiary health record intact.** That is an IPP 9 retention breach, not untidiness. The job must flag orphaned tenants for staff review — never auto-delete beneficiary data.

### (g) Role drift between `organization_members` and `platform.tenant_users`

**The correct handling is: do not sync them, and stop thinking of it as drift.** They are different questions in different namespaces:

| | `organization_members.role` | `platform.tenant_users.role` |
|---|---|---|
| Values | `owner`, `admin`, `member` | `owner`, `admin`, `caseworker`, `volunteer`, `viewer` |
| Governs | Public trust presence: badge requests, standards page, billing, who may create a workspace | Beneficiary data: which clients, which case notes, whether you can write, whether you can see `sensitive` fields |
| Written by | Supabase RLS self-claim + staff | `cmd/crm` only, by a tenant `owner`/`admin` |
| Read by the other system | **Once**, at provision, to answer "may this person create a workspace?" | **Never** |

Promoting someone to `admin` in the NGO portal deliberately grants them **nothing** in the CRM. That is the 029/`signup.go` decision and it is exactly right — the comment explaining it is the best documentation in the repo. Automatic sync would mean a public-side role change silently opening beneficiary health records, which is the failure you are architecting against.

**The one linkage that must exist** is negative, not positive: when a user loses `organization_members` for an org (removed, or account deleted), the reconciliation job in (f) must **disable** their `tenant_users` seat. Removing access propagates; granting access never does.

**And the trap:** migration 027's `workspace_*` RLS derives access from `workspace_role(org)` off `organization_members` — a *third* authorisation system that would grant full sensitive access on a public-side promotion. It is unused and empty. **Dropping those tables (§1.5) is what makes this rule enforceable rather than aspirational.**

### (h) Invite redemption on an unverified email

`tenant/seats.go` `AcceptInvite` binds the seat to `claims.Email`. Nothing checks `email_verified`. An attacker who signs up as `director@victim-ngo.org` without confirming — or via an OAuth provider returning an unverified address — redeems an invitation meant for the real person.

**Correct handling:** require `email_verified == true` in the claims, **and** treat email as display-only. This is the same class of error as (a): authorising on an attribute you did not verify.

---

# 2. The money strategy

## 2.1 The decision

**Use Stripe. Standard account, NGOreality as merchant of record, Stripe Billing for recurring, Stripe Checkout (hosted redirect) for the payment page. No Connect at launch.**

And the sharper point the payments brief did not quite make: **all three launch revenue lines are your own revenue.**

| Product | Who is the seller? | Whose money is it? | Connect needed? |
|---|---|---|---|
| $70/yr membership (badge + monitoring) | NGOreality | NGOreality's | No |
| $25/mo + $15/seat workspace SaaS | NGOreality | NGOreality's | No |
| $650 one-off landing page | NGOreality | NGOreality's | No |
| *(future)* donations to a charity | The charity | **The charity's** | **Yes — and a legal ruling first** |

The multi-tenant argument that dominates the payments brief — "there is no Connect equivalent in NZ" — is a **donations** argument. For your launch revenue you are an ordinary NZ merchant selling software and services. That means the bar is much lower than the brief implies, and several NZ options clear it. Stripe still wins, on different grounds.

## 2.2 Why Stripe, against the researched alternatives

| Criterion (weighted for *this* launch) | Stripe | Cuscal Paymark Click | Paymark Online EFTPOS | Windcave | POLi |
|---|---|---|---|---|---|
| **Native recurring engine** (you have three recurring lines and a two-person team) | ✅ Subscriptions, proration, smart retries, dunning email, hosted billing portal, card account updater | ❌ token only — you build the scheduler, ladder, expiry handling | ⚠️ "Repeat Pay": mandate stored but **you fire every charge**, max **3 req/sec**, only in 05–07, 12–14, 21–23 windows | ⚠️ `BillingId` + `RecurringMode`; you still build dunning | ❌ |
| **Webhooks** | ✅ HMAC-signed, replayable, CLI-forwardable, at-least-once | ❌ **none at all** — vendor tells you to poll `/api/transaction/search` | ✅ signed JWT + JWKS (genuinely good) | ✅ | ❌ |
| **Time to first live payment** | **hours**, self-serve | UAT minutes; **prod weeks** (bank facility first) | **days–weeks**, sandbox is sales-gated, prod needs a human go-live review | days, sales must issue credentials | n/a |
| **Seat-quantity billing** ($15/seat) | ✅ first-class `quantity` on a subscription item | ❌ build it | ❌ build it | ❌ build it | ❌ |
| **Invoicing / tax invoice output** | ✅ Stripe Invoicing, hosted invoice page, PDF | ❌ | ❌ | ❌ | ❌ |
| **PCI posture** | SAQ A via hosted redirect | SAQ A via HPP | out of card scope entirely | SAQ A | n/a |
| **Path to donations later** | ✅ Connect Standard | ❌ per-tenant bank + gateway sales cycle | ❌ same | ⚠️ manual | ❌ |
| **Vendor roadmap confidence** | high | **low** — two owners in six years, incomplete rebrand (JWKS path is literally `/worldlinejwks/`), switch replacement running to 2030, no published post-acquisition API roadmap | low (same platform) | medium | **avoid** |

**The disqualifier for Click is the absence of webhooks.** A charity treasurer who closes the tab after paying produces *no* notification of any kind, and the vendor explicitly tells you not to trust the `return_url` POST variables. You would build and operate a polling reconciliation loop before you could recognise your first $70. That is weeks of engineering to be worse off.

**The disqualifier for Online EFTPOS as a primary rail** is that recurring is a batch window pretending to be an API, the sandbox has no self-signup, and production requires a human go-live review with a sales team. It is a genuinely good product in a narrow slot.

**POLi: do not build on it.** It brokers customers' internet-banking credentials. For a company whose entire product is charity *trust*, asking anyone to type bank credentials into a third-party overlay is a reputational risk that no fee saving covers.

**Where Paymark still earns a place — later, and only later.** Online EFTPOS has zero card-scheme fees, no chargebacks, no PAN anywhere in the flow, and a properly-designed signed-JWT-over-JWKS webhook (the same verification pattern you already implement for Supabase, so the code is largely reusable). For a **$650 one-off** or a large one-off donation, avoiding ~2.65% is real money and a bank-app approval is a high trust signal. Add it as a *supplementary rail* in year two, behind the same internal payment abstraction. Do not let it near your subscriptions.

### Honesty about what is unverified

The payments brief researched **Paymark**, not Stripe. Every Stripe figure below comes from that brief's comparison table, and I have not verified any of it against Stripe's own NZ pricing page or dashboard. **Before you publish a price, confirm these four things in the Stripe dashboard on day one:**

1. Domestic card **2.65% + $0.30**, international **3.7% + $0.30** (stated as effective 1 May 2026).
2. **NZ BECS Direct Debit at 1% + $0.40 capped $4.00**, failure/dispute fee **$6**. Confirm the payment method is available on a NZ account and supported as a Billing subscription payment method, not just one-off.
3. **Stripe's nonprofit rate does not apply to you.** NGOreality Ltd is a for-profit company selling software; the discount is for the charity as merchant. Do not build a forecast on it. (It *does* become relevant to your customers if you ever ship Connect — that is a genuine sales talking point for them, not a cost saving for you.)
4. Whether Stripe Invoicing supports a **NZ bank-transfer / virtual-account** payment method. I could not confirm this. If it does not, your $650 invoices are card-or-manual — which is fine, see §2.4.

## 2.3 The three products, concretely

Create **one Stripe Customer per organisation**, stored as a new column `organizations.stripe_customer_id`. One customer carries all three products and one payment method, so a charity that adds a workspace does not re-enter a card.

```
Stripe object model
───────────────────
Customer  cus_XXX                     ↔  organizations.id  (metadata.org_id)
  │                                       metadata.payment_reference = NGR-XXXXXXXX
  │
  ├── Subscription sub_A  (annual)
  │     └── item: price_membership_annual   NZD 7000 (excl GST)  qty 1
  │
  ├── Subscription sub_B  (monthly)
  │     ├── item: price_workspace_base      NZD 2500 (excl GST)  qty 1
  │     └── item: price_workspace_seat      NZD 1500 (excl GST)  qty = extra seats
  │
  └── Invoice in_C  (one-off)
        └── item: Trust landing page + standards setup  NZD 65000 (excl GST)
```

Prices already exist in code and must be the single source: `src/config/pricing.ts:4` (`MEMBERSHIP_ANNUAL_CENTS = 7_000`), `src/config/customerProducts.ts:11-13` (`WORKSPACE_ADMIN_MONTHLY_CENTS = 2_500`, `WORKSPACE_SEAT_MONTHLY_CENTS = 1_500`), `src/config/customerProducts.ts:17` (`LANDING_STANDARDS_PACKAGE_CENTS = 65_000`).

**Fix the price triplication first.** $70 is currently defined in three incompatible places: `pricing.ts:4` (`7000`), migration `026:100` (hardcoded `7000` in the pending-row insert), and `026:143` + `src/lib/notifications.ts:80` (the literal string `"NZD $70.00"` in email copy). A price change today silently desyncs the ledger from the email you send the customer. Before Stripe: make the SQL read from a `platform_pricing` table or accept the amount as a trigger argument, and make the email template interpolate rather than hardcode.

**Seat quantity is derived, never entered.** `platform.tenant_users` where `status='active'` is the truth. When a seat is added or disabled, `cmd/crm` calls Stripe to update `sub_B`'s seat-item quantity; Stripe prorates. `seats_purchased` on `platform.tenants` becomes a **cache of the Stripe quantity, written by the webhook**, never by a human. This resolves the day-one `402 no seats remaining` defect (§4) properly rather than by bumping a default.

## 2.4 Recurring billing, stated concretely

The brief asked me to say exactly how recurrence works if the provider lacks native subscriptions. **Stripe does not lack them**, so:

- **Stripe holds the schedule.** Stripe decides when $70 or $25+$15n is due, attempts the charge, retries on failure with smart retries, emails dunning notices, and updates the card when the bank reissues it (account updater). You write none of this.
- **Stripe holds the token.** The PAN lives in Stripe's vault. You hold `cus_…`, `sub_…`, `pi_…`, `in_…` — identifiers, not credentials. Treat the store as sensitive anyway (encrypted at rest, access-logged, never in application logs or Sentry payloads) because a system that can charge with a token is a payment-relevant system, but it is **not** cardholder data and does not drag you toward SAQ D.
- **You hold the entitlement.** Your job is one webhook handler that turns Stripe events into rows in `organization_payments`, and a nightly reconciliation that catches anything the webhook missed.
- **Cancellation is in-product**, via Stripe's hosted Billing Portal (`billingPortal.sessions.create`) — one API call, zero UI to build, and it directly satisfies the Fair Trading symmetry requirement in §2.7.

**Payment method routing — the recommendation:**

| Product | Default rail | Why | Effective cost |
|---|---|---|---|
| $70/yr membership | **Card** | Once a year, low value, instant, no mandate friction on a volunteer treasurer | $2.16 → **3.08%** |
| $25–$70/mo workspace | **Offer BECS DD, default card** | DD is cheaper ($0.65 vs $0.96 on $25) but a $6 failure fee is 24% of a $25 invoice; card retries are free | card $0.96 → **3.85%** |
| $650 one-off | **Offer BECS DD or bank transfer prominently** | DD caps at $4.00 vs $17.53 on card — **saves $13.53, 2.1% of the sale** | DD **0.62%**, card **2.70%** |

**Keep manual bank transfer alive as a first-class fallback, permanently.** NZ charity treasurers are volunteers with committee approval cycles and dual-authorisation bank accounts; a meaningful fraction cannot or will not use a card. The `NGR-XXXXXXXX` reference scheme is already built (`src/lib/payments.ts:12-14` and `026:45`, verified identical output), already backfilled with a unique partial index (`015:11-13`), and already surfaced with a copy button. Do not throw it away — **unify it**: pass `NGR-XXXXXXXX` as the Stripe Checkout `client_reference_id` and as `metadata.payment_reference`, so a Stripe payment and a bank transfer reconcile against the *same* key and the staff CRM's "Record membership paid" button becomes the exception path rather than the only path.

## 2.5 Where payment state lives, and why

**Supabase is the ledger of record. `organization_payments` stays where it is.** Three reasons, in order of force:

1. **Every entitlement the money buys is Supabase-resident.** `public.has_active_membership(uuid)` (migration `018:48-69`) reads `organization_memberships` and `organization_payments` directly. The badge (`verification_badges`), the monitoring tier (`website_monitors`), the down-alert gate (`store/notifications.go:92-103`) and the directory display all derive from it. Moving the ledger elsewhere means a cross-system call inside an RLS policy, which is not a thing.
2. **`cmd/worker` already reads it over a direct Postgres connection** (`backend/internal/store/store.go:75-113`, `SyncMonitors` calls `public.has_active_membership(o.id)` inline in the tier CASE). That query has to stay local.
3. **The CRM tenant database must contain no financial data.** Keeping `tenant_<x>.*` strictly beneficiary-only is what makes the per-tenant export, the per-tenant delete and the Privacy Act story clean. Do not pollute it.

**`platform.tenants` holds a derived entitlement mirror, not money:** `plan`, `seats_purchased`, `status`. Written only by the webhook path, never by a human, never authoritative for dollars.

**One writer.** Build the webhook as a **Supabase Edge Function**, `supabase/functions/stripe-webhook/index.ts`:

- It is the only component that can legitimately hold a **service-role key** and write `organization_payments`, which is staff-only under RLS (`015:53-57`). No new infrastructure. Deployed alongside the migrations.
- It is colocated with every table it must touch, so activation is one transaction.
- `cmd/crm` never sees money and needs no Stripe credential — preserving the property from §1.1 that the CRM holds no privileged Supabase credential.
- For the workspace seat mirror it calls a **new** CRM endpoint `PATCH /v1/admin/tenants/{id}` (accepting `{seats_purchased, plan, status}`) authenticated with the existing `adminOnly` guard. That endpoint does not exist today — `backend/internal/crm/httpapi/server.go:50-54` has `POST`, `GET`, `DELETE` and `POST .../users` but no `PATCH`. It is a Phase 4 deliverable.

```
 Stripe                Supabase Edge Fn              Supabase Postgres          Go CRM
   │                          │                            │                      │
   │ checkout.session.        │                            │                      │
   │ completed ──────────────►│ verify HMAC signature      │                      │
   │                          │ (constructEvent)           │                      │
   │                          │─ UPDATE organization_ ────►│  pending → paid      │
   │                          │  payments WHERE            │  set paid_at,        │
   │                          │  stripe_invoice_id = ...   │  period_start/end    │
   │                          │  (idempotent, unique idx)  │        │             │
   │                          │                            │        ▼ TRIGGER     │
   │                          │                            │  activate_membership │
   │                          │                            │  → memberships       │
   │                          │                            │  → verification_     │
   │                          │                            │    badges (if all 6  │
   │                          │                            │    public criteria   │
   │                          │                            │    pass)             │
   │                          │                            │  → notification_     │
   │                          │                            │    events (email)    │
   │                          │                            │                      │
   │ customer.subscription.   │                            │                      │
   │ updated (seat qty) ─────►│──── PATCH /v1/admin/tenants/{id} ─────────────────►│
   │                          │      X-Admin-Key            seats_purchased=n      │
   │                          │                                                    │
   │ invoice.payment_failed   │                                                    │
   │ (final attempt) ────────►│──── PATCH /v1/admin/tenants/{id} ─────────────────►│
   │                          │      status = 'suspended'   ← the missing          │
   │                          │                               state transition     │
```

That last arrow is worth naming: `platform.tenants.status` has a `suspended` value, `Acquire` rejects it (`tenant.go:441-443`), the middleware rejects it, `MigrateAll` still migrates it — a **complete state machine with no transition into it**. Nothing anywhere sets `suspended`. Today that is revenue leakage. The moment you sell workspaces it means a customer who stops paying keeps live beneficiary data forever. The failed-payment webhook is that transition.

## 2.6 Two hard rules about payment code

1. **Never accept a PAN. Not once. Not for a phone payment, not for a migration.** One code path touching a raw card number drags your whole environment from SAQ A (~20–30 questions) to SAQ D (~250 questions plus, realistically, an annual QSA engagement). If a treasurer wants to read a card number down the phone, use Stripe's virtual terminal in the dashboard.
2. **Use Stripe Checkout's hosted redirect, not Elements-in-your-page, at launch.** Both are SAQ A, but the SAQ A r1 revision (published Jan 2025, effective 31 March 2025) added an eligibility criterion about script attacks. For a **full-page redirect** you mark it Not Applicable and complete Appendix D. For an **iframe/embedded form** the criterion applies and you must hold written confirmation from Stripe that their solution includes payment-page script protection. Redirect is strictly less paperwork for an identical control posture. Revisit embedded fields when conversion data justifies the extra evidence-gathering.

## 2.7 NZ compliance obligations that actually bind

### GST — the highest-value action in this document, and it is free

**Reprice everything as "$X + GST" today, before the first invoice.** Not because you must register now — because s 51(4)(b) GST Act means that if you cross $60,000 and fail to register, the Commissioner deems you registered **from the date you became liable**, and you owe output tax at 3/23 of what you actually collected. On $60,000 of GST-unaware invoicing that is ~**$7,826 out of your own margin**, plus possible use-of-money interest and shortfall penalties. A software business has few inputs, so the input-tax credits will not soften it much.

If your pricing page says "$70/year" you may not be contractually entitled to add 15% later — that is a price rise, and under the Fair Trading UCT regime a unilateral price rise without a matching exit right is a candidate-unfair term (ComCom Guidelines [97.6]). If it says "$70 + GST" you simply start charging $80.50 the day you register.

**When you cross,** on the rolling 12-month test in s 51(1)(a) — track this monthly, not by financial year:

| Revenue mix | Units to reach $60,000 (GST-exclusive) |
|---|---|
| Memberships only | **858** members |
| Workspace only, base seat | **200** tenants for a full year |
| Landing pages only | **93** projects |
| Realistic blend: 200 members + 40 workspaces + 15 landing pages | $14,000 + $12,000 + $9,750 = **$35,750** — under, but one good quarter from the prospective test in s 51(1)(b) biting |

You must **apply within 21 days** of becoming liable (s 51(2)). And note the prospective limb: reasonable grounds to *believe* you will exceed $60k in the next 12 months is enough on its own.

Two things worth saying on the pricing page, both true and both trust-building: **"If your charity is GST-registered, you can claim the GST back."** Under the s 20(3K) non-profit concession, a GST-registered NZ non-profit gets input tax credits on essentially everything except what is used to make exempt supplies — materially more generous than normal apportionment. For them your product is effectively 13% cheaper than headline. For the many small charities under the $60k threshold themselves, the 15% is a real unrecoverable cost, so **show a GST-inclusive total prominently too.**

### Tax invoices — build to s 19E, not to "tax invoice"

Since 1 April 2023 the operative concept is **taxable supply information (TSI)**, ss 19E and 19K. Requirements are banded by the consideration on that supply:

| Your product | Consideration | Band | What you must include |
|---|---|---|---|
| Membership | $70 | **≤ $200** | Supplier name; date; description; consideration. No GST number required (s 19F(2)) |
| Workspace, monthly | $25–$70 | **≤ $200** | Same |
| Landing page | $650 | **> $200, ≤ $1,000** | Supplier **name + GST registration number**; date; description; **and either** the GST-inclusive amount *plus a statement that it includes GST*, **or** all three of GST amount / exclusive / inclusive |
| Workspace, annual prepay | $300–$840 | **> $200, ≤ $1,000** | Same as above |

Above $1,000 you also need recipient details — but per the 31 March 2026 amendment to s 19E(2)(a)(ii), only **if the recipient is registered and tells you so**. Capture the charity's **registered legal name from the Charities Register** (not their trading name — their auditor reconciles to the legal entity), their **Charities Registration Number (CCXXXXX)**, their **IRD number** and their **GST number** at signup anyway. You need the first three for donation receipting later, and it removes friction from their annual audit.

**Build s 19N supply correction information now, before the first invoice.** This is the old credit note, and a subscription product generates them constantly — refunds, proration on a seat change, downgrades, cancellations. It must carry an identifier that it is a correction, your name and GST number, the date, and the correction including any change to the GST charged. "Just issue a negative invoice" does not satisfy s 19N. Retrofitting this is painful; Stripe's credit-note object gives you most of the shape for free if you configure it up front.

Also: **time of supply is the earlier of invoice issued or payment received (s 9(1))**. On an annual membership invoiced in advance, output tax on the whole year falls in that period. While taxable supplies are ≤ $2m in a 12-month window you may use the **payments (cash) basis** (s 19A(1)(b)) — do, while you are small, because it is kinder to cash flow with any bad-debt risk.

### PCI scope

Contractual, not statutory — PCI DSS is not NZ law, it binds you through your Stripe agreement and the card scheme rules. Target **SAQ A**, achieved by never letting a PAN reach your servers (§2.6). Complete the SAQ + AoC annually and keep them; your acquirer will ask and so will any charity's auditor. Treat SAQ A-EP as an architectural failure and SAQ D as out of the question at your stage.

### Are you a payment facilitator? **No — and here is the line to defend.**

Neither "merchant of record" nor "payment facilitator" is a NZ statutory term. What NZ law actually asks is: **do you receive, hold or transmit funds for another person?**

| Scenario | You are | FSPR? | AML/CFT? |
|---|---|---|---|
| **Launch: selling your own SaaS.** Charity pays you for your software. Stripe settles to your bank account. It is your revenue. | **An ordinary merchant** | **No** | **No** |
| Charity has its own PSP account, settles direct, you take fees on your own invoice | Technology provider | No | No |
| Connect with the charity as connected account, direct charges, you never in the flow | Technology provider | No | No |
| **You pool donations and pay charities out** | Money or value transfer service | **Yes** + dispute resolution scheme | **Yes** |
| **You are MoR for donations** | MoR + arguably MVTS — **and it destroys the donor's tax credit** | Likely yes | Likely yes |

Being merchant of record for **your own software sales** is just being a business. Being merchant of record for **a donation** means the donor gifted to *you*, and unless *you* are a donee organisation there is no tax credit — which is fatal to a receipting product. **Write this down as an architectural constraint: NGOreality is never in the flow of funds for money that belongs to a charity.** Every future "wouldn't it be easier if we just collected it" conversation should hit that sentence.

If you ever cross that line, the cost is not plumbing: FSPR registration (s 11, penalties to $300k for a body corporate) plus approved dispute-resolution scheme membership (s 48, because individual donors are retail clients), plus AML/CFT reporting-entity status under s 5(1)(a)(iv) with DIA as sole supervisor since 1 July 2026 — written risk assessment, AML/CFT programme, compliance officer, CDD, SARs, prescribed transaction reports at $1,000, annual report, periodic independent audit. Order of magnitude **NZ$30–80k in year one** plus ongoing load. I checked: there is **no exclusion in the AML/CFT (Definitions) Regulations 2011 for payment processors, merchant-collecting agents or donation platforms.** Do not plan around finding an exemption.

### Contract terms — the Fair Trading UCT regime applies to you

Your customers are charities engaged in trade, on your standard form, well under the **$250,000** annual-value threshold (s 26D(4)(d)(i)). So these are **small trade contracts** and the unfair contract terms regime bites. You cannot contract out of it (s 15), and if you allege your contract is not standard form the presumption is against you (s 46J(3)). Every auto-renewal is a renewal that resets the clock (s 26A(2)/26B).

There is **no NZ statute mandating renewal reminders or cancellation notice for B2B SaaS** — auto-renewal is lawful. But ComCom's Guidelines [97] flag as candidate-unfair any term letting one party but not the other renew ([97.5]) or vary the price without a right to terminate ([97.6]). Four clauses, cheap, and they remove the argument almost entirely:

| Clause | Do this |
|---|---|
| Auto-renewal | Renew annually, but **email a reminder 30 days before**, stating the date and the price that will apply. Stripe can send it. |
| Price changes | **≥30 days' notice**, effective **only at the next renewal**, **plus an express penalty-free right to cancel** before it takes effect. |
| Cancellation | Symmetrical and in-product — the Stripe Billing Portal gives you this in one API call. Not "email support@". |
| Data on exit | Commit to a **usable-format export** and a defined deletion window. Note the charity has a **7-year** tax retention obligation and cannot meet it if you hard-delete on churn. Your CSV export is already first-class; say so in the terms. |

Also live regardless of UCT: FTA s 9 (misleading conduct), s 13(g) (false price representations), s 12A (unsubstantiated representations). "$25/month" that becomes $28.75 with GST is s 13(g) exposure unless "+ GST" is clear and *adjacent to the number*, not a footnote. Uptime or security claims you cannot substantiate are s 12A exposure — relevant, because you are selling monitoring.

### Record retention — and the one obligation you are currently in breach of

**7 years** after the end of the income year, under TAA s 22(2) and GST Act s 75(3) — including, per s 22(1)(d)–(e), invoices for services *and* **your billing system's own documentation**.

The item that binds and is easy to miss: **TAA s 22(2BA) and GST Act s 75(3BA) require taxpayer records to be kept at a place in New Zealand**, unless the Commissioner authorises offshore storage (s 22(8)/s 75(6)) or they are held by a provider the Commissioner has approved. **Supabase is ap-southeast-2 (Sydney). Railway is offshore. Stripe is offshore.** Your own accounting records are therefore stored outside NZ.

This is not a launch blocker — it is a "get this right in the first year" item, and there are two paths: keep the authoritative accounting records with an NZ-resident arrangement, or apply to IRD for approval under **SPS 21/02** (approval turns on records remaining accessible to the Commissioner, retrievable in electronic usable format at no cost to IRD, and returnable on termination). The second path is also a genuine competitive asset — "IRD-approved for offshore record storage" is a line no offshore CRM competing for NZ charities can write, and it matters doubly once *your customers'* donation records live in your system.

Two privacy items that landed recently and hit this product directly. **IPP 3A came into force 1 May 2026**: when you collect personal information about someone from a source other than that person, you must take reasonable steps to make them aware of who is collecting and holding it and their access/correction rights. Every time a caseworker enters a beneficiary or a charity bulk-uploads a list, you are indirectly collecting about people who have never heard of you. Handle it contractually (charity warrants it gave notice at its point of collection) **and** in-product (a plain-language privacy notice naming you as holder). Whether relying on the charity's notice discharges *your* obligation is not settled — a paper trail showing you took reasonable steps is what matters. And build the **notifiable-breach runbook before launch**: Privacy Commissioner within 72 hours of knowing a breach is notifiable, affected individuals as soon as you can. You will hold donor financial data *and* vulnerable-client case notes; that combination is the definition of "likely to cause serious harm".

---

# 3. The complete flow

## 3.1 The whole journey

```
 STAGE 0        STAGE 1        STAGE 2       STAGE 3      STAGE 4      STAGE 5
 DISCOVER  ───► CLAIM     ───► PROVE    ───► STANDARDS ─► PAY     ───► BADGE
 (public)       (Supabase)     CONTROL       (Supabase)   (Stripe)     (Supabase)
                               (Supabase)                                 │
                                                                          ▼
                                                                    STAGE 6
                                                                    WORKSPACE
                                                                    (Go CRM)
                                                                          │
                                                                          ▼
                                                                    STAGE 7
                                                                    DAILY USE
                                                                    (Go CRM)
```

## 3.2 Stages 0–2 — discovery, claim, proof of control

```
┌─ BROWSER ──────────────┐  ┌─ SUPABASE ───────────────────────────────────────┐
│                        │  │                                                   │
│ 1. Charity lands on    │  │  organizations: 29,000 rows, status='listed'      │
│    ngoreality.com,     │──►│  anon SELECT allowed on listed/verified/active   │
│    searches directory  │  │                                                   │
│                        │  │                                                   │
│ 2. "This is us" →      │  │  auth.users INSERT                                │
│    signUp(email, pw) ──┼──►│    └─trigger on_auth_user_created                │
│                        │  │        └─ handle_new_user() → profiles row        │
│                        │  │                                                   │
│    ⚠ If "Confirm email"│  │  NO SESSION YET → org is never created            │
│      is ON, the flow   │  │  (BLOCKER 6 — see §4)                             │
│      DEAD-ENDS here    │  │                                                   │
│                        │  │                                                   │
│ 3. Confirm email,      │  │                                                   │
│    log in, land on     │  │                                                   │
│    NgoOnboardingPage,  │  │                                                   │
│    re-run the form     │  │                                                   │
│                        │  │                                                   │
│ 4. linkExistingOrg() ──┼──►│  organization_members INSERT role='owner'        │
│    (src/lib/           │  │    ├─ RLS 029:112 "Users can claim a never-       │
│     ngoSignup.ts:108)  │  │    │   claimed organization"                      │
│                        │  │    │   WITH CHECK user_id=auth.uid()              │
│                        │  │    │     AND role='owner'                         │
│                        │  │    │     AND organization_is_claimable(org)       │
│                        │  │    │       = claimed_at IS NULL AND no members    │
│                        │  │    │                                              │
│                        │  │    └─ trigger on_organization_member_added        │
│                        │  │         └─ mark_organization_claimed()            │
│                        │  │              → organizations.claimed_at = now()   │
│                        │  │                                                   │
│                        │  │  status: 'listed' ──────────────► 'onboarding'    │
│                        │  │  onboarding_stage = 'intake'                      │
│                        │  │  verification_criteria: 11 DEFAULT_CRITERIA rows  │
│                        │  │  activity_log: 'ngo_claim'                        │
│                        │  │  → notify_staff_ngo_portal_event → staff_tasks    │
└────────────────────────┘  └───────────────────────────────────────────────────┘
```

**⚠ There is no proof of control in this flow, and it must be added.** The email-match guard at `src/lib/ngoSignup.ts:132-139` is **client-side only** — no DB policy references `organizations.email`. Any authenticated user can `POST` directly to PostgREST:

```
supabase.from('organization_members')
        .insert({organization_id: <any never-claimed org>, user_id: self, role: 'owner'})
```

and become owner of any of ~29,000 listed charities. `claimed_at` is a **first-come lock, not an identity check**. And migration 021 deliberately exposes the whole directory including `email` and `phone` to any authenticated user, so the attacker can even see which address would have satisfied the client-side guard.

**Stage 2 must exist and must be enforced in SQL.** The correct design, in order of preference:

1. **Emailed token to the registry-listed address.** `POST /v1/claim/start {organization_id}` → server generates a token, emails it to `organizations.email` (the address that came from the Charities Register import, which the claimant does not control), stores the hash. `POST /v1/claim/verify {token}` → SECURITY DEFINER function inserts the `organization_members` row. Then **drop the direct-insert policy entirely** — the only path becomes the RPC. This is the version to build.
2. Fallback where `organizations.email` is blank: DNS TXT record on the charity's `website_url` domain, or staff manual verification with a phone call. Both are already-existing staff workflows.

Until Stage 2 exists, opening self-serve signup means publishing a land-grab on 29,000 charities.

## 3.3 Stages 3–5 — standards, payment, badge (the target state)

```
┌─ NGO BROWSER ─┐  ┌─ SUPABASE ────────────────┐  ┌─ STRIPE ──┐  ┌─ GO WORKER ─┐
│               │  │                            │  │           │  │             │
│ 5. Standards  │  │ verification_criteria      │  │           │  │ SyncMonitors│
│    page       │◄─┤ 6 public + 5 member rows   │  │           │  │ every 15min │
│    (read-only)│  │                            │  │           │  │      │      │
│               │  │ ◄──── AUTOMATED (Phase 3)  │  │           │  │      ▼      │
│               │  │  website_functional  ◄─────┼──┼───────────┼──┤ last_status │
│               │  │  legal_pages         ◄─────┼──┼───────────┼──┤ HTML probe  │
│               │  │  mobile_responsive   ◄─────┼──┼───────────┼──┤ viewport    │
│               │  │                            │  │           │  │             │
│               │  │ ◄──── HUMAN (staff CRM)    │  │           │  │             │
│               │  │  mission_clear             │  │           │  │             │
│               │  │  contact_accessible        │  │           │  │             │
│               │  │  communication_clear       │  │           │  │             │
│               │  │                            │  │           │  │             │
│ 6. "Request   │  │ badge_requests INSERT      │  │           │  │             │
│    badge" ────┼─►│   └─trigger handle_badge_  │  │           │  │             │
│               │  │      request_insert (026)  │  │           │  │             │
│               │  │      ├─ ensure NGR- ref    │  │           │  │             │
│               │  │      ├─ organization_      │  │           │  │             │
│               │  │      │  payments: PENDING  │  │           │  │             │
│               │  │      │  7000 NZD           │  │           │  │             │
│               │  │      ├─ portal_notif staff │  │           │  │             │
│               │  │      ├─ portal_notif ngo   │  │           │  │             │
│               │  │      └─ notification_events│  │           │  │             │
│               │  │         (email, PENDING)───┼──┼───────────┼─►│ ProcessPend │
│               │  │                            │  │           │  │ → Resend    │
│ 7. "Pay now" ─┼──┼────────────────────────────┼─►│ Checkout  │  │             │
│               │  │                            │  │ Session   │  │             │
│    redirect ◄─┼──┼────────────────────────────┼──┤ (hosted)  │  │             │
│               │  │                            │  │           │  │             │
│    card entry ┼──┼────────────────────────────┼─►│ PAN never │  │             │
│    on Stripe  │  │                            │  │ touches   │  │             │
│               │  │                            │  │ your infra│  │             │
│               │  │  Edge Fn stripe-webhook ◄──┼──┤ checkout. │  │             │
│               │  │   verify HMAC              │  │ session.  │  │             │
│               │  │   UPDATE organization_     │  │ completed │  │             │
│               │  │   payments SET status=paid,│  │           │  │             │
│               │  │     paid_at, period_start, │  │           │  │             │
│               │  │     period_end = +1yr      │  │           │  │             │
│               │  │   WHERE stripe_invoice_id  │  │           │  │             │
│               │  │     = $1   (idempotent)    │  │           │  │             │
│               │  │        │                   │  │           │  │             │
│               │  │        ▼ TRIGGER (Phase 3) │  │           │  │             │
│               │  │  activate_membership()     │  │           │  │             │
│               │  │   ├─ organization_         │  │           │  │             │
│               │  │   │  memberships +1yr      │  │           │  │             │
│               │  │   ├─ organizations.status  │  │           │  │             │
│               │  │   │  = 'verified'          │  │           │  │             │
│               │  │   ├─ IF all 6 public pass: │  │           │  │             │
│               │  │   │    verification_badges │  │           │  │             │
│               │  │   │    REAL-2026-NNN       │  │           │  │             │
│               │  │   └─ notification_events ──┼──┼───────────┼─►│ Resend      │
│ 8. Badge live ◄──┤       badge_issued         │  │           │  │             │
│    on public  │  │       membership_welcome   │  │           │  │ tier →      │
│    directory  │  │                            │  │           │  │ paid_live   │
└───────────────┘  └────────────────────────────┘  └───────────┘  │ 60 min      │
                                                                   └─────────────┘
```

**Three things to notice about this diagram versus today.**

The activation chain currently lives in the **browser**, in `src/lib/membershipBenefits.ts:145-235`, and runs only when a **staff user** clicks a button. In the target it is a Postgres trigger on `organization_payments`, so activation is atomic with payment and cannot depend on who is logged in. That single move removes four of the eight manual steps.

The `pending` row created by the 026 trigger must be **UPDATEd**, not shadowed. Today `src/lib/payments.ts:77-95` always INSERTs a fresh row, so the stale `pending` row lives forever — which is why `NgoMembershipPage.tsx:104-113` shows "Payment awaiting confirmation" permanently *even after the membership is active*, and why the `026:78-86` idempotency guard then thinks a second badge request already has a payment and skips the placeholder.

The badge ID is generated **client-side from a count** (`membershipBenefits.ts:111-116`: `REAL-<year>-<count+1>`) against a `UNIQUE` column (`001:147`). Two concurrent issues collide. Moving it into the trigger and deriving it from a Postgres sequence fixes it for free.

## 3.4 Stage 6 — workspace provisioning, and the exact system boundary

```
NGO BROWSER              GO CRM (Railway)                 SUPABASE
     │                        │                               │
     │ POST /v1/signup        │                               │
     │ Bearer <supabase JWT>  │                               │
     │ {organization_id}      │                               │
     ├───────────────────────►│                               │
     │                        │ 1. auth.Verify(token)         │
     │                        │    ES256 vs cached JWKS ──────┤ (JWKS only,
     │                        │    → claims.Subject           │  no data)
     │                        │                               │
     │                        │ 2. OrganizationRole(          │
     │                        │      token, ⚠SUBJECT⚠, orgID) │
     │                        ├──────────────────────────────►│ PostgREST
     │                        │  GET /rest/v1/organization_   │ with the USER'S
     │                        │  members?organization_id=eq.X │ token → RLS
     │                        │  &user_id=eq.<subject>        │ decides
     │                        │◄──────────────────────────────┤
     │                        │  ⚠ THE user_id FILTER IS      │
     │                        │    MISSING TODAY (§1.6a)      │
     │                        │                               │
     │                        │ 3. role must be owner|admin   │
     │                        │                               │
     │                        │ 4. Provision():               │
     │                        │    INSERT platform.tenants    │
     │                        │      status='provisioning'    │
     │                        │    CREATE SCHEMA tenant_<x>   │
     │                        │    migrate 0001_core.sql      │
     │                        │      → 11 tables, 33 indexes  │
     │                        │    INSERT tenant_users        │
     │                        │      user_id = claims.Subject │
     │                        │      role = 'owner'           │
     │                        │    UPDATE status='active'     │
     │                        │    ⚠ NOT TRANSACTIONAL — a    │
     │                        │      mid-step failure strands │
     │                        │      the row at 'provisioning'│
     │                        │      and retry returns 409    │
     │◄───────────────────────┤                               │
     │  201 {tenant, role}    │                               │
     │                        │                               │
     │ ══════ FROM HERE ON, SUPABASE IS NOT IN THE PATH ══════│
     │                        │                               │
     │ GET /v1/clients        │ resolve seat from             │
     ├───────────────────────►│ platform.tenant_users         │
     │                        │ WHERE user_id = claims.Subject│
     │                        │                               │
     │                        │ Acquire(tenant):              │
     │                        │   BEGIN                       │
     │                        │   SET LOCAL search_path =     │
     │                        │     tenant_<x>, pg_catalog    │
     │                        │   SELECT ... FROM clients     │
     │                        │   INSERT INTO audit_log ...   │
     │                        │   COMMIT                      │
     │◄───────────────────────┤                               │
```

**The boundary, stated so it cannot be misread:** Supabase is consulted **twice per user per organisation, ever** — once to verify the token signature (and then only the JWKS, which is public), and once at provision to answer "may this person create a workspace?". After that, beneficiary data flows entirely between the browser and the Railway service. Supabase does not know a client record exists. It cannot: it has no credential for that database and no network path to it.

## 3.5 Every state transition and its owner

| Entity | Transition | Trigger | System that owns it |
|---|---|---|---|
| `auth.users` | ∅ → exists | `signUp` | **Supabase** (GoTrue) |
| `organizations.status` | `listed` → `onboarding` | claim/link | **Supabase** (`ngoSignup.ts`, → trigger in Phase 2) |
| `organizations.claimed_at` | NULL → now() | first membership row | **Supabase** (trigger `mark_organization_claimed`, 029) |
| `organizations.status` | `onboarding` → `verified` | all 6 public criteria pass | **Supabase** (browser today, trigger in Phase 3) |
| `verification_criteria.status` | `pending` → `pass`/`fail` | staff toggle; **worker** in Phase 3 | **Supabase** (staff RLS `028:49`) |
| `badge_requests` | ∅ → `pending` | NGO clicks Request | **Supabase** (RLS `006:169`) |
| `organization_payments` | ∅ → `pending` | badge-request trigger | **Supabase** (`026:87-107`) |
| `organization_payments` | `pending` → `paid` | **Stripe webhook** | **Supabase** ← written by Edge Function |
| `organization_memberships` | ∅ → `active`, or +1yr | payment paid | **Supabase** (browser today → trigger Phase 3) |
| `organization_memberships` | `active` → `pending_renewal` | NGO submits renewal request | **Supabase** (`useNgoPortal.ts:130-136`) |
| `verification_badges` | ∅ → `is_active` | membership active **AND** all 6 public pass | **Supabase** |
| `website_monitors.tier` | `passive`/`active` → `paid_live` | `has_active_membership()` true | **Go worker** (`store.go:75-113`), recomputed every 15 min |
| `website_monitors.last_status` | `up` ⇄ `down` | 2 consecutive failures | **Go worker** (`store.go:181-277`) |
| `notification_events` | `pending` → `sent` | `ProcessPending` → Resend | **Go worker** (`notify/notifier.go:33-65`) |
| `platform.tenants` | ∅ → `provisioning` → `active` | `POST /v1/signup` | **Go CRM** |
| `platform.tenants.status` | `active` → `suspended` | **final failed payment** | **Go CRM**, ← Stripe webhook via `PATCH /v1/admin/tenants/{id}` — **transition does not exist today** |
| `platform.tenants.seats_purchased` | n → n+1 | Stripe subscription quantity change | **Go CRM**, ← webhook — **does not exist today** |
| `platform.tenant_users.status` | `invited` → `active` | invite accepted | **Go CRM** |
| `platform.tenant_users.status` | `active` → `disabled` | seat revoked, **or** upstream user deleted | **Go CRM** (revoke exists; reconciliation does not) |
| `tenant_<x>.clients` etc. | all | caseworker action | **Go CRM only** — never leaves |

---

# 4. What exists vs what is missing

| Capability | Current state | What is missing | Where it lives |
|---|---|---|---|
| **Identity** | | | |
| User accounts, sessions, JWT issuance | ✅ Works | Nothing | Supabase Auth |
| ES256 JWKS verification in Go | ✅ Works, well built. Alg-confusion check is correct | Singleflight on refresh; key union on rotation; `aud` array support; mandatory `exp`/`aud`/`iss`; RS256 fallback | `backend/internal/crm/auth/jwt.go`, `jwks.go` |
| Cross-system membership check | ❌ **BROKEN — takeover live** | `&user_id=eq.<subject>`; assert returned `organization_id`; drop policy 021 | `backend/internal/crm/supabase/supabase.go:52-56`; migration 021 line 15 |
| Tenant seat resolution (steady state) | ✅ Correct — local, no Supabase dependency | Nothing | `platform.tenant_users` |
| CRM session token (Supabase off hot path) | ❌ Not built | Mint 24h CRM JWT after first verify | new `POST /v1/session/exchange` |
| Upstream-delete reconciliation | ❌ Not built. Seats orphan forever, keep billing | Nightly job comparing `tenant_users.user_id` to `auth.users` | `cmd/worker` |
| Invite email verification | ❌ Binds to unverified `claims.Email` | Require `email_verified`; bind to `user_id` | `backend/internal/crm/tenant/seats.go` |
| **Claim / trust** | | | |
| Directory search over 29k registry | ✅ Works — 300ms debounce, wildcard stripping | Nothing functional | `src/hooks/useOrganizationClaimSearch.ts` |
| Claim lock (first-claim-wins) | ✅ Enforced in SQL via `claimed_at` + `organization_is_claimable` | Nothing | migration 029 |
| **Proof of control** over a claimed charity | ❌ **NONE.** Email guard is client-side only; direct PostgREST insert bypasses it | Emailed-token RPC to the registry address; drop the direct INSERT policy | `src/lib/ngoSignup.ts:132-139` (client) — no server equivalent |
| Signup with email confirmation ON | ❌ **Dead-ends.** No session after `signUp` → org, membership, criteria, contact, staff notification all skipped | Persist form state; document the resume path; or defer org creation to a post-confirm hook | `NgoOrganizationRegistrationForm.tsx:123-130` |
| Signup transactionality | ❌ No transaction — failure after step 1 leaves an orphan org squatting its slug | Wrap steps 1–5 in a SECURITY DEFINER RPC | `src/lib/ngoSignup.ts:43-91` |
| Bot protection | ❌ **No-op by default.** `turnstile.ts:5` returns `true` when `VITE_MONITOR_API_URL` unset; `/v1/turnstile/verify` returns `{success:true}` when the secret is empty | Fail closed on both sides; set the env | `src/lib/turnstile.ts:5`, `backend/cmd/api/main.go:109-112` |
| **Standards** | | | |
| 11 criteria defined, stored, displayed | ✅ Works | Nothing | `src/types/index.ts:337-436` |
| Automated evaluation | ❌ **ZERO.** All 6 public criteria are human toggles | Derive `website_functional` from `website_monitors.last_status` (data already collected); add HTML probes for `legal_pages`, `mobile_responsive` | `src/pages/crm/OrganizationDetail.tsx:113-165`; `backend/internal/monitor/checker.go` |
| Auto-verify on all-pass | ✅ Works (does not issue badge — correct) | Nothing | `src/lib/verification.ts:41-82` |
| Score display | ⚠️ `FINANCIAL_CRITERIA` omits `criterion_tier`, defaults to `'public'`, silently dilutes the percentage NGOs see | Add `criterion_tier: 'financial'` | `src/types/index.ts:438-445` vs `criteria.ts:27-31` |
| **Money** | | | |
| NGR- payment reference | ✅ Works. TS and SQL implementations verified identical; unique partial index | Nothing | `src/lib/payments.ts:12-14`, `026:45`, `015:11-13` |
| Payment ledger table | ✅ Exists, RLS correct (staff ALL + member SELECT) | `stripe_invoice_id` / `stripe_payment_intent_id` + unique index for webhook idempotency | `organization_payments` (015, 018, 026) |
| Pending row on badge request | ⚠️ Created, **never resolved** — shows "awaiting confirmation" forever | Webhook must UPDATE it, not INSERT alongside | `026:87-107` vs `payments.ts:77-95` |
| **Checkout / card collection** | ❌ **DOES NOT EXIST.** No `supabase/functions/` dir, no Stripe dep in `package.json`, no webhook route, no checkout call anywhere | Everything | — |
| Bank transfer details shown to NGO | ❌ **Blank by default.** `VITE_BANK_ACCOUNT_NUMBER` defaults to `''` → NGO sees "Bank account details are being finalised" | Set the env vars — **this alone means there is currently no way to pay at all** | `src/config/billing.ts:10`; `NgoBillingTopUpPanel.tsx:96-99` |
| "Coming soon" Stripe/Airwallet copy | ⚠️ `STRIPE_CHECKOUT_AVAILABLE` / `AIRWALLET_AVAILABLE` gate **copy strings only**; nothing consumes them | Real integration | `src/config/billing.ts:14-21` |
| Payment → membership activation | ❌ **Manual.** One staff button, in the browser, behind `is_staff_user()` | Postgres trigger on `organization_payments` | `src/components/crm/OrganizationPayments.tsx:52-58` → `membershipBenefits.ts:145-235` |
| Price consistency | ❌ **Defined three times** — `pricing.ts:4`, hardcoded `7000` at `026:100`, literal `"NZD $70.00"` at `026:143` and `notifications.ts:80` | Single source; interpolate into email copy | — |
| GST handling / "+ GST" pricing | ❌ Not present anywhere | Reprice; add GST line to all invoicing | pricing pages, terms |
| Tax invoice (s 19E TSI) generation | ❌ Not built | Invoice generation with correct band fields; charity legal name; GST number capture | — |
| Supply correction info (s 19N) | ❌ Not built | Credit-note path for refunds/proration | — |
| Workspace SaaS billing | ❌ Not built. Prices exist in config only | Subscription, seat-quantity sync, `PATCH /v1/admin/tenants/{id}` | `src/config/customerProducts.ts:11-13` |
| $650 one-off billing | ❌ Not built. Price exists in config only | Stripe Invoice or Checkout `payment` mode | `src/config/customerProducts.ts:17` |
| Suspension on non-payment | ❌ **State exists with no transition into it.** `suspended` is accepted by the CHECK, rejected by `Acquire`, and never set by anything | Webhook → `PATCH /v1/admin/tenants/{id}` | `platform.tenants.status` |
| **Membership integrity** | | | |
| NGO self-granting free membership | ❌ **LIVE.** `"Members can insert membership for own org"` (006:152) was never dropped by 027/028/029 — verified. An owner can insert `{status:'active', expires_at:'2099-01-01'}`, making `has_active_membership()` true | Drop the policy | migration `006:152-155` |
| **Email** | | | |
| In-app notifications | ✅ Works, DB triggers, survives worker downtime | Nothing | `portal_notifications` (023) |
| Outbound email queue | ⚠️ Rows enqueue correctly from three producers | **Nothing sends them** | `notification_events` (018, 026) |
| Email sender | ❌ **Not deployed, not scheduled.** Neither `docker-compose.yml` nor `.github/workflows/ci.yml` runs `cmd/worker`; CI only vets/tests/builds | Railway service + schedule; `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `API_KEY` | `backend/cmd/worker/main.go` |
| Silent-failure surface | ❌ Three compounding: `resend.Enabled()` false → `ProcessPending` returns success with `err==nil`; `authorize` returns `true` when `API_KEY` empty; `queueAndTrySend`'s `flushError` is discarded by its only caller | Return errors; fail closed; surface the flush error | `notifier.go:35-38`, `api/main.go:156-158`, `membershipBenefits.ts:190-202` |
| **Monitoring** | | | |
| Website checks, incidents, tiering | ✅ Well built — threshold-based, `FOR UPDATE` locking, incident open/close | Deploy it | `backend/internal/monitor/`, `store.go:75-277` |
| Monitor row creation | ⚠️ `website_monitors` has **no INSERT policy for anyone**; `syncMonitorTierForOrg` UPDATEs 0 rows until the worker has run `SyncMonitors` once | Worker deployment resolves this | `009:62-71` vs `membershipBenefits.ts:52-86` |
| Re-enabling a disabled monitor | ❌ `ON CONFLICT DO UPDATE` never restores `enabled=true` — a dark monitor stays dark through any tier upgrade | Add `enabled = true` to the update | `store.go:100-107` |
| **Workspace / CRM** | | | |
| Tenant provisioning, schema-per-tenant, migrations | ✅ Built and thoughtful | Advisory lock; per-tenant `schema_migrations` **inside** the schema; parallel fan-out; **fail** the deploy instead of "skip and continue"; move off boot | `backend/internal/crm/tenant/tenant.go:251-307`, `cmd/crm/main.go:81-93` |
| Clients / cases / notes / sessions / consents API | ✅ Built, ~30 endpoints, role-gated writes | Nothing functional | `backend/internal/crm/httpapi/server.go:73-107` |
| Tenant isolation | ⚠️ **A naming convention, not a privilege.** Single Postgres role owns every schema; `search_path` grants nothing. One schema-qualified name escapes silently. `pg_temp` outranks the tenant schema | `CREATE ROLE tenant_<x> NOLOGIN` in `Provision`; `SET LOCAL ROLE` in `Acquire`; reorder to `pg_catalog, tenant_<x>` | `tenant.go:437-463` |
| Team seats / invites | ⚠️ **Dead on arrival.** `seats_purchased` DEFAULT 1; `CreateInvite` rejects when `active+pending >= purchased`; every workspace has exactly 1 active seat (the owner); nothing increments it. **The first invite in every workspace returns 402** | Billing-driven seat count (§2.3) | `platform/0001_control_plane.sql:18` + `tenant/seats.go:158-210` |
| Isolation tests | ❌ `tenant_test.go` covers only `ValidSchemaName` and `Slugify`. **No test touches `Acquire`.** Flipping `set_config(...,true)` → `false` leaks tenant state across a pooled connection and CI stays green | Two-tenant integration test at `MaxConns=1`; RLS regression suite | `tests/isolation/crossTenant.mjs` |
| Duplicate `workspace_*` implementation in Supabase | ❌ 10 tables + RLS in the public cluster, zero frontend references, empty | **Drop them.** Fix the now-false comment in `src/config/features.ts:12-14` | migration 027 |
| Provisioning repair | ❌ A failure mid-`Provision` strands `status='provisioning'`; `ByOrganization` finds it, retry returns `ErrExists` → 409 "ask an administrator" for a workspace that does not exist | Retry from `provisioning`; admin repair endpoint | `tenant.go:193-232` |
| Schema naming | ⚠️ `Slugify("Te Whānau Trust")` → `tenant_te_wh_nau_trust`, permanently, in every backup and log line. Charities rename and merge constantly | `t_<uuid-hex>`. **Change before tenant #1** | `tenant.go` |

**The honest summary:** stages 0–4 (signup, claim, standards display, badge request) are genuinely automated end to end. **Stages 5–8 (payment, activation, badge issuance, every email) each require a human, and one of them requires a human who does not exist yet** — because the email worker is not deployed at all. A real NGO can sign up today, get a correct `NGR-` reference, and then hit a wall with no bank account number on screen.

---

# 5. Implementation plan

Sequenced so revenue arrives at the end of Phase 3, roughly two to three weeks in, without shipping a known-exploitable system.

## Phase 0 — Close the doors (1 day). **Blocks everything.**

**Goal:** make it safe for a stranger to create an account.

| Deliverable | File / service |
|---|---|
| `user_id` filter in the membership lookup; assert returned `organization_id`; drop `limit=1`-as-authorization | `backend/internal/crm/supabase/supabase.go:52-56`; signature becomes `OrganizationRole(ctx, token, userID, orgID)`; caller `httpapi/signup.go` |
| Migration `031`: drop policy `"Authenticated can read members on directory orgs for claim guard"`; replace the claim guard with `public.organization_is_claimable(uuid)` (already exists and already granted in 030) | new `supabase/migrations/..._031_narrow_member_read.sql` |
| Same migration: drop `"Members can insert membership for own org"` (`006:152-155`) — free-membership self-grant | `031` |
| Same migration: revoke the client-side-only claim path — make `organization_members` INSERT require a SECURITY DEFINER RPC (prep for Phase 2) | `031` |
| Turnstile fails **closed** on both sides | `src/lib/turnstile.ts:5`; `backend/cmd/api/main.go:109-112` |
| `authorize` fails closed when `API_KEY` is empty | `backend/cmd/api/main.go:156-158` |

**Verification:** extend `tests/isolation/crossTenant.mjs` with three cases, all run in CI: (1) an authenticated non-member gets **zero rows** from `organization_members` for a `listed` org; (2) `POST /v1/signup` with someone else's `organization_id` returns **403**; (3) a direct PostgREST insert into `organization_memberships` for one's own org returns **403**. Manually confirm against the live project with two throwaway accounts before merging.

## Phase 1 — Deploy the pipe (1–2 days). **Blocks taking money.**

**Goal:** an email can actually leave the system. You cannot charge someone if you cannot send them a receipt.

| Deliverable | File / service |
|---|---|
| Deploy `backend/cmd/worker` as a Railway service in the same project as the CRM | Railway |
| Set `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `API_KEY`, `DATABASE_URL`, `MONITOR_STATUSES` | Railway env |
| Schedule it — either the built-in 15-min loop as a long-running service, or a Railway cron hitting `POST /v1/notifications/process` | Railway |
| `ProcessPending` returns an **error** when Resend is unconfigured instead of `{0,0,0}, nil` | `backend/internal/notify/notifier.go:35-38` |
| `activateMembershipBenefits` surfaces `flushError` instead of discarding it | `src/lib/membershipBenefits.ts:190-202` |
| `SyncMonitors` restores `enabled = true` on conflict update | `backend/internal/store/store.go:100-107` |
| Set `VITE_BANK_ACCOUNT_NAME` / `_NUMBER` / `VITE_BANK_NAME` — **today, regardless of Stripe.** This alone makes the product payable | Vercel env; `src/config/billing.ts:8-12` |

**Verification:** submit a badge request from a test NGO account. Within 15 minutes a `badge_request_received` email arrives at the org address, `notification_events.status = 'sent'`, `sent_at` is populated, and `website_monitors` has a row for that org with a non-null `last_checked_at`.

## Phase 2 — Prove control (2 days). **Blocks self-serve signup.**

**Goal:** a charity claiming its listing must prove it controls the registry-listed address.

| Deliverable | File / service |
|---|---|
| `claim_tokens` table: `organization_id`, `token_hash`, `email`, `expires_at`, `consumed_at` | migration `032` |
| RPC `request_organization_claim(uuid)` — SECURITY DEFINER, generates a token, enqueues a `notification_events` row to `organizations.email`, returns nothing to the caller | `032` |
| RPC `complete_organization_claim(text)` — validates the token, inserts the `organization_members` row, sets `claimed_at` | `032` |
| Direct INSERT on `organization_members` revoked from `authenticated`; the RPC is the only path | `032` |
| UI: two-step claim replacing the current one-shot form | `src/components/ngo/NgoOrganizationRegistrationForm.tsx`, `src/lib/ngoSignup.ts` |
| Fix the email-confirmation dead-end: persist form state across the confirm round-trip, or move org creation into a post-confirm hook | `NgoOrganizationRegistrationForm.tsx:123-130` |
| Wrap `provisionNgoOrganization` steps 1–5 in a single SECURITY DEFINER RPC — no more orphan orgs squatting slugs | `src/lib/ngoSignup.ts:43-91` → `032` |
| Staff fallback path for orgs with a blank registry email | staff CRM |

**Verification:** claiming an org whose `organizations.email` you do not control is impossible from the UI **and** from a raw PostgREST call. Claiming one you do control succeeds end to end without staff involvement. Signup with Supabase "Confirm email" **ON** completes without losing typed data.

## Phase 3 — First dollar (3–5 days). **Revenue starts here.**

**Goal:** a charity pays $70 with a card and the badge issues without anyone at NGOreality doing anything.

**Prerequisites that are not code** — do these in parallel, starting today, because they have lead time:
- NGOreality Ltd incorporated, IRD number, NZ business bank account. *(I could not confirm from the repo whether this exists. If it does not, it is the true critical path.)*
- Stripe account created and verified; confirm the four unverified facts in §2.2.
- Terms of service rewritten for the Fair Trading UCT regime (§2.7).
- **All pricing repriced "+ GST"** across the site, the config files and the email templates.

| Deliverable | File / service |
|---|---|
| Migration `033`: add `stripe_invoice_id`, `stripe_payment_intent_id` to `organization_payments` with a **unique index** (webhook idempotency); add `stripe_customer_id` to `organizations` | `033` |
| Migration `033`: single-source the price — `026:100`'s hardcoded `7000` reads from a `platform_pricing` table; email templates interpolate instead of hardcoding `"NZD $70.00"` | `033`, `src/lib/notifications.ts:80` |
| Migration `034`: **`activate_membership()` trigger** on `organization_payments AFTER INSERT OR UPDATE OF status` — ports `src/lib/membershipBenefits.ts:145-235` into SQL: extend membership, set `verified`, issue badge if all 6 public criteria pass (badge ID from a **sequence**, not a client-side count), enqueue `badge_issued` + `membership_welcome` | `034` |
| Delete the browser activation path; `recordPayment` becomes staff bank-transfer reconciliation only, and **UPDATEs** the pending row | `src/lib/payments.ts:77-95`, `src/lib/membershipBenefits.ts` |
| Edge Function `stripe-webhook`: verify HMAC, handle `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated/deleted`. Idempotent on `stripe_invoice_id` | `supabase/functions/stripe-webhook/index.ts` |
| Edge Function `create-checkout-session`: authenticated, resolves org from `organization_members`, creates/reuses the Stripe Customer, sets `client_reference_id = NGR-XXXXXXXX` | `supabase/functions/create-checkout-session/index.ts` |
| Wire the real button; delete the "coming soon" copy | `src/components/ngo/NgoBillingTopUpPanel.tsx:114-125` |
| s 19E TSI generation with correct band fields; s 19N credit notes for refunds | Stripe Invoicing config + template |
| Nightly reconciliation: Stripe invoices vs `organization_payments`, alert on divergence | `cmd/worker` |

**Verification:** in Stripe test mode, a test NGO pays $70 → `organization_payments` flips `pending` → `paid` with `period_end` = +1yr → `organization_memberships` row appears `active` → badge issues *if* the 6 criteria pass, or a clear "membership active, badge pending standards review" message if not → two emails arrive → `website_monitors.tier` becomes `paid_live` within 15 minutes. Then **replay the same webhook three times** and confirm exactly one payment row and one membership extension. Then go live and take one real $70.

## Phase 4 — Reduce the human cost (3–4 days)

**Goal:** the badge stops requiring six manual toggles per customer. This is the largest per-customer cost and it does not scale past a handful of NGOs.

| Deliverable | File / service |
|---|---|
| `website_functional` derived from `website_monitors.last_status` — **the data is already being collected and thrown away** | `backend/internal/monitor/checker.go`, new `store` method |
| `legal_pages` — probe for privacy/terms links in the fetched HTML | `checker.go` |
| `mobile_responsive` — check for a viewport meta tag and absence of fixed-width layout | `checker.go` |
| Worker writes these three to `verification_criteria` with `evaluated_at` and an `evaluated_by='system'` marker | new migration for the column |
| Human gate reduced from 6 to 3 judgement criteria: `mission_clear`, `contact_accessible`, `communication_clear` | staff CRM unchanged |
| Add `criterion_tier: 'financial'` to `FINANCIAL_CRITERIA` so it stops diluting the displayed score | `src/types/index.ts:438-445` |
| Reconcile the duplicate badge issuer that writes `level:'basic'` and skips the standards gate entirely | `src/pages/crm/OrganizationDetail.tsx:187-200` vs `membershipBenefits.ts:121-131` |

**Verification:** point the worker at ten real registry charities with live websites. All three automated criteria populate within one cycle and agree with a manual assessment on at least nine of ten. Time-to-badge for a paying member drops from "whenever staff get to it" to "one review pass".

## Phase 5 — Sell the workspace (4–5 days)

**Goal:** monthly recurring revenue, with seats that actually work.

| Deliverable | File / service |
|---|---|
| **New** `PATCH /v1/admin/tenants/{id}` accepting `{seats_purchased, plan, status}`, behind `adminOnly` | `backend/internal/crm/httpapi/server.go` (+ handler) |
| `seats_purchased` becomes a **Stripe-derived cache**; remove the DEFAULT 1 trap | `platform/0001_control_plane.sql:18` + new platform migration |
| `cmd/crm` calls Stripe on seat add/remove to update the subscription item quantity | `backend/internal/crm/tenant/seats.go` |
| Webhook handles `customer.subscription.updated` → `PATCH` the tenant; `invoice.payment_failed` final attempt → `status='suspended'` (**the missing transition**) | `supabase/functions/stripe-webhook/` |
| Stripe Billing Portal link in the workspace UI — satisfies symmetrical in-product cancellation | `src/pages/ngo/portal/` |
| Nightly reconciliation from §1.6f: disable seats whose `sub` no longer exists in `auth.users`; flag orphaned tenants whose org was deleted | `cmd/worker` |

**Verification:** invite a second user to a test workspace → Stripe quantity goes 0 → 1 on the seat price → next invoice is $40 → `seats_purchased` reads 2. **The first invite must succeed** (it fails with 402 today). Cancel the subscription → tenant goes `suspended` → `GET /v1/clients` returns 403, not 500, and the data is intact.

## Phase 6 — Make isolation a privilege, not a convention (3–4 days)

**Goal:** a wrong query becomes `permission denied`, not a data breach. **Cheap now at zero tenants; a fleet migration at 500.**

| Deliverable | File / service |
|---|---|
| `Provision` creates `ROLE tenant_<x> NOINHERIT NOLOGIN` + `GRANT USAGE ON SCHEMA` | `backend/internal/crm/tenant/tenant.go:193-232` |
| `Acquire` adds `SET LOCAL ROLE` alongside the search_path; reorder to `pg_catalog, tenant_<x>` (`pg_temp` currently outranks the tenant schema) | `tenant.go:437-463` |
| **Integration test:** two tenants, one pool, `MaxConns=1` — tenant B cannot see tenant A's row. This is the test that would catch a one-character `true`→`false` change today | `backend/internal/crm/tenant/tenant_test.go` |
| Schema names → `t_<uuid-hex>`. **Before tenant #1** | `tenant.go` `Slugify` usage |
| Tenant cap of **500** per cluster, hard error on N+1; implement `dedicated_dsn` routing (`map[dsn]*pgxpool.Pool`) — the column exists and **nothing reads it** | `tenant.go`, `Registry` |
| Migrations: advisory lock, per-tenant `schema_migrations` **inside** the schema, parallel fan-out, **fail the deploy** instead of "skip and continue", move off boot | `tenant.go:251-307`, `cmd/crm/main.go:81-93` |
| `statement_timeout` + `idle_in_transaction_session_timeout` via `poolCfg.AfterConnect` — `cfg.StatementTimeout` is currently a Go context deadline that never reaches Postgres | `cmd/crm/main.go`, `config.go:102` |
| Move read-auditing off the request transaction into a buffered async writer; keep write-audits synchronous | `backend/internal/crm/store/` |
| Drop the `workspace_*` tables; fix the now-false comment | migration `035`, `src/config/features.ts:12-14` |
| CI grep over `internal/crm/store/*.go` for `FROM \w+\.\w+` and `JOIN \w+\.\w+` as a stopgap | `.github/workflows/ci.yml` |

**Verification:** a deliberately schema-qualified cross-tenant query in a test returns `permission denied for schema`, not rows. `pg_dump -n t_<uuid>` succeeds for a single tenant. Boot with a deliberately drifted tenant schema fails the deploy loudly.

## Phase 7 — Donations. **Deferred, deliberately.**

Do not start this until Phases 0–5 are live **and** you hold written IRD confirmation or a binding ruling on platform-generated, charity-signed receipts (§6, R8). When you do: Stripe **Connect Standard**, charity as connected account and merchant of record, **direct charges**, settlement straight to the charity's bank account, your fee billed on your normal SaaS invoice. You are never in the flow of funds. Add Paymark Online EFTPOS as a supplementary rail for large one-off gifts once volume justifies it — the JWKS-verification code you already have for Supabase transfers almost directly to their `/worldlinejwks/OETransaction` endpoint.

## What blocks taking money — the explicit list

1. **The S1 takeover bug.** Opening signup with this live means publishing a takeover primitive against every charity that provisions a workspace. Phase 0.
2. **No checkout, and no bank account number on screen.** `VITE_BANK_ACCOUNT_NUMBER` defaults to `''`, so today an NGO literally cannot pay by any means. **Setting three env vars unblocks manual revenue this afternoon**, before any Stripe work.
3. **No email sender deployed.** You cannot invoice someone you cannot email. Phase 1.
4. **Legal entity, IRD number, NZ bank account, Stripe account.** Longest lead time, zero engineering. Start today.
5. **"+ GST" repricing and UCT-compliant terms.** No code, real exposure. Do before the first invoice, not after.

---

# 6. Risks and decisions, ranked

### R1 — Workspace takeover via unfiltered membership lookup
**Bites:** the day self-serve signup opens. Requires no special skill — a `curl` and a charity name.
**Consequence:** a stranger becomes owner of a charity's beneficiary records, including health data and case notes on vulnerable people. Notifiable privacy breach; 72-hour Privacy Commissioner clock; the end of the company's credibility in a sector where trust is the entire product.
**Mitigation:** §1.6a — three changes, one day.
**Decision:** **Do not open signup until this ships.** Not "prioritise it". A hard gate.

### R2 — Any NGO can grant itself a free active membership
**Bites:** the first technically curious NGO admin, or anyone who reads your public repo.
**Consequence:** `INSERT INTO organization_memberships {status:'active', expires_at:'2099-01-01'}` makes `has_active_membership()` true, which grants `paid_live` monitoring, down-alert emails, and satisfies every membership gate the product has. Direct revenue leakage on your primary product.
**Mitigation:** drop policy `006:152-155`. One line in migration `031`.
**Decision:** ship in Phase 0 alongside R1. Verified still present — 027, 028 and 029 all rewrote `organization_members` and left `organization_memberships` alone.

### R3 — Team seats are dead on arrival
**Bites:** the first invite in every workspace, day one of workspace sales.
**Consequence:** `seats_purchased` DEFAULT 1, owner occupies it, `CreateInvite` rejects at `active+pending >= purchased` → **402 no seats remaining** on the very first invite. The feature shipped in commit `82ccffd` cannot be used by anyone, and $15/seat is one of your three revenue lines.
**Mitigation:** make `seats_purchased` a Stripe-derived cache (Phase 5).
**Decision:** **do not paper over it by bumping the default to 3.** That decouples seats from billing permanently and you will never re-couple them. Fix it properly, as part of shipping workspace billing.

### R4 — No email ever leaves the system
**Bites:** the first paying customer, who receives no confirmation, no invoice, no badge notification.
**Consequence:** worse than the absence — three compounding silent successes. `resend.Enabled()` false makes `ProcessPending` return `{0,0,0}, nil`; the API answers **200**; the CRM shows "Send pending: success"; `queueAndTrySend`'s `flushError` is discarded by its only production caller. You will believe email is working when zero emails have ever been sent.
**Mitigation:** Phase 1 — deploy, schedule, configure, and make every one of those three paths return an error.
**Decision:** the silent-success paths are the real risk. Fix them even before the deployment, so you find out.

### R5 — Isolation is a naming convention
**Bites:** the first time a store query is schema-qualified. Could be week one; could be year three. There is no warning.
**Consequence:** the CRM connects as a single role that owns and has USAGE on every tenant schema. `search_path` decides only where *unqualified* names resolve — it grants and revokes nothing. One `FROM public.x`, one copy-pasted `tenant_other.clients`, and you are outside the boundary silently. The invariant is enforced by a **package comment**. Also: `pg_temp` is not on the path, so PostgreSQL searches it *first* for relations — a temp table named `clients` shadows the tenant's.
**Mitigation:** `SET LOCAL ROLE` + per-tenant `NOLOGIN` role. ~30 lines.
**Decision:** **Phase 6, and not later.** At zero tenants it is 30 lines. At 500 tenants it is a fleet migration you will schedule and then not do. The claim in `CRM_SAAS.md` that this design "keeps per-tenant backup/export/delete" is also only half-true — per-tenant *export* works (`pg_dump -n`), per-tenant *point-in-time restore* does not, because Railway's backup is a whole-cluster volume snapshot. Either build the nightly per-tenant dump loop or stop claiming the benefit.

### R6 — `aud` as a JSON array takes the whole CRM down
**Bites:** whenever Supabase ships a GoTrue release that emits `["authenticated"]`. Entirely outside your control. Zero warning.
**Consequence:** `jwt.go:34` declares `Audience string`; unmarshal fails; **every request 401s** with the message `"invalid token"`, chosen to be vague and therefore undiagnosable at 2am.
**Mitigation:** custom `UnmarshalJSON` accepting string-or-array; make `exp`/`aud`/`iss` mandatory rather than checked-only-if-present; add RS256 to the JWKS parser.
**Decision:** fold into Phase 0. It is twenty lines and it removes a landmine you cannot see coming.

### R7 — Schema-per-tenant has a hard ceiling around 500
**Bites:** at ~550 tenants **`pg_dump` fails** with `out of shared memory / increase max_locks_per_transaction`. Backups stop, and you find out from the failure, not a metric. Before that, at ~100–150, relcache growth in each pooled backend starts consuming memory nothing measures (~5KB per relation × 67 relations per tenant × every tenant every backend eventually touches, because `pgxpool` has no tenant affinity).
**Mitigation:** hard-refuse tenant N+1 at **500**; implement `dedicated_dsn` routing — the column exists in `0001_control_plane.sql:21` and **no code reads it**; cut `MaxConnLifetime` from 1 hour to 5–10 minutes (it is currently the only thing bounding relcache growth, by accident).
**Decision:** ~40 lines now, a fleet migration in two years. Phase 6. Also set `default_query_exec_mode=exec` in the DSN **before** any transaction-mode pooler appears, not after — the sibling service already does this (`internal/store/store.go:26`) and the CRM does not.

### R8 — Platform-issued donation receipts have no regulatory blessing
**Bites:** when a donor's tax credit claim is rejected, or IRD looks at your product.
**Consequence:** OS 22/04 [119]–[120] expressly permits gifts made *through* an online fundraising platform and says the claim is "determined by the receipt issued" — that part is settled. But **every mandated receipt element belongs to the charity**: its letterhead or stamp, its IRD number, its Charities Registration number, the name and signature of a person *it* authorised. IRD has published nothing expressly blessing platform-generated receipts issued as agent. A receipt in *your* name with *your* IRD number supports no claim at all unless you are a donee organisation.
**Mitigation:** get a **binding ruling** or written technical advice before switching receipting on. Paper an explicit written agency authority with each tenant (named signatory, designation, permission to apply their identifiers, their acknowledgement of accuracy and 7-year retention). Verify donee status against **IRD's published donee list**, not the Charities Register — they are separate registrations and they diverge, notably during deregistration. Store the verification date, re-verify annually, and turn receipting **off** for any tenant you cannot verify.
**Decision:** **this is the one item worth spending real money to de-risk, and donations do not ship until it is resolved.** It is also the reason Connect is Phase 7, not Phase 4. Issuing a "tax-deductible" receipt for a non-donee is the fastest route to a story that ends the company.

### R9 — GST crossing on GST-inclusive prices
**Bites:** the month your rolling 12-month supplies exceed $60,000.
**Consequence:** s 51(4)(b) deems you registered from the date you became liable. Output tax is extracted at 3/23 of what you actually collected — ~**$7,826** on $60,000 — out of margin, plus possible use-of-money interest and shortfall penalties. And retro-adding 15% to a "$70/year" promise may be a price rise you are not contractually entitled to make.
**Mitigation:** reprice as "+ GST" today. Track the **rolling** 12-month total monthly, not the financial-year figure. Register within 21 days of liability.
**Decision:** **highest value-per-minute action in this document, and it costs nothing.** Do it before you read section 6 again.

### R10 — Trust standards do not scale
**Bites:** around customer 20, when a founder is spending an hour per badge ticking six boxes.
**Consequence:** a fully-paid member sits at `"Membership active. Issue badge after all public standards pass."` until a human acts. This is the largest per-customer manual cost and it caps growth at whatever one person can review.
**Mitigation:** Phase 4 — automate three of six from data the worker **already collects and discards**.
**Decision:** do not attempt to automate all six. `mission_clear`, `contact_accessible` and `communication_clear` are judgement calls, and a human judgement call is arguably the *product* — it is what distinguishes a Reality Badge from a scraper. Automate the mechanical three, keep and market the human three.

### R11 — Records stored offshore without authorisation
**Bites:** an IRD review, or a customer's auditor asking where their donation records live.
**Consequence:** TAA s 22(2BA) and GST Act s 75(3BA) require taxpayer records to be kept **in New Zealand** absent Commissioner authorisation. Supabase is ap-southeast-2 (Sydney); Railway and Stripe are offshore.
**Mitigation:** apply under **SPS 21/02** for approval to store taxpayer electronic records offshore, or keep the authoritative accounting records under an NZ-resident arrangement.
**Decision:** **apply for the SPS 21/02 approval.** It is not just compliance — customers using an approved provider do not need their own s 22(2BA) authorisation, which makes "IRD-approved for offshore record storage" a genuine competitive moat against every offshore CRM chasing NZ charities. Start the application in Phase 3; it is paperwork with lead time, not engineering.

### R12 — Payment provider roadmap risk
**Bites:** if you build on Cuscal Paymark.
**Consequence:** two corporate owners in six years, an incomplete rebrand (the production JWKS path is still literally `/worldlinejwks/OETransaction`; the sandbox portal is still `portal.demo.worldline.co.nz`), a switch platform near end-of-life requiring ~A$21m of replacement spend targeted for 2030, and **no published post-acquisition API roadmap.** Combined with Click having no webhooks at all, this is a platform you would be building reconciliation infrastructure for, on an uncertain foundation.
**Mitigation:** Stripe.
**Decision:** **Stripe. Do not revisit this at launch.** Revisit only for Online EFTPOS as a supplementary large-one-off rail in year two, behind an internal payment abstraction so the decision stays reversible.

### R13 — The claim is first-come, with no identity check
**Bites:** the first person who reads the client-side guard and sends a raw PostgREST request.
**Consequence:** owner of any of ~29,000 listed charities. The email guard is TypeScript; no DB policy references `organizations.email`; `claimed_at` is a lock, not proof. Migration 021 helpfully exposes every charity's `email` and `phone` to any authenticated user.
**Mitigation:** Phase 2 — emailed token to the registry address, enforced in SQL.
**Decision:** **self-serve signup does not open without this.** It is the same failure class as R1 — authorising on an attribute you did not verify — and R1's fix does not cover it.

### R14 — Supabase outage becomes a CRM outage
**Bites:** during any GoTrue incident lasting longer than an access token's remaining life (~1 hour worst case).
**Consequence:** caseworkers locked out of beneficiary records for the duration, in a product whose pitch is that this data is *separate*. Stale JWKS keeps signature verification alive — good — but token *refresh* goes to Supabase.
**Mitigation:** mint a 24h CRM session token after the first successful verification. Supabase stays on the login path and comes off the request path, which also retires R6 and the two JWKS rotation bugs as availability risks.
**Decision:** Phase 6, but **design the header handling in Phase 0** so it is a swap and not a rewrite.

### R15 — Orphaned tenants and orphaned seats
**Bites:** the first charity that deletes its Supabase org, and the first user who deletes their account.
**Consequence:** deleting `organizations` cascades members and memberships. The tenant, its schema, and every beneficiary health record survive **orphaned, ownerless, and invisible to the staff CRM** — an IPP 9 retention breach, not untidiness. Separately, deleted users keep seats that count against `seats_purchased` and, from Phase 5, keep being billed.
**Mitigation:** nightly reconciliation in `cmd/worker` (§1.6f). Disable orphaned seats automatically; **flag** orphaned tenants for staff review.
**Decision:** **never auto-delete beneficiary data.** Flag it, alert a human, and make the retention decision deliberately — that is both the right privacy posture and the right operational one.

---

## The four things to do today

1. **Set `VITE_BANK_ACCOUNT_NAME`, `VITE_BANK_ACCOUNT_NUMBER`, `VITE_BANK_NAME`.** Right now an NGO who wants to pay you sees "Bank account details are being finalised". Three environment variables and manual revenue is unblocked this afternoon, weeks before Stripe.
2. **Reprice every page, config file and email template as "+ GST".** Free. Saves up to ~$7,826.
3. **Ship the `user_id` filter in `supabase.go` and migration `031`.** One day. Until it lands, do not link the signup page anywhere.
4. **Start the Stripe account and the SPS 21/02 application.** Both are paperwork with lead time and neither depends on any code.

---

**Summary.** The architecture is right: keep two databases, keep JWKS, keep Supabase as the sole identity provider. Take money with Stripe — and note the sharper framing, that all three launch products are your own revenue, so you need Stripe Billing now and Connect only when donations ship. The ledger of record stays in Supabase because every entitlement it buys is Supabase-resident, with a single writer (an Edge Function on the Stripe webhook) and a derived seat mirror in `platform.tenants`. Four things block revenue and only one is real engineering: three env vars, a deployed email worker, "+ GST" pricing, and a Stripe integration. Two things block *safety* and they come first — the `user_id` filter that closes the workspace takeover, and a real proof-of-control step on the claim. Everything in Phase 6 is cheap at zero tenants and expensive at five hundred; do it while it is still cheap.