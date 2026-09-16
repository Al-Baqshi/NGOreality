import { supabase } from './supabase';
import { LINKEDIN_COMPANY_URL, SITE_URL } from '../config/site';
import { captureEmptyMutation, captureError } from './errorReporting';
import type { OutreachEmailTemplate } from '../types';

export type NotificationTemplate =
  | 'site_down'
  | 'badge_issued'
  | 'membership_welcome'
  | 'badge_request_received'
  | OutreachEmailTemplate;

/** Inbox charities should reply to. Also set as Resend reply_to on send. */
export const OUTREACH_REPLY_EMAIL = 'hello@ngoreality.com';

const OUTREACH_LINKEDIN_LINES = [
  `Follow us on LinkedIn:`,
  LINKEDIN_COMPANY_URL,
].join('\n');

/** NZ ownership / contact line on every outreach email. */
export const OUTREACH_NZ_FOOTER = [
  `—`,
  `NGOreality is New Zealand owned and operated.`,
  `Learn more:`,
  `https://www.ngoreality.com/public/about`,
  ``,
  OUTREACH_LINKEDIN_LINES,
  ``,
  `CEO: Al Baqshi`,
  `Email: ${OUTREACH_REPLY_EMAIL}`,
  `Phone: +64 27 338 8500`,
].join('\n');

function withLinkedInFollow(text: string): string {
  if (text.includes('linkedin.com/company/ngoreality')) return text;
  if (text.includes('https://www.ngoreality.com/public/about')) {
    return text.replace(
      'https://www.ngoreality.com/public/about',
      `https://www.ngoreality.com/public/about\n\n${OUTREACH_LINKEDIN_LINES}`,
    );
  }
  if (text.includes(`Email: ${OUTREACH_REPLY_EMAIL}`)) {
    return text.replace(
      `Email: ${OUTREACH_REPLY_EMAIL}`,
      `Email: ${OUTREACH_REPLY_EMAIL}\nLinkedIn: ${LINKEDIN_COMPANY_URL}`,
    );
  }
  return `${text}\n\n${OUTREACH_LINKEDIN_LINES}`;
}

