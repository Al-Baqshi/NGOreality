# SHORTEXET — NGOreality session status

_Last updated: 2026-05-18_

## Where we are

Launch-focused build on **main** (uncommitted local changes). Core product direction: **NZ-first directory** + **Reality Badge** (digital trust) first; **financial transparency tier hidden** until NGOs are ready.

Supabase project ref: `cpbilbskfbzqlynjhdvm`

---

## Done (this arc)

### Registry & directory
- Migration `008_registry_listed_orgs.sql`: `listed` status, registry fields (`source_registry`, `external_id`, `registry_url`, charity #, NZBN, outreach).
- **~29,227 NZ charities** imported via `scripts/import-nz-charities.mjs` (`npm run import:nz-charities`).
- Public directory: default country **NZ**, **tags** (not categories), map **focus on NZ**, listed vs verified badges.
- Public org profile `/public/org/:slug`, contact prefill `?org=slug`.
- Staff CRM: listed orgs, outreach status, “Begin NGOreality verification”.

### Staff auth (in progress on branch files)
- `StaffProtectedRoute`, `StaffLogin`, profile helpers, CRM RLS migration `007_staff_crm_rls.sql` (not fully summarized in UI—verify applied on remote).

### Financial tier — hidden, not deleted
- `src/config/features.ts`: `FINANCIAL_VERIFICATION_ENABLED = false`
- `FinancialComingSoon` component; public + CRM UI gated.
- `FINANCIAL_CRITERIA` + types + DB support **kept** for later.
- **To enable tier 2:** set flag to `true` in `features.ts`.

### Launch narrative (product)
1. Directory lists orgs (registry **listed**).
2. Onboard → technical verification (website, security, privacy, accessibility) → **Reality Badge**.
3. Later → offer **Transparent Financial** to interested NGOs.

---

## Not done / verify next session

| Item | Action |
|------|--------|
| Tag backfill | **Done** (background task succeeded). Spot-check Directory → “All tags” filter in dev. |
| Migrations on remote | Ensure `007` + `008` applied (`npx supabase db push` or MCP). |
| Commit & push | Large uncommitted diff on `main`—commit when ready. |
| Staff login E2E | Test `/staff/login` + CRM routes with staff user in `profiles`. |
| `.env` | `SUPABASE_SERVICE_ROLE_KEY` for import scripts (see `.env.example`). |
| Vercel CLI | Not installed locally—optional for `vercel env pull` / deploy. |

---

## Key commands

```bash
# Import (needs service role in env)
npm run import:nz-charities
IMPORT_LIMIT=100 npm run import:nz-charities   # smoke test

# Tags for existing rows
npm run backfill:nz-tags

# Dev / build
npm run dev
npm run build

# DB
npx supabase@2.67.1 db push
```

---

## Key files (quick nav)

| Area | Path |
|------|------|
| Feature flag | `src/config/features.ts` |
| Coming soon UI | `src/components/FinancialComingSoon.tsx` |
| Listed org migration | `supabase/migrations/20260518120000_008_registry_listed_orgs.sql` |
| NZ import | `scripts/import-nz-charities.mjs` |
| Directory | `src/pages/public/Directory.tsx` |
| Reality Badge page | `src/pages/public/RealityBadge.tsx` |
| Org profile | `src/pages/public/OrganizationProfile.tsx` |
| CRM org detail | `src/pages/crm/OrganizationDetail.tsx` |

---

## SEO (canonical domain)

- Primary: **`https://ngoreality.com`** (`src/config/site.ts`, optional `VITE_SITE_URL`)
- `public/sitemap.xml` — homepage `/` is priority 1.0
- `vercel.json` — 301 from `www`, `.org` → `ngoreality.com`
- After deploy: [Google Search Console](https://search.google.com/search-console) → add property → submit `https://ngoreality.com/sitemap.xml` → request indexing for `/`

---

## Suggested next steps (priority)

1. **Smoke-test public flow:** Directory (NZ) → org profile → Contact with claim CTA.
2. **Confirm tags** in directory filters after backfill.
3. **Staff path:** login, open listed org, start verification workflow.
4. **Commit** logical chunks (registry/import, directory UX, financial flag, staff auth) if splitting PRs.
5. When first NGOs are verified, **keep financial flag off** until you pitch tier 2; then flip `FINANCIAL_VERIFICATION_ENABLED`.

---

## Notes

- Do not delete financial code—only the flag controls visibility.
- `transparent_financial` orgs in DB (if any) still show as **Verified** on public Verified page while flag is off.
