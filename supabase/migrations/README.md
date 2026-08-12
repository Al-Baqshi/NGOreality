# Migrations

## The rule

**The timestamp prefix is the version, and production's ledger is canonical.**
A file's name is `<version>_<label>.sql`, where `<version>` matches a row in
`supabase_migrations.schema_migrations` on the live project. Files sort by
version, and that order is the order they were actually applied.

Never renumber an applied migration. Never edit an applied migration's SQL —
add a new one.

## Why this README exists

Until 2026-08-12 the repository and production disagreed about *every* early
migration. Local files were numbered by hand (`20260514090135_001_…`) while
production had recorded the same work under CLI-generated timestamps
(`20260516102423_initial_schema`). Nothing in git matched the ledger, so
`supabase db push` would have re-applied the entire history against a live
database. A version collision had already taken the CRM offline once.

The A0 reconciliation fixed this by adopting production as the source of truth:

- 32 local files were renamed to the version production recorded them under.
- 7 migrations that existed only in production were recovered into git. They
  are marked `RESCUED FROM PRODUCTION` in their header.
- 2 migrations that existed only in git (`007_staff_crm_rls`,
  `027_workspace_case_management`) were recorded in the ledger without being
  re-executed, after verifying their effects were already present. 007 is not
  safe to re-run — it creates 7 policies that migration 028 later superseded.

Result: 49 files, 49 ledger rows, nothing pending in either direction.

## Two things that look wrong but are not

**The legacy `NNN_` numbers in labels repeat.** There are two `022_`, two
`023_` and three `034_` files. Those numbers are historical labels from the
hand-numbered era, not ordering. They are kept because the label half of each
filename matches the `name` column in the ledger, and breaking that
correspondence would cost more than the tidiness is worth. Order by the version
prefix; ignore the label number.

**`service_engagements` sorts before `crm_dashboard_stats_v2`,** even though
the labels say `011_` and `010_`. That is correct: `crm_dashboard_stats_v2`
queries `service_engagements`, so it has to come second. The old local
numbering had this dependency backwards — another reason production's order is
the one to trust.

## Adding a migration

Use the MCP `apply_migration` tool or `supabase migration new`, then make sure a
file exists in this directory whose version prefix matches the ledger row. Check
with:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

against `ls supabase/migrations/*.sql`. The two lists must be identical.
