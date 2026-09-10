/*
  # Fix mis-parsed roster skip_reason backfill

  The previous backfill matched ILIKE '%no email%' against the generic runner
  message "Skipped by schedule runner (no email / suppressed / recent dupe)",
  so orgs with a valid email were wrongly labelled "no email address".

  Recompute skip_reason from live organisation + notification state.
*/

UPDATE public.outreach_schedule_recipients r
   SET skip_reason = computed.reason
  FROM (
    SELECT
      r2.id AS recipient_id,
      CASE
        WHEN o.email IS NULL OR trim(o.email) = '' THEN
          'Organisation has no email address'
        WHEN public.is_email_suppressed(o.email) THEN
          'Email is on the suppression list (unsubscribed or bounced)'
        WHEN EXISTS (
          SELECT 1
            FROM notification_events ne
            JOIN outreach_schedules s ON s.id = r2.schedule_id
           WHERE ne.organization_id = r2.organization_id
             AND ne.template = s.template
             AND ne.status IN ('pending', 'sending', 'sent')
             AND ne.id IS DISTINCT FROM r2.notification_event_id
             AND ne.created_at > now() - interval '365 days'
        ) THEN
          'Already has a pending/sent email for this template in the last 365 days'
        WHEN ne_own.error_message ILIKE '%suppress%' THEN
          'Email is on the suppression list (unsubscribed or bounced)'
        WHEN ne_own.error_message ILIKE '%365%'
          OR ne_own.error_message ILIKE '%already%'
          OR ne_own.error_message ILIKE '%recent dupe%'
          OR ne_own.error_message ILIKE '%dupe%' THEN
          'Already has a pending/sent email for this template in the last 365 days'
        WHEN ne_own.error_message ILIKE '%no email%'
          AND ne_own.error_message NOT ILIKE '%/ suppressed /%'
          AND ne_own.error_message NOT ILIKE '%dupe%' THEN
          'Organisation has no email address'
        WHEN nullif(trim(ne_own.error_message), '') IS NOT NULL
          AND ne_own.error_message NOT ILIKE '%no email / suppressed / recent dupe%' THEN
          trim(ne_own.error_message)
        ELSE
          'Skipped at send time (likely already emailed this template, or became ineligible)'
      END AS reason
    FROM public.outreach_schedule_recipients r2
    JOIN public.organizations o ON o.id = r2.organization_id
    LEFT JOIN public.notification_events ne_own ON ne_own.id = r2.notification_event_id
    WHERE r2.status = 'skipped'
  ) computed
 WHERE r.id = computed.recipient_id;
