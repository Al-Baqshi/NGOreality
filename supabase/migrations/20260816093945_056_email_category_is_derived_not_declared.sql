-- 055 let the caller declare `category`, and the caller is the wrong authority.
--
-- The category decides whether a message carries an unsubscribe facility, and
-- that is a legal classification, not a preference. A caller that queued
-- 'outreach_cold_invite' as 'transactional' -- by mistake or to sidestep the
-- footer -- would send commercial mail with no unsubscribe link, the exact
-- contravention 055 exists to prevent, and it would look correct in the queue.
--
-- The template already encodes the answer: the allowlist names three outreach
-- templates and four transactional ones. The category is therefore derived from
-- it and overwritten on every insert, so a new template beginning 'outreach' is
-- commercial from the moment it exists, with no second place to remember.

CREATE OR REPLACE FUNCTION public.block_suppressed_recipients()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.recipient_email := lower(trim(coalesce(NEW.recipient_email, '')));

  -- Not negotiable by the caller.
  NEW.category := CASE
    WHEN coalesce(NEW.template, '') LIKE 'outreach%' THEN 'outreach'
    ELSE 'transactional'
  END;

  IF NEW.recipient_email <> '' AND public.is_email_suppressed(NEW.recipient_email) THEN
    NEW.status        := 'suppressed';
    NEW.error_message := 'recipient is on the suppression list';
  END IF;

  RETURN NEW;
END;
$function$
;

DROP TRIGGER IF EXISTS trg_block_suppressed_recipients ON public.notification_events;
CREATE TRIGGER trg_block_suppressed_recipients
  BEFORE INSERT ON public.notification_events
  FOR EACH ROW EXECUTE FUNCTION public.block_suppressed_recipients();

UPDATE public.notification_events
   SET category = CASE WHEN coalesce(template,'') LIKE 'outreach%' THEN 'outreach' ELSE 'transactional' END
 WHERE category IS DISTINCT FROM
       (CASE WHEN coalesce(template,'') LIKE 'outreach%' THEN 'outreach' ELSE 'transactional' END);
