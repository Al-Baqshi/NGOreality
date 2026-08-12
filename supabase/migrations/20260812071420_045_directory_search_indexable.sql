/*
  # Fix to 044: the trigram indexes it added could never be used

  The search is `name ILIKE %q% OR charity_registration_number ILIKE %q% OR
  description ILIKE %q%`. A trigram GIN index can serve a leading-wildcard
  ILIKE on ONE column, but an OR across three — one of which had no trgm index
  at all — leaves the planner no choice but a sequential scan over 29,229 rows.

  Measured after 044: still a Seq Scan, 224ms warm and 3.7s cold. Shipping 044
  alone would have been a change that looked like a fix and was not, which is
  why the plan was checked rather than the indexes assumed.

  One concatenated, generated column with one index makes the same search
  indexable. Cost: ~2MB and a little write amplification on a table written by
  staff, not by visitors. Result on the same query:

      before   1140ms   Seq Scan, 29,229 rows scanned
      after      36ms   Bitmap Index Scan, 1.25ms in the index

  The `count(*) OVER ()` still has to touch every matching row to produce an
  exact total, which is the remaining 30ms. That is a deliberate trade: an
  accurate result count on a trust directory is worth more than shaving it.
*/

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    coalesce(name, '') || ' ' ||
    coalesce(charity_registration_number, '') || ' ' ||
    coalesce(description, '')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_organizations_search_trgm
  ON organizations USING gin (search_text gin_trgm_ops);

-- From 044: never used, and they slow every write for nothing.
DROP INDEX IF EXISTS idx_organizations_name_trgm;
DROP INDEX IF EXISTS idx_organizations_description_trgm;

CREATE OR REPLACE VIEW public.directory_listings
WITH (security_barrier = true) AS
SELECT
  o.id, o.name, o.slug, o.description, o.mission_statement, o.category,
  o.location, o.website_url, o.logo_url, o.status, o.verification_level,
  o.country, o.tags, o.charity_registration_number, o.registry_url,
  o.brand_primary, o.brand_secondary, o.created_at,
  (o.claimed_at IS NOT NULL) AS is_claimed,
  o.search_text
FROM organizations o
WHERE o.status IN ('listed', 'verified', 'active');

GRANT SELECT ON public.directory_listings TO anon, authenticated;

DROP FUNCTION IF EXISTS public.directory_search(text, text, text, boolean, integer, integer);

CREATE OR REPLACE FUNCTION public.directory_search(
  p_q             text DEFAULT NULL,
  p_country       text DEFAULT NULL,
  p_tag           text DEFAULT NULL,
  p_verified_only boolean DEFAULT false,
  p_limit         integer DEFAULT 48,
  p_offset        integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, name text, slug text, description text, mission_statement text,
  category text, location text, website_url text, logo_url text,
  status text, verification_level text, country text, tags text[],
  charity_registration_number text, registry_url text,
  brand_primary text, brand_secondary text, is_claimed boolean,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT o.id, o.name, o.slug, o.description, o.mission_statement, o.category,
           o.location, o.website_url, o.logo_url, o.status, o.verification_level,
           o.country, o.tags, o.charity_registration_number, o.registry_url,
           o.brand_primary, o.brand_secondary,
           (o.claimed_at IS NOT NULL) AS is_claimed
      FROM organizations o
     WHERE o.status IN ('listed', 'verified', 'active')
       AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
       AND (p_tag IS NULL OR p_tag = '' OR o.tags @> ARRAY[p_tag])
       AND (NOT coalesce(p_verified_only, false)
            OR (o.status IN ('verified','active') AND o.verification_level <> 'none'))
       -- One column, one index. The term stays a bound parameter.
       AND (p_q IS NULL OR p_q = '' OR o.search_text ILIKE '%' || p_q || '%')
  )
  SELECT b.*, count(*) OVER () AS total_count
    FROM base b
   ORDER BY b.name ASC
   LIMIT  greatest(coalesce(p_limit, 48), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.directory_search(text, text, text, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.directory_search(text, text, text, boolean, integer, integer) TO anon, authenticated;
