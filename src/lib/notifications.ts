import { supabase } from './supabase';
import { SITE_URL } from '../config/site';
import { captureEmptyMutation, captureError } from './errorReporting';
import type { OutreachEmailTemplate } from '../types';

export type NotificationTemplate =
  | 'site_down'
  | 'badge_issued'
  | 'membership_welcome'
  | 'badge_request_received'
  | OutreachEmailTemplate;

function portalSignupUrl(organizationId?: string): string {
  const base = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '');
  const root = base || 'https://www.ngoreality.com';
  if (organizationId) return `${root}/ngo/signup?org=${encodeURIComponent(organizationId)}`;
  return `${root}/ngo/signup`;
}

/** Absolute URL of an organisation's public directory page (`/public/org/<slug>`). */
export function publicProfileUrl(slug?: string | null): string | null {
  const clean = slug?.trim();
  if (!clean) return null;
  return `${SITE_URL}/public/org/${encodeURIComponent(clean)}`;
}

function buildMessage(
  template: NotificationTemplate,
  organizationName: string,
  extra?: Record<string, string>,
): { subject: string; body: string } {
  const signupUrl = portalSignupUrl(extra?.organizationId);
  switch (template) {
    case 'site_down':
      return {
        subject: `[NGOreality] Website down — ${organizationName}`,
        body: [
          `Hello,`,
          ``,
          `Our monitors detected that the website for ${organizationName} is not responding.`,
          ``,
          `As an NGOreality member you receive this alert automatically. If you need hands-on help fixing the issue, reply to this email — support is billed separately from your annual membership.`,
          ``,
          `— NGOreality monitoring`,
        ].join('\n'),
      };
    case 'badge_issued':
      return {
        subject: `[NGOreality] Your Reality Badge is active — ${organizationName}`,
        body: [
          `Congratulations — ${organizationName} has met NGOreality public trust standards and your Reality Badge is now active.`,
          extra?.verificationId ? `Badge ID: ${extra.verificationId}` : '',
          ``,
          `Your membership includes website monitoring for one year. We will email you if your site goes down.`,
          ``,
          `— NGOreality`,
        ]
          .filter(Boolean)
          .join('\n'),
      };
    case 'membership_welcome':
      return {
        subject: `[NGOreality] Membership active — ${organizationName}`,
        body: [
          `Thank you — annual NGOreality membership for ${organizationName} is now active.`,
          ``,
          `Included for one year:`,
          `• Reality Badge (after standards review)`,
          `• Website uptime monitoring and email alerts`,
          ``,
          `Sign in to your portal for member-only security checklist items (repository, security baseline, and more).`,
          ``,
          `Consulting, custom sites, and hands-on support are available separately.`,
          ``,
          `— NGOreality`,
        ].join('\n'),
      };
    case 'badge_request_received': {
      const ref = extra?.paymentReference ?? 'NGR-…';
      return {
        subject: `[NGOreality] Application received — ${organizationName}`,
        body: [
          `Kia ora,`,
          ``,
          `Thank you for submitting your NGOreality verification request for ${organizationName}.`,
          ``,
          `We will review your organisation against our public trust standards and contact you if anything needs to be updated on your site.`,
          ``,
          `Typical timeline: about 5–10 business days after payment and standards are in order. Your Reality Badge is issued when standards pass and membership is active.`,
          ``,
          `Bank transfer — use this payment reference exactly: ${ref}`,
          `Amount: NZD $70.00 annual membership`,
          `Allow up to 3 business days after we receive your transfer for it to be applied.`,
          ``,
          `Paymark (Online EFTPOS) and Airwallex payments are coming soon to the portal.`,
          ``,
          `— NGOreality`,
        ].join('\n'),
      };
    }
    case 'outreach_cold_invite':
      return {
        subject: `[NGOreality] Claim your organisation profile — ${organizationName}`,
        body: [
          `Kia ora,`,
          ``,
          `We are reaching out from NGOreality because ${organizationName} is listed on the New Zealand charities register and may benefit from a verified public profile, optional website support, and trust standards that funders recognise.`,
          ``,
          `Claim and onboard your organisation here (free to start):`,
          signupUrl,
          ``,
          `Once claimed, you can pay by bank transfer for:`,
          `• Reality Badge membership — NZD $70 / year (badge + website monitoring)`,
          `• Trust landing page package — NZD $650 one-off (we build a standards-ready page)`,
          ``,
          `Reply to this email if you have questions — we are happy to walk you through it.`,
          ``,
          `— NGOreality outreach`,
        ].join('\n'),
      };
    case 'outreach_no_website':
      return {
        subject: `[NGOreality] A simple web presence for ${organizationName}`,
        body: [
          `Kia ora,`,
          ``,
          `We noticed ${organizationName} does not currently have a public website listed. Many charities use NGOreality for a lightweight trust landing page (NZD $650), verified registry details, and optional Reality Badge membership (NZD $70 / year) with monitoring.`,
          ``,
          `Start here when it suits you:`,
          signupUrl,
          ``,
          `There is no obligation — reply if you would like a short call about options.`,
          ``,
          `— NGOreality`,
        ].join('\n'),
      };
    case 'outreach_website_help':
      return {
        subject: `[NGOreality] Website help for ${organizationName}`,
        body: [
          `Kia ora,`,
          ``,
          `Our systems flagged that the website for ${organizationName} may be unreachable or returning errors${extra?.errorDetail ? ` (${extra.errorDetail})` : ''}.`,
          ``,
          `NGOreality members receive monitoring alerts with Reality Badge membership (NZD $70 / year). We can also help fix or replace a site with our trust landing page package (NZD $650).`,
          ``,
          `If you would like support, reply to this email or claim your profile:`,
          signupUrl,
          ``,
          `— NGOreality`,
        ].join('\n'),
      };
    default:
      return { subject: 'NGOreality', body: '' };
  }
}

