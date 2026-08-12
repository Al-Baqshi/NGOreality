/*
  # Outreach at the scale the data actually is

  The board was built for a kanban with a handful of cards per column. The real
  distribution is 29,226 leads in ONE column and six empty ones, of which 14,482
  have no website and 1,516 have a site that is down right now. Neither of those
  two segments — the highest-signal ones we have — could be filtered for, the
  board loaded 20 rows per column, and the maximum a human could select was 350.

  Worse, a bulk move issued one UPDATE and then one activity_log INSERT **per
  organisation from the browser**. Selecting 14,482 leads would have meant 14,482
  round trips.

  This migration moves the set operations into the database, where they are one
  statement each:

    outreach_segment_counts()      → the size of every segment, for tab badges
    outreach_leads(...)            → one page, plus the total matching the filter
    outreach_bulk_set_status(...)  → apply a status to EVERY row matching a
                                     filter (minus explicit exclusions), and
                                     write the history in a single INSERT..SELECT

  The filter is passed rather than a list of ids, so "select all 14,482" costs
  the same as selecting one and the browser never holds 14,482 uuids.

  last_outreach_at is added because an outreach tool has to answer "who have I
  not touched in the longest time". outreach_status alone cannot: every one of
  the 29k rows says 'not_contacted' with no notion of when.
*/

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS last_outreach_at timestamptz;

COMMENT ON COLUMN organizations.last_outreach_at IS
  'When outreach state last changed for this organisation. Drives least-recently-touched ordering; NULL means never touched.';

-- Supports the worklist filter and its ordering.
CREATE INDEX IF NOT EXISTS idx_organizations_outreach_worklist
  ON organizations (status, is_customer, outreach_status);

