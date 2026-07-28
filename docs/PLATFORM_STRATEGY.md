# Platform strategy: Supabase, Railway, and the road to signup

_Written 2026-07-28. The question: should NGOreality move off Supabase onto
Railway, keep both, or something else — and what has to happen before real NGOs
can sign up for a badge or membership._

---

## 1. The answer: keep both. The split you have is correct.

Not as a compromise — because the two halves are **different kinds of data with
different blast radii**, and that difference is permanent.

| | Supabase | Railway (Go CRM) |
|---|---|---|
| **Holds** | Identity, the 29k registry, directory, badges, memberships, monitoring, blog | Beneficiary records: clients, cases, notes, service delivery |
| **Meant to be** | Read widely. The directory is the product. | Read by nobody outside one charity. Ever. |
| **Shape** | One shared schema, RLS | Schema-per-tenant |
| **If breached** | Embarrassing, public data mostly | Catastrophic — health, legal status, refuge addresses |
| **Changes** | Rarely, by you | Constantly, per customer |

**Why not move everything to Railway.** You would rebuild auth, password reset,
email verification, OAuth, storage, realtime, and the instant PostgREST API
that makes the directory nearly free to maintain. That is months of work
producing zero customer-visible value. Supabase Auth is genuinely good and it
is not your differentiator.

**Why not keep everything in Supabase.** Schema-per-tenant across thousands of
schemas fights Supabase's model — PostgREST exposes schemas, the pooler and
migration tooling assume one shared schema, and the dashboard becomes unusable
at 1,000 tenants. More importantly it would put beneficiary health data in the
same cluster, behind the same anon key, as a public directory. That is the one
mistake you cannot recover from.

### The rule to hold onto

> **Supabase is the public trust layer and the identity provider.
> Railway is the private tenant layer.
> They talk over HTTP with a verified token, never a shared database.**

That boundary is already built and already correct. Everything below protects it.

---

## 2. The 60-year view

Asked for an architect thinking in decades, here is what actually survives:

**What lasts:** Postgres. HTTP. SQL migrations in git. Plain CSV export. All
four are already how this is built. Postgres is 30 years old and will outlive
every vendor in this document.

**What must stay replaceable:** the vendors. Concretely —

| Component | Lock-in today | Escape hatch |
|---|---|---|
| Supabase Postgres | Low | It is plain Postgres; `pg_dump` and go |
| Supabase Auth | **The only real one** | Already mitigated: the CRM verifies tokens via standard **JWKS/OIDC**, so swapping to Keycloak, Zitadel or any OIDC provider means changing one URL, not rewriting auth |
| Railway | Low | A Dockerfile and a Postgres URL. Moves to Fly, Render or a VPS in an afternoon |
| Vercel | Low | It is a static bundle |
| PostgREST client calls | **Medium and growing** | Every `supabase.from('x')` in React is a hard dependency on Supabase's wire protocol. See §5. |

**The decision that ages worst** is not a database choice — it is putting
business logic in places you cannot version. Logic in RLS policies and database
triggers is invisible to code review, untestable in CI, and impossible to
reason about three years later. You already have some (`handle_badge_request_insert`,
badge issuance triggers). Migrate that toward the Go service over time.

**The decision that ages best** is the one already made: the tenant boundary is
a single function (`Registry.Acquire`) rather than a policy on every table. One
place to audit, one place to get right, forever.

---

## 3. The blocker: you cannot launch signup today

Supabase's own linter reports **1 ERROR and 66 WARNINGs**, of which 25 are
`rls_policy_always_true`. Verified directly against the live database:

```
verification_badges   "Anon CRM verification_badges"          anon           ALL
verification_badges   "Authenticated users can insert badges" authenticated  INSERT
verification_badges   "Authenticated users can update badges" authenticated  UPDATE
organizations         "Anon CRM write organizations"          anon           INSERT
organizations         "Anon CRM update organizations"         anon           UPDATE
verification_criteria "Anon CRM verification_criteria"        anon           ALL
contacts              "Anon CRM contacts"                     anon           ALL
activity_log          "Anon CRM activity_log"                 anon           ALL
```

The anon key ships inside every browser bundle. It is public by design.

**Therefore, right now, anyone on the internet can issue themselves a Reality
Badge, mark it verified, and edit any of the 29,000 charity records.**

The badge is the entire product. Its value is that it cannot be self-awarded.
Selling a $70/year membership whose central benefit anyone can forge in a
browser console is not a launch — it is a liability. The linter comment in
migration 006 says "replace with staff auth in production"; production arrived.

**Nothing else on this list matters until this is closed.**

---

## 4. The plan

### Phase 1 — Close the door (must precede any paid signup)

Migration `028_lock_down_public_write.sql`:

