-- Email compliance. The last blocker before 29,229 charities can be contacted,
-- and a legal one: the Unsolicited Electronic Messages Act 2007 requires a
-- functional unsubscribe facility and accurate sender identification on every
-- commercial message, with penalties to NZ$200,000. A registry listing is not
-- consent, so absent the facility each send is a separate contravention.
--
-- SUPPRESSION is the spine, checked at ENQUEUE time by trigger rather than only
-- at send. If the check lived only in the sender, every future sender would
-- have to remember it, and a Go worker is a planned second sender.
--
-- UNSUBSCRIBE TOKENS are per address and stable, so one link works from any
-- message that address ever received and cannot be derived from the address.
--
-- ATTEMPTS closes a queue-blocking hole: with no counter, a permanently-failing
-- row returned to 'pending' forever at the head of a created_at-ordered queue
-- and blocked everything behind it -- transactional badge and payment mail too.
--
-- CLAIMED_AT fixes requeue_stuck_notifications, which asked whether the ROW was
-- old rather than whether the CLAIM was. At the observed multi-hour drain for a
-- full cohort every row became requeue-eligible the moment it was claimed:
-- duplicate cold sends, the exact thing the Act penalises.

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email       text PRIMARY KEY,
  reason      text NOT NULL CHECK (reason IN ('unsubscribe','bounce','complaint','manual')),
  detail      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
-- No policies and no grants: written by SECURITY DEFINER functions, read by the
-- service role. A browser must never enumerate who unsubscribed, nor undo it.

CREATE TABLE IF NOT EXISTS public.email_recipients (
  email              text PRIMARY KEY,
  unsubscribe_token  uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_recipients_token_idx
  ON public.email_recipients (unsubscribe_token);
ALTER TABLE public.email_recipients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS attempts   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS category   text NOT NULL DEFAULT 'transactional';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_events_category_ck') THEN
    ALTER TABLE public.notification_events
      ADD CONSTRAINT notification_events_category_ck
      CHECK (category IN ('transactional','outreach'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS notification_events_pending_idx
  ON public.notification_events (status, created_at) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.is_email_suppressed(p_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM email_suppressions WHERE email = lower(trim(p_email)))
$function$
;

CREATE OR REPLACE FUNCTION public.suppress_email(p_email text, p_reason text, p_detail text DEFAULT ''::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO email_suppressions (email, reason, detail)
  VALUES (lower(trim(p_email)), p_reason, coalesce(p_detail, ''))
  ON CONFLICT (email) DO NOTHING;
$function$
;

CREATE OR REPLACE FUNCTION public.unsubscribe_token_for(p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tok uuid; v text := lower(trim(p_email));
BEGIN
  INSERT INTO email_recipients (email) VALUES (v) ON CONFLICT (email) DO NOTHING;
  SELECT unsubscribe_token INTO v_tok FROM email_recipients WHERE email = v;
  RETURN v_tok;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unsubscribe_by_token(p_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email text;
BEGIN
  SELECT email INTO v_email FROM email_recipients WHERE unsubscribe_token = p_token;
  IF v_email IS NULL THEN
    RETURN true;
  END IF;
  PERFORM public.suppress_email(v_email, 'unsubscribe', 'via one-click link');
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.requeue_stuck_notifications()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH requeued AS (
    UPDATE notification_events
       SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
           error_message = CASE WHEN attempts >= 5
             THEN 'abandoned after 5 attempts'
             ELSE 'requeued after being stuck in sending' END,
           claimed_at = NULL
     WHERE status = 'sending'
       AND coalesce(claimed_at, created_at) < now() - interval '15 minutes'
    RETURNING 1
  )
  SELECT count(*)::int FROM requeued;
$function$
;

REVOKE ALL ON FUNCTION public.suppress_email(text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.is_email_suppressed(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.unsubscribe_token_for(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.unsubscribe_by_token(uuid) FROM anon, authenticated;
