/*
  # A public read surface that is actually public

  The anon key ships in the JS bundle, and the policy behind it was
  `status IN ('listed','verified','active')` with NO column restriction — RLS
  restricts rows, not columns. So anyone could page all 29,226 listings and
  read, per charity: email and phone (a ready-made spam list, distributed by
  the platform about to email those same addresses commercially);
  outreach_status, is_customer and last_outreach_at (our own sales pipeline);
  and payment_reference, source_registry, external_id, onboarding_stage.

  ADDITIVE ONLY. This builds the replacement surface; the revoke lands in 046
  so the live site is never reading from something already taken away.

  Also fixes, on the same path:

  1. FILTER INJECTION. useDirectory interpolated the raw search term into a
     PostgREST .or() string, so a comma injected extra OR conditions — a blind
     search oracle over every column anon could read, which was all of them.
     directory_search takes the term as a bound parameter.

  2. A 1.14s SEQUENTIAL SCAN per keystroke. See 045: the indexes added here
     could not actually be used, which 045 corrects.

  NOTE: the two trigram indexes created below are DROPPED by 045. They are kept
  in this file because this is what ran.
*/

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_organizations_name_trgm
  ON organizations USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_organizations_description_trgm
  ON organizations USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_organizations_country ON organizations (country);
CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations (name);

-- Superseded by the definition in 045 (which adds search_text).
CREATE OR REPLACE VIEW public.directory_listings
WITH (security_barrier = true) AS
SELECT
  o.id, o.name, o.slug, o.description, o.mission_statement, o.category,
  o.location, o.website_url, o.logo_url, o.status, o.verification_level,
  o.country, o.tags, o.charity_registration_number, o.registry_url,
  o.brand_primary, o.brand_secondary, o.created_at,
  (o.claimed_at IS NOT NULL) AS is_claimed
FROM organizations o
WHERE o.status IN ('listed', 'verified', 'active');

GRANT SELECT ON public.directory_listings TO anon, authenticated;

-- Superseded by 045.
CREATE OR REPLACE FUNCTION public.directory_listing_by_slug(p_slug text)
RETURNS SETOF public.directory_listings
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.directory_listings WHERE slug = p_slug LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.directory_listing_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.directory_listing_by_slug(text) TO anon, authenticated;
