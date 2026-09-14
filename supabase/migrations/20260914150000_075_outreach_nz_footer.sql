/*
  # NZ ownership/contact footer on all outreach email defaults

  Keeps argument name p_signup_url (existing remote signature).
  Send-notifications Edge Function also appends this at send time when missing.
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
$msg$Kia ora,

We are reaching out from NGOreality because %s is listed on the New Zealand charities register and may benefit from a verified public profile, optional website support, and trust standards that funders recognise.

Claim and onboard your organisation here (free to start):
%s

Once claimed, you can pay by bank transfer for:
• Reality Badge membership — NZD $70 / year (badge + website monitoring)
• Trust landing page package — NZD $650 one-off (we build a standards-ready page)

Reply to this email if you have questions — we are happy to walk you through it.

—
NGOreality is New Zealand owned and operated.
Phone: +64 27 338 8500$msg$,
        p_org_name, p_signup_url
      );
    WHEN 'outreach_no_website' THEN
      RETURN format(
$msg$Kia ora,

We noticed %s does not currently have a public website listed. Many charities use NGOreality for a lightweight trust landing page (NZD $650), verified registry details, and optional Reality Badge membership (NZD $70 / year) with monitoring.

Start here when it suits you:
%s

There is no obligation — reply if you would like a short call about options.

—
NGOreality is New Zealand owned and operated.
Phone: +64 27 338 8500$msg$,
        p_org_name, p_signup_url
      );
    WHEN 'outreach_website_help' THEN
      RETURN format(
$msg$Kia ora,

Our systems flagged that the website for %s may be unreachable or returning errors.

NGOreality members receive monitoring alerts with Reality Badge membership (NZD $70 / year). We can also help fix or replace a site with our trust landing page package (NZD $650).

If you would like support, reply to this email or claim your profile:
%s

—
NGOreality is New Zealand owned and operated.
Phone: +64 27 338 8500$msg$,
        p_org_name, p_signup_url
      );
    ELSE
      RETURN '';
  END CASE;
END;
$$;
