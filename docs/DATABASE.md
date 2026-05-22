# Database (Supabase)

The app is a **SPA** that talks to **hosted Supabase** (Postgres + Auth). Schema changes live in `supabase/migrations/` and must be applied to the **remote** project before new UI features work.

**Project:** `cpbilbskfbzqlynjhdvm` (NGOreality, ap-southeast-2)

## After adding a migration locally

1. Apply to remote (pick one):
   - **Supabase MCP** (Cursor): `apply_migration` with the SQL file contents
   - **CLI** (if linked): `npx supabase db push`
   - **Dashboard**: SQL editor → paste migration SQL
2. Verify: `npm run db:verify` (needs `.env.local` with `VITE_SUPABASE_*`)
3. Hard-refresh the browser (PostgREST schema cache)

If you skip step 1, the app may show errors like:

`Could not find the table 'public.business_cashflow_lines' in the schema cache`

That is **not** a separate database — it means the linked Supabase project is behind the repo.

## Dev server vs database

| Error | Cause | Fix |
|-------|--------|-----|
| `GET http://localhost:5173/ net::ERR_CONNECTION_REFUSED` | Vite dev server not running | `npm run dev` in the repo root |
| Missing table / schema cache | Migration not applied remotely | Apply migrations (above) |

`npm run dev` serves the frontend only. `npm run dev:all` also starts the Go API for monitoring/email.