/** Append the NZ footer unless the phone line is already present. */
export function withOutreachNzFooter(body: string): string {
  const text = (body ?? '').trimEnd();
  if (!text) return OUTREACH_NZ_FOOTER;
  if (text.includes(OUTREACH_REPLY_EMAIL)) {
    const withPhone = text.includes('+64 27 338 8500')
      ? text
      : `${text}\n\n${OUTREACH_NZ_FOOTER}`;
    return withLinkedInFollow(withPhone);
  }
  if (text.includes('Phone: +64 27 338 8500')) {
    return withLinkedInFollow(
      text.replace(
        'Phone: +64 27 338 8500',
        `Email: ${OUTREACH_REPLY_EMAIL}\nPhone: +64 27 338 8500`,
      ),
    );
  }
  if (text.includes('+64 27 338 8500')) return withLinkedInFollow(text);
  return withLinkedInFollow(`${text}\n\n${OUTREACH_NZ_FOOTER}`);
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
          `Follow us on LinkedIn: ${LINKEDIN_COMPANY_URL}`,
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
          `Follow us on LinkedIn: ${LINKEDIN_COMPANY_URL}`,
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
          `Follow us on LinkedIn: ${LINKEDIN_COMPANY_URL}`,
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
          `Follow us on LinkedIn: ${LINKEDIN_COMPANY_URL}`,
        ].join('\n'),
      };
    }
    case 'outreach_cold_invite':
      return {
        subject: `[NGOreality] A note for ${organizationName}`,
        body: [
          `Kia ora ${organizationName},`,
          ``,
          `We came across ${organizationName} on the New Zealand Charities Register and wanted to introduce NGOreality.`,
          ``,
          `Your organisation already has a public presence online, so our suggestion isn't about replacing what you have.`,
          ``,
          `NGOreality gives New Zealand charities another way to demonstrate their organisation's public information and trust standards through a verified Reality Badge and profile.`,
          ``,
          `You can claim and onboard your organisation here:`,
          `{page}`,
          ``,
          `Reality Badge membership is NZD $70 per year and includes the badge and website monitoring.`,
          ``,
          `If you'd like to know whether it would be useful for ${organizationName}, simply reply to this email and we'll explain it.`,
          ``,
          `—`,
          `NGOreality is New Zealand owned and operated.`,
          ``,
          `Learn more:`,
          `https://www.ngoreality.com/public/about`,
          ``,
          `Follow us on LinkedIn:`,
          LINKEDIN_COMPANY_URL,
          ``,
          `CEO: Al Baqshi`,
          `Email: ${OUTREACH_REPLY_EMAIL}`,
          `Phone: +64 27 338 8500`,
        ].join('\n'),
      };
    case 'outreach_no_website':
      return {
        subject: `[NGOreality] A note for ${organizationName}`,
        body: [
          `Kia ora ${organizationName},`,
          ``,
          `We came across ${organizationName} while looking at New Zealand charities and noticed there isn't a public website listed.`,
          ``,
          `We're not suggesting you need an expensive new website.`,
          ``,
          `Sometimes a clear public profile, updated organisation information, and a simple trust-focused page are enough to make it much easier for people to understand who you are and what your organisation does.`,
          ``,
          `If that would help ${organizationName}, a trust landing page with us is NZD $650, one-off. We build it at that fixed price.`,
          ``,
          `You can claim your NGOreality profile here:`,
          `{page}`,
          ``,
          `If you'd like, reply to this email and we can explain what we would recommend for ${organizationName} and what it would cost.`,
          ``,
          `No pressure — we're happy to have a conversation first.`,
          ``,
          `—`,
          `NGOreality is New Zealand owned and operated.`,
          ``,
          `Learn more:`,
          `https://www.ngoreality.com/public/about`,
          ``,
          `Follow us on LinkedIn:`,
          LINKEDIN_COMPANY_URL,
          ``,
          `CEO: Al Baqshi`,
          `Email: ${OUTREACH_REPLY_EMAIL}`,
          `Phone: +64 27 338 8500`,
        ].join('\n'),
      };
    case 'outreach_website_help':
      return {
        subject: `[NGOreality] A note for ${organizationName}`,
        body: [
          `Kia ora ${organizationName},`,
          ``,
          `We came across ${organizationName} while looking at New Zealand charities and noticed your website does not appear to be loading at the moment.`,
          ``,
          `That happens more often than people think, and it is not a criticism. When a site is down, it is simply harder for people to find you and understand the work you do.`,
          ``,
          `We're not suggesting you need an expensive new website.`,
          ``,
          `Sometimes a clear public profile and a simple trust-focused page are enough — and if you would like us to build that for ${organizationName}, a trust landing page is NZD $650, one-off. We build it at that fixed price.`,
          ``,
          `You can claim your NGOreality profile here:`,
          `{page}`,
          ``,
          `If you'd like, reply to this email and we can explain what we would recommend for ${organizationName} and what it would cost.`,
          ``,
          `No pressure — we're happy to have a conversation first.`,
          ``,
          `—`,
          `NGOreality is New Zealand owned and operated.`,
          ``,
          `Learn more:`,
          `https://www.ngoreality.com/public/about`,
          ``,
          `Follow us on LinkedIn:`,
          LINKEDIN_COMPANY_URL,
          ``,
          `CEO: Al Baqshi`,
          `Email: ${OUTREACH_REPLY_EMAIL}`,
          `Phone: +64 27 338 8500`,
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
  const subject = personalizeOutreachDraft(
    input.subjectOverride ?? built.subject,
    input.organizationName,
    profileUrl,
  );
  const body = personalizeOutreachDraft(
    input.bodyOverride ?? built.body,
    input.organizationName,
    profileUrl,
  );

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
