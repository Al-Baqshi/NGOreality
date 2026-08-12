-- RESCUED FROM PRODUCTION during the A0 migration-history reconciliation.
-- Applied as version 20260521100648 with no source in git.
--
-- Backs the "Registry insight" card on the staff dashboard.

CREATE OR REPLACE FUNCTION public.registry_readiness_stats(p_country text DEFAULT 'NZ')
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result json;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only';
  END IF;

  SELECT json_build_object(
    'country', p_country,
    'total_listed', (SELECT count(*)::int FROM organizations o
                      WHERE o.status = 'listed'
                        AND (p_country IS NULL OR p_country = '' OR o.country = p_country)),
    'without_website', (SELECT count(*)::int FROM organizations o
                         WHERE o.status = 'listed'
                           AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
                           AND coalesce(trim(o.website_url), '') = ''),
    'with_website', (SELECT count(*)::int FROM organizations o
                      WHERE o.status = 'listed'
                        AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
                        AND coalesce(trim(o.website_url), '') <> ''),
    'heuristic_profile_ready', (SELECT count(*)::int FROM organizations o
                                 WHERE o.status = 'listed'
                                   AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
                                   AND coalesce(trim(o.website_url), '') <> ''
                                   AND length(trim(coalesce(o.mission_statement, o.description, ''))) >= 40
                                   AND coalesce(trim(o.email), '') <> ''),
    'monitors_down', (SELECT count(*)::int FROM website_monitors wm
                       JOIN organizations o ON o.id = wm.organization_id
                      WHERE o.status = 'listed'
                        AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
                        AND wm.enabled = true AND wm.last_status = 'down'),
    'monitors_up', (SELECT count(*)::int FROM website_monitors wm
                     JOIN organizations o ON o.id = wm.organization_id
                    WHERE o.status = 'listed'
                      AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
                      AND wm.enabled = true AND wm.last_status = 'up'),
    'public_criteria_all_pass', (SELECT count(*)::int FROM (
        SELECT vc.organization_id FROM verification_criteria vc
          JOIN organizations o ON o.id = vc.organization_id
         WHERE o.status = 'listed'
           AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
           AND vc.criterion_tier = 'public'
         GROUP BY vc.organization_id HAVING bool_and(vc.status = 'pass')) passed),
    'with_public_criteria_initialized', (SELECT count(DISTINCT vc.organization_id)::int
        FROM verification_criteria vc JOIN organizations o ON o.id = vc.organization_id
       WHERE o.status = 'listed'
         AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
         AND vc.criterion_tier = 'public'),
    'active_members', (SELECT count(*)::int FROM organizations o
                        WHERE (p_country IS NULL OR p_country = '' OR o.country = p_country)
                          AND public.has_active_membership(o.id))
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registry_readiness_stats(text) TO authenticated;
