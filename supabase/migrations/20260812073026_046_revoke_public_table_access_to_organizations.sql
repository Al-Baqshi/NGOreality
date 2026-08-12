/*
  # Cut anon off from the organizations table

  044/045 built the replacement surface and the frontend now reads it. This is
  the half that actually closes the hole.

  Two policies go:

  1. "Public can read directory organizations" (anon) — the one that let the
     key in the JS bundle page 29,226 charities' email and phone, plus our own
     outreach_status / is_customer / last_outreach_at.

  2. "Authenticated can read listed orgs for claim search" (021) — the same
     exposure one signup away. It existed so the claim search could find an
     organisation; that search now goes through directory_search, so nothing
     needs it. Without it, a signed-in non-staff user sees only organisations
     they are a member of.

  The table GRANT is revoked from anon as well as the policy, so this is closed
  at both layers rather than relying on the policy alone — the same lesson as
  040/041, where a policy without the matching grant left a column writable.

  Staff are unaffected ("Staff manage organizations", FOR ALL, is_staff_user()).
  Members keep "Members can read own organization". Public reads keep working
  through directory_listings and directory_search, both of which run as their
  owner and so do not need the caller to hold table access.

  Verified against production with the public anon key:

    organizations?select=name,email,phone   -> 401 permission denied
    directory_listings                      -> 200, safe columns only
    rpc/directory_search                    -> 200, 3,685 matches
    email / phone / outreach_status present -> no
*/

DROP POLICY IF EXISTS "Public can read directory organizations" ON organizations;
DROP POLICY IF EXISTS "Authenticated can read listed orgs for claim search" ON organizations;

REVOKE ALL ON TABLE public.organizations FROM anon;

-- The view and the RPCs are the public contract now.
GRANT SELECT ON public.directory_listings TO anon, authenticated;