/**
 * Replace placeholders when staff edits the draft before send.
 *  - `{name}` / `{organizationName}` → the organisation's name
 *  - `{page}` / `{profileUrl}`       → link to its public directory page (/public/org/<slug>)
 * The same brackets are honoured server-side by `outreach_enqueue_emails` (migration 064).
 */
export function personalizeOutreachDraft(
  text: string,
  organizationName: string,
  profileUrl?: string | null,
): string {
  const page = profileUrl ?? '';
  return text
    .replace(/\{name\}/gi, organizationName)
    .replace(/\{organizationName\}/gi, organizationName)
    .replace(/\{page\}/gi, page)
    .replace(/\{profileUrl\}/gi, page);
}

/** Queue an email for the worker / manual send from CRM. */
export async function queueNotification(input: {
  organizationId: string;
  template: NotificationTemplate;
  recipientEmail: string;
  organizationName: string;
  /** Public directory slug — lets `{page}` in a staff draft resolve to the org's profile link. */
  organizationSlug?: string | null;
  incidentId?: string;
  extra?: Record<string, string>;
  subjectOverride?: string;
  bodyOverride?: string;
}): Promise<{ error: string | null }> {
  const email = input.recipientEmail.trim();
  if (!email) return { error: 'No recipient email' };

  const built = buildMessage(input.template, input.organizationName, {
    ...input.extra,
    organizationId: input.organizationId,
  });
  const profileUrl = publicProfileUrl(input.organizationSlug);
  const subject = input.subjectOverride
    ? personalizeOutreachDraft(input.subjectOverride, input.organizationName, profileUrl)
    : built.subject;
  const body = input.bodyOverride
    ? personalizeOutreachDraft(input.bodyOverride, input.organizationName, profileUrl)
    : built.body;

  const { data, error } = await supabase.from('notification_events').insert({
    organization_id: input.organizationId,
    incident_id: input.incidentId ?? null,
    template: input.template,
    recipient_email: email,
    subject,
    body_text: body,
    status: 'pending',
  }).select('id');

  if (error) {
    return { error: captureError(error, { where: 'queueNotification' }) };
  }
  if (!data?.length) {
    return { error: captureEmptyMutation('queueNotification.empty', 'The email was not queued. Refresh and try again.') };
  }
  return { error: null };
}

/** After queueing, try immediate send via Go API when configured. */
export async function queueAndTrySend(input: Parameters<typeof queueNotification>[0]): Promise<{
  error: string | null;
  flushError: string | null;
}> {
  const { error } = await queueNotification(input);
  if (error) return { error, flushError: null };

  try {
    const { flushPendingNotifications } = await import('./monitorApi');
    await flushPendingNotifications();
    return { error: null, flushError: null };
  } catch (e) {
    captureError(e, { where: 'queueAndTrySend.flush' });
    return {
      error: null,
      flushError: e instanceof Error ? e.message : 'Could not flush notifications',
    };
  }
}

export function previewOutreachEmail(
  template: OutreachEmailTemplate,
  organizationName: string,
  extra?: Record<string, string>,
) {
  return buildMessage(template, organizationName, extra);
}
