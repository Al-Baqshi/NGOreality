/*
  # Public directory aggregates (bypass 1000-row PostgREST limit)

  Anon + authenticated can call these for accurate NZ totals and tag facets.
*/

CREATE OR REPLACE FUNCTION public.directory_country_counts()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(json_object_agg(country, cnt), '{}'::json)
  FROM (
    SELECT country, count(*)::int AS cnt
    FROM organizations
    WHERE status IN ('listed', 'verified', 'active')
      AND coalesce(trim(country), '') <> ''
    GROUP BY country
  ) c;
$$;

CREATE OR REPLACE FUNCTION public.directory_tag_counts(p_country text DEFAULT NULL)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(json_object_agg(tag, cnt), '{}'::json)
  FROM (
    SELECT tag, count(*)::int AS cnt
    FROM organizations o,
      LATERAL unnest(o.tags) AS tag
    WHERE o.status IN ('listed', 'verified', 'active')
      AND tag IS NOT NULL AND trim(tag) <> ''
      AND (p_country IS NULL OR trim(p_country) = '' OR o.country = p_country)
    GROUP BY tag
  ) t;
$$;

REVOKE ALL ON FUNCTION public.directory_country_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.directory_tag_counts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.directory_country_counts() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.directory_tag_counts(text) TO anon, authenticated;
