/*
  # Outreach footer includes hello@ngoreality.com

  Charities reply to scheduled outreach. The address is in the body and
  send-notifications sets Reply-To to the same inbox.
*/

CREATE OR REPLACE FUNCTION public.outreach_email_body(
  p_template text,
  p_org_name text,
  p_signup_url text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_template
    WHEN 'outreach_cold_invite' THEN
      RETURN format(
$msg$Kia ora %1$s,

We came across %1$s on the New Zealand Charities Register and wanted to introduce NGOreality.

Your organisation already has a public presence online, so our suggestion isn't about replacing what you have.

NGOreality gives New Zealand charities another way to demonstrate their organisation's public information and trust standards through a verified Reality Badge and profile.

You can claim and onboard your organisation here:
%2$s

Reality Badge membership is NZD $70 per year and includes the badge and website monitoring.

If you'd like to know whether it would be useful for %1$s, simply reply to this email and we'll explain it.

—
NGOreality is New Zealand owned and operated.

Learn more:
https://www.ngoreality.com/public/about

CEO: Al Baqshi
Email: hello@ngoreality.com
Phone: +64 27 338 8500$msg$,
        p_org_name, p_signup_url
      );
    WHEN 'outreach_no_website' THEN
      RETURN format(
$msg$Kia ora %1$s,

We came across %1$s while looking at New Zealand charities and noticed there isn't a public website listed.

We're not suggesting you need an expensive new website.

Sometimes a clear public profile, updated organisation information, and a simple trust-focused page are enough to make it much easier for people to understand who you are and what your organisation does.

If that would help %1$s, a trust landing page with us is NZD $650, one-off. We build it at that fixed price.

You can claim your NGOreality profile here:
%2$s

If you'd like, reply to this email and we can explain what we would recommend for %1$s and what it would cost.

No pressure — we're happy to have a conversation first.

—
NGOreality is New Zealand owned and operated.

Learn more:
https://www.ngoreality.com/public/about

CEO: Al Baqshi
Email: hello@ngoreality.com
Phone: +64 27 338 8500$msg$,
        p_org_name, p_signup_url
      );
    WHEN 'outreach_website_help' THEN
      RETURN format(
$msg$Kia ora %1$s,

We came across %1$s while looking at New Zealand charities and noticed your website does not appear to be loading at the moment.

That happens more often than people think, and it is not a criticism. When a site is down, it is simply harder for people to find you and understand the work you do.

We're not suggesting you need an expensive new website.

Sometimes a clear public profile and a simple trust-focused page are enough — and if you would like us to build that for %1$s, a trust landing page is NZD $650, one-off. We build it at that fixed price.

You can claim your NGOreality profile here:
%2$s

If you'd like, reply to this email and we can explain what we would recommend for %1$s and what it would cost.

No pressure — we're happy to have a conversation first.

—
NGOreality is New Zealand owned and operated.

Learn more:
https://www.ngoreality.com/public/about

CEO: Al Baqshi
Email: hello@ngoreality.com
Phone: +64 27 338 8500$msg$,
        p_org_name, p_signup_url
      );
    ELSE
      RETURN '';
  END CASE;
END;
$$;

-- Stored schedule drafts and already-queued mail still have the previous
-- footer. Patch them so CRM preview and send both show the inbox.
UPDATE public.outreach_schedules
SET
  body = replace(body, 'Phone: +64 27 338 8500', E'Email: hello@ngoreality.com\nPhone: +64 27 338 8500'),
  updated_at = now()
WHERE coalesce(body, '') <> ''
  AND position('hello@ngoreality.com' in body) = 0
  AND position('Phone: +64 27 338 8500' in body) > 0;

UPDATE public.notification_events
SET body_text = replace(
  body_text,
  'Phone: +64 27 338 8500',
  E'Email: hello@ngoreality.com\nPhone: +64 27 338 8500'
)
WHERE template LIKE 'outreach_%'
  AND status IN ('pending', 'held', 'sending')
  AND position('hello@ngoreality.com' in body_text) = 0
  AND position('Phone: +64 27 338 8500' in body_text) > 0;
