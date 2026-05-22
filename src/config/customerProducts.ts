/**
 * Customer-facing product names and packages (not the staff CRM).
 */

/** What NGOs buy — distinct from the internal staff CRM in the sidebar. */
export const ORGANISATION_WORKSPACE_NAME = 'Organisation Workspace';
export const ORGANISATION_WORKSPACE_TAGLINE =
  'Your organisation’s portal for standards, documents, and progress toward the Reality Badge';

/** Organisation Workspace SaaS (NGO-facing; not staff CRM). */
export const WORKSPACE_ADMIN_MONTHLY_CENTS = 2_500; // $25/mo per org admin
export const WORKSPACE_SEAT_MONTHLY_CENTS = 1_500; // $15/mo per additional user
/** Forecast average: 1 admin + 1.5 extra seats per paying org. */
export const WORKSPACE_AVG_EXTRA_SEATS = 1.5;

/** Trust landing + standards onboarding package (fixed price). */
export const LANDING_STANDARDS_PACKAGE_CENTS = 65_000; // $650 NZD
export const LANDING_STANDARDS_PACKAGE_LABEL =
  'Trust landing page + standards setup (education, checklist, ready for badge review)';

/** How we describe member monitoring to NGOs (not hourly). */
export const MEMBER_MONITORING_SUMMARY =
  'Website checked about every 24 hours, periodic summary, and email if something looks wrong';

export const MEMBER_MONITORING_DETAIL =
  'Members do not get “hourly” uptime pings. We run ~daily checks, include status in ongoing reporting, and email when we detect a likely outage. They can call for consultation anytime.';