1. **Drop every `anon` write policy.** Keep exactly two anon reads, which the
   public directory genuinely needs: `Public can read directory organizations`
   and `Public can read active badges`.
2. **Drop every always-true `authenticated` write policy** on `organizations`,
   `verification_badges`, `verification_criteria`, `contacts`, `activity_log`,
   `blog_posts`.
3. **Replace with scoped policies:**
   - Staff (`is_staff_user()`) — full write on registry, criteria, badges, blog.
   - Members (`user_organization_ids()`) — write only their own organisation's
     profile fields. **Never** their own badge or criteria; self-verification is
     the thing being prevented.
   - `inquiry_submissions` — anon INSERT only, no read, no update.
4. **Fix the `SECURITY DEFINER` view** `business_plan_actuals` (the single ERROR).
5. **Regression test:** extend `tests/isolation/` with an anon client asserting
   it cannot insert a badge, edit an organisation, or read a contact.

**Risk:** the staff CRM currently relies on some of these open policies. Every
drop must land with its `is_staff_user()` replacement in the same migration, and
the staff CRM must be exercised on a Supabase branch before it touches
production. Use `create_branch` for this — do not test on live.

### Phase 2 — Make signup real (badge + membership)

The flow, end to end:

```
Public site
  └─ "Get verified" → /ngo/signup
       ├─ create account (Supabase Auth)
       ├─ claim your charity from the 29k registry   ← already built
       └─ organisation linked, member row created    ← already built
             │
             ▼
NGO portal /ngo
  ├─ Trust standards checklist (public criteria)     ← already built
  ├─ Request badge  → badge_requests row             ← already built
  │     └─ triggers: payment reference NGR-…,
  │        pending membership_annual payment,
  │        staff task, confirmation email            ← already built (026)
  ├─ Pay $70 by bank transfer with NGR- reference    ← manual, fine for cohort 1
  └─ Staff records payment → membership active,
     badge issued, monitoring upgraded to paid_live  ← already built
```

**Most of this exists.** What is missing is small:

| Gap | Work |
|---|---|
| Price mismatch: code says $70/yr, docs say $100 | Decide, then one constant |
| No public "start here" entry point | A single CTA on the homepage to `/ngo/signup` |
| Signup does not tell them what happens next or what it costs | Add price, timeline and "what we check" to the signup page |
| Payment confirmation is entirely manual | Fine for the first ~50 members. Revisit at volume |
| Resend sending domain unverified | Verify `ngoreality.com` in Resend, or emails silently fail |
| Supabase Auth redirect URLs not set for production | Add `https://www.ngoreality.com/**` or signup emails break |

### Phase 3 — Turn the workspace on

Two Vercel environment variables:

```
VITE_CRM_API_URL=https://crm-api-production-1b72.up.railway.app
VITE_WORKSPACE_ENABLED=true
```

Then one real end-to-end test: sign in as a genuine NGO user, press **Create
workspace**, add a client, add a case, write a note. Nothing so far has been
tested with a real Supabase user — only synthetic tokens.

**Also needed before a second person uses a workspace:** an invite flow. Today
only the creator gets a seat, and a colleague arriving second is told to ask an
administrator — but there is no screen for that administrator to invite them.
`POST /v1/admin/tenants/{id}/users` exists but needs an admin key, so it is not
self-serve yet.

### Phase 4 — Sell it

Workspace pricing ($25/mo + $15/seat) into `pricing.ts`, a "Record workspace
subscription" action in the staff CRM mirroring the membership one, and the
`workspace_active` unit wired into the existing cashflow model.

---

## 5. The one thing to change about how the frontend talks to data

Today React calls `supabase.from('organizations')` directly in ~30 modules.
That is fast to build and it is why the product exists — but it means Supabase's
wire protocol is baked into your UI, and every RLS policy is load-bearing for
correctness rather than just defence in depth.

Do not rewrite it now. But **stop adding to it**: new reads and writes that
carry real consequence — badge issuance, membership activation, payments —
should go through the Go service, which can be tested, logged and reasoned
about. The public directory can keep calling PostgREST directly forever; it is
read-only public data and that is exactly what PostgREST is for.

That is the migration path that does not require a migration: the risky half
moves to code you own, the safe half stays cheap.

---

## 6. Order of work

1. **Migration 028** — close public write access. Blocks everything.
2. **Anon regression tests** in CI, so it cannot silently reopen.
3. **Signup polish** — price, CTA, expectations, Resend domain, auth redirects.
4. **Flip the workspace on** and run one real end-to-end test.
5. **Workspace invites**, so a charity's second staff member can get in.
6. **Workspace billing.**

Items 1–3 are what stand between today and taking money for a badge.
