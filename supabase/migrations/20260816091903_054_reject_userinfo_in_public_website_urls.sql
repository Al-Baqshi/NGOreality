-- Completes 053, and closes something larger than a data cleanup.
--
-- One row survived: 'https://www.suttonroadanimalsanctuary@suttonroad', whose
-- address has no TLD and so escaped a pattern that required one.
--
-- Widening the pattern is the small half. '@' in a URL is the userinfo
-- separator, and a browser discards everything before it:
-- 'https://www.realcharity.org.nz@evil.example' reads to a human as the charity
-- and navigates to evil.example. Across 29,225 charities, on a platform whose
-- entire product is trust, with website_url editable by whoever claimed the
-- listing, that is a phishing primitive rather than untidy data.
--
-- The rule is therefore categorical: a published website_url carries no
-- userinfo. Below is the final sanitizer plus the trigger that holds the
-- invariant against the next registry import.

CREATE OR REPLACE FUNCTION public.sanitize_website_url(p_raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v       text := trim(coalesce(p_raw, ''));
  v_clean text;
  v_tok   text;
BEGIN
  IF v = '' THEN
    RETURN NULL;
  END IF;

  IF position('@' in v) = 0 THEN
    RETURN v;   -- ordinary URL, untouched
  END IF;

  -- Strip anything that looks like an address or a userinfo prefix, with or
  -- without a TLD. What remains cannot contain credentials or an address.
  v_clean := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9._-]*', ' ', 'g');

  FOR v_tok IN
    SELECT m[1] FROM regexp_matches(
      v_clean,
      '((?:https?://)?(?:www\.)?[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+(?:/[^\s,]*)?)',
      'g') AS m
  LOOP
    IF v_tok ~ '\.[A-Za-z]{2,}' AND position('@' in v_tok) = 0 THEN
      RETURN CASE WHEN v_tok ~* '^https?://' THEN v_tok ELSE 'https://' || v_tok END;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_website_url_is_not_an_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.website_url := public.sanitize_website_url(NEW.website_url);
  RETURN NEW;
END;
$function$
;

DROP TRIGGER IF EXISTS trg_guard_website_url ON public.organizations;
CREATE TRIGGER trg_guard_website_url
  BEFORE INSERT OR UPDATE OF website_url ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_website_url_is_not_an_email();

INSERT INTO activity_log (organization_id, action, description, performed_by)
SELECT id, 'website_url_sanitized',
       format('Removed userinfo/address from a published website_url. Original: %s', website_url),
       'migration_054'
  FROM organizations
 WHERE coalesce(website_url, '') <> '' AND position('@' in website_url) > 0
   AND public.sanitize_website_url(website_url) IS DISTINCT FROM website_url;

UPDATE organizations
   SET website_url = public.sanitize_website_url(website_url)
 WHERE coalesce(website_url, '') <> '' AND position('@' in website_url) > 0;
