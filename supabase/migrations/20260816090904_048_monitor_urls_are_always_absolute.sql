-- The only tier we sell has never been monitored.
--
-- monitors_due_for_check() requires `url ~* '^https?://'`, and the single
-- paid_live monitor was stored as 'ngoreality.com' with no scheme. It was
-- therefore excluded from every batch since it was created, while the public
-- badge kept reporting "up" from a check on 2026-05-24. One row out of 14,746,
-- and it was the only one a customer pays for.
--
-- The filter is not the bug and is not being loosened -- a monitor row whose
-- url is not fetchable is a row the worker cannot act on, and silently
-- accepting one is how this hid for 79 days. The fix is to make the column
-- hold an absolute URL always, so the filter can never exclude a live monitor.

CREATE OR REPLACE FUNCTION public.normalize_monitor_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v text := lower(trim(coalesce(NEW.url, '')));
BEGIN
  IF v = '' THEN
    NEW.url := NULL;
    RETURN NEW;
  END IF;

  -- Only prefix things that actually look like a bare host. Registry imports
  -- contain junk in URL columns (an email address in website_url, for one),
  -- and turning that into https://someone@example.com would manufacture a
  -- monitor that fails forever and pages nobody usefully.
  IF v !~ '^https?://' THEN
    IF v ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(/.*)?$' THEN
      v := 'https://' || v;
    ELSE
      NEW.url := NULL;   -- unusable; excluded by the enabled/url guards
      RETURN NEW;
    END IF;
  END IF;

  NEW.url := v;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_monitor_url ON public.website_monitors;
CREATE TRIGGER trg_normalize_monitor_url
  BEFORE INSERT OR UPDATE OF url ON public.website_monitors
  FOR EACH ROW EXECUTE FUNCTION public.normalize_monitor_url();

-- Backfill. Same host test as the trigger, so the two can never disagree.
UPDATE public.website_monitors
   SET url = 'https://' || lower(trim(url))
 WHERE coalesce(trim(url), '') <> ''
   AND url !~* '^https?://'
   AND lower(trim(url)) ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(/.*)?$';

-- Make it due immediately rather than waiting out its interval.
UPDATE public.website_monitors
   SET last_checked_at = NULL
 WHERE tier = 'paid_live';
