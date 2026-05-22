import { supabase } from './supabase';

export type NotificationTemplate = 'site_down' | 'badge_issued' | 'membership_welcome';

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
    default:
      return { subject: 'NGOreality', body: '' };
  }
}

/** Queue an email for the worker / manual send from CRM. */
export async function queueNotification(input: {
  organizationId: string;
  template: NotificationTemplate;
  recipientEmail: string;
  organizationName: string;
  incidentId?: string;
  extra?: Record<string, string>;
}): Promise<{ error: string | null }> {
  const email = input.recipientEmail.trim();
  if (!email) return { error: 'No recipient email' };

  const { subject, body } = buildMessage(input.template, input.organizationName, input.extra);

  const { error } = await supabase.from('notification_events').insert({
    organization_id: input.organizationId,
    incident_id: input.incidentId ?? null,
    template: input.template,
    recipient_email: email,
    subject,
    body_text: body,
    status: 'pending',
  });

  return { error: error?.message ?? null };
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
    return {
      error: null,
      flushError: e instanceof Error ? e.message : 'Could not flush notifications',
    };
  }
}
