/*
  # Fix to 040: the column-level REVOKE was a no-op

  Postgres will not let you carve a column out of a TABLE-level grant.
  `authenticated` held UPDATE and INSERT on public.profiles as a whole, so
  `REVOKE UPDATE (is_staff) ... FROM authenticated` in 040 changed nothing —
  information_schema.column_privileges still reported the column as writable.

  040's trigger did block the escalation (verified against a real non-staff
  account: "BLOCKED: is_staff is managed in staff_members and cannot be changed
  here"), so the hole was closed. But it was closed by ONE guard, not the two
  that migration claimed, and a single guard is one DROP TRIGGER away from
  being no guard at all.

  The correct shape is to drop the table-wide privilege and re-grant column by
  column, omitting is_staff. After this, `authenticated` holds only SELECT and
  REFERENCES on that column — no INSERT, no UPDATE — so the privilege layer and
  the trigger are genuinely independent of each other.
*/

REVOKE UPDATE, INSERT ON public.profiles FROM authenticated;

-- Everything except is_staff. A user may still edit their own display name.
GRANT UPDATE (full_name, updated_at) ON public.profiles TO authenticated;

-- INSERT covers the "Users can insert own profile" path. handle_new_user runs
-- SECURITY DEFINER and is unaffected by these grants either way.
GRANT INSERT (id, full_name, email, created_at, updated_at) ON public.profiles TO authenticated;