CREATE INDEX IF NOT EXISTS idx_organizations_last_outreach_at
  ON organizations (last_outreach_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_website_monitors_last_status
  ON website_monitors (last_status) WHERE enabled;

/*
  Shared segment predicate.

  Kept as one SQL expression used by all three functions below so a segment can
  never mean one thing in the count badge and another in the bulk update — which
  would apply a change to a different set than the one shown on screen.
*/
CREATE OR REPLACE FUNCTION public.outreach_segment_matches(
  p_segment text,
  p_website_url text,
  p_monitor_status text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE coalesce(p_segment, 'all')
    WHEN 'no_website'   THEN coalesce(trim(p_website_url), '') = ''
    WHEN 'has_website'  THEN coalesce(trim(p_website_url), '') <> ''
    WHEN 'site_down'    THEN p_monitor_status = 'down'
    WHEN 'site_ok'      THEN p_monitor_status = 'up'
    WHEN 'url_invalid'  THEN p_monitor_status = 'url_invalid'
    WHEN 'never_checked' THEN coalesce(trim(p_website_url), '') <> ''
                              AND coalesce(p_monitor_status, 'unknown') = 'unknown'
    ELSE true
  END;
$$;

/*
  Segment sizes, for the tab badges. One pass over the lead set rather than one
  query per segment.
*/
CREATE OR REPLACE FUNCTION public.outreach_segment_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    'all',           count(*),
    'no_website',    count(*) FILTER (WHERE coalesce(trim(o.website_url), '') = ''),
    'has_website',   count(*) FILTER (WHERE coalesce(trim(o.website_url), '') <> ''),
    'site_down',     count(*) FILTER (WHERE m.last_status = 'down'),
    'site_ok',       count(*) FILTER (WHERE m.last_status = 'up'),
    'url_invalid',   count(*) FILTER (WHERE m.last_status = 'url_invalid'),
    'never_checked', count(*) FILTER (WHERE coalesce(trim(o.website_url), '') <> ''
                                        AND coalesce(m.last_status, 'unknown') = 'unknown'),
    'never_touched', count(*) FILTER (WHERE o.last_outreach_at IS NULL)
  )
  INTO result
  FROM organizations o
  LEFT JOIN website_monitors m ON m.organization_id = o.id AND m.enabled
  WHERE o.status = 'listed' AND o.is_customer = false;

  RETURN result;
END;
$$;

/*
  One page of the worklist.

  total_count rides along as a window function so the page and its total arrive
  in a single round trip — the old board ran an exact count against a 29k table
  seven times per render.

  Ordered least-recently-touched first, so working top-down never revisits the
  same organisation while thousands go untouched.
*/
CREATE OR REPLACE FUNCTION public.outreach_leads(
  p_segment  text DEFAULT 'all',
  p_outreach text DEFAULT NULL,
  p_q        text DEFAULT NULL,
  p_limit    integer DEFAULT 50,
  p_offset   integer DEFAULT 0
)
RETURNS TABLE (
  id                   uuid,
  name                 text,
  slug                 text,
  website_url          text,
  email                text,
  phone                text,
  country              text,
  category             text,
  location             text,
  status               text,
  outreach_status      text,
  last_outreach_at     timestamptz,
  monitor_status       text,
  consecutive_failures integer,
  incident_opened_at   timestamptz,
  total_count          bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT o.id, o.name, o.slug, o.website_url, o.email, o.phone, o.country,
           o.category, o.location, o.status, o.outreach_status, o.last_outreach_at,
           m.last_status AS monitor_status,
           m.consecutive_failures,
           i.opened_at AS incident_opened_at
      FROM organizations o
      LEFT JOIN website_monitors m
        ON m.organization_id = o.id AND m.enabled
      LEFT JOIN LATERAL (
        SELECT wi.opened_at
          FROM website_incidents wi
         WHERE wi.organization_id = o.id AND wi.closed_at IS NULL
         ORDER BY wi.opened_at DESC
         LIMIT 1
      ) i ON true
     WHERE o.status = 'listed'
       AND o.is_customer = false
       AND (p_outreach IS NULL OR p_outreach = '' OR o.outreach_status = p_outreach)
       AND (p_q IS NULL OR p_q = '' OR o.name ILIKE '%' || p_q || '%')
       AND public.outreach_segment_matches(p_segment, o.website_url, m.last_status)
  )
  SELECT b.id, b.name, b.slug, b.website_url, b.email, b.phone, b.country,
         b.category, b.location, b.status, b.outreach_status, b.last_outreach_at,
         b.monitor_status, b.consecutive_failures, b.incident_opened_at,
         count(*) OVER () AS total_count
    FROM base b
   ORDER BY b.last_outreach_at ASC NULLS FIRST, b.name ASC
   LIMIT  greatest(coalesce(p_limit, 50), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

/*
  Apply an outreach status to everything matching a filter.

  Takes the FILTER, not a list of ids: that is what makes "select all 14,482"
  possible without shipping 14,482 uuids to the browser and back. p_exclude
  carries the handful the operator un-ticked, which is how select-all-then-
  deselect-a-few behaves in every mail client.

  p_max is a deliberate ceiling. It is not a page size — it is a guard so a
  mis-click cannot rewrite the entire registry in one statement, and the caller
  is told when it bites (`capped: true`) rather than silently doing less than
  the screen said.

  History is one INSERT..SELECT, so 14,482 rows of activity_log cost one
  statement rather than 14,482 browser round trips.
*/
CREATE OR REPLACE FUNCTION public.outreach_bulk_set_status(
  p_new_status text,
  p_segment    text DEFAULT 'all',
  p_outreach   text DEFAULT NULL,
  p_q          text DEFAULT NULL,
  p_exclude    uuid[] DEFAULT '{}',
  p_max        integer DEFAULT 25000
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   text;
  v_updated bigint;
  v_matched bigint;
  v_cap     integer := least(greatest(coalesce(p_max, 25000), 1), 25000);
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_new_status IS NULL OR btrim(p_new_status) = '' THEN
    RAISE EXCEPTION 'a target outreach status is required';
  END IF;

  SELECT coalesce(nullif(u.email, ''), 'staff') INTO v_actor
    FROM auth.users u WHERE u.id = auth.uid();
  v_actor := coalesce(v_actor, 'staff');

  -- Select, update and log in ONE statement. A temp table would have been
  -- simpler to read but breaks if the function is called twice inside the same
  -- transaction, and rows already carrying the target status are skipped so a
  -- repeated click does not fabricate history.
  WITH target AS (
    SELECT o.id
      FROM organizations o
      LEFT JOIN website_monitors m
        ON m.organization_id = o.id AND m.enabled
     WHERE o.status = 'listed'
       AND o.is_customer = false
       AND (p_outreach IS NULL OR p_outreach = '' OR o.outreach_status = p_outreach)
       AND (p_q IS NULL OR p_q = '' OR o.name ILIKE '%' || p_q || '%')
       AND public.outreach_segment_matches(p_segment, o.website_url, m.last_status)
       AND NOT (o.id = ANY (coalesce(p_exclude, '{}'::uuid[])))
     LIMIT v_cap
  ),
  upd AS (
    UPDATE organizations o
       SET outreach_status  = p_new_status,
           last_outreach_at = now()
      FROM target t
     WHERE o.id = t.id
       AND o.outreach_status IS DISTINCT FROM p_new_status
    RETURNING o.id
  ),
  logged AS (
    INSERT INTO activity_log (organization_id, action, description, performed_by, metadata)
    SELECT u.id,
           'outreach_updated',
           format('Outreach set to %s (bulk action)', p_new_status),
           v_actor,
           jsonb_build_object('bulk', true, 'segment', coalesce(p_segment, 'all'),
                              'new_status', p_new_status)
      FROM upd u
    RETURNING organization_id
  )
  SELECT (SELECT count(*) FROM target), (SELECT count(*) FROM logged)
    INTO v_matched, v_updated;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'updated', v_updated,
    'capped',  v_matched >= v_cap,
    'cap',     v_cap
  );
END;
$$;

-- 030b revoked EXECUTE by default; hand it back to signed-in staff explicitly.
-- The functions guard on is_staff_user() themselves, so a non-staff caller with
-- a valid session still gets nothing.
REVOKE ALL ON FUNCTION public.outreach_segment_matches(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outreach_segment_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outreach_leads(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outreach_bulk_set_status(text, text, text, text, uuid[], integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.outreach_segment_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_leads(text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_bulk_set_status(text, text, text, text, uuid[], integer) TO authenticated;

