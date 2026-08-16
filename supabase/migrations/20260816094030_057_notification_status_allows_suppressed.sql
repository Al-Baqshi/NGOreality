-- Repairs a defect introduced by 055.
--
-- The suppression trigger parks a message for an unsubscribed recipient as
-- status 'suppressed', but notification_events_status_check permitted only
-- pending/sending/sent/failed/skipped. The INSERT therefore raised a constraint
-- violation instead of quietly suppressing.
--
-- Worse than it sounds: enqueue happens inside triggers on badge requests and
-- monitor checks, so the exception propagated and aborted the surrounding
-- transaction. An unsubscribed charity requesting a badge would have the whole
-- request fail with a database error, and a monitor recording a down-check for
-- that org would fail too -- an unsubscribe would silently break the platform
-- for that member rather than merely stopping their mail.
--
-- 'suppressed' stays distinct from 'skipped' deliberately. 'skipped' means we
-- could not send (bad address, lost race); 'suppressed' means we were asked not
-- to. That difference is precisely what must be demonstrable if a complaint is
-- ever made about a message sent after an unsubscribe.

ALTER TABLE public.notification_events
  DROP CONSTRAINT IF EXISTS notification_events_status_check;

ALTER TABLE public.notification_events
  ADD CONSTRAINT notification_events_status_check
  CHECK (status = ANY (ARRAY['pending','sending','sent','failed','skipped','suppressed']));
