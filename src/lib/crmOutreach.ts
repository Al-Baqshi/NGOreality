import { supabase } from './supabase';
import { ensurePaymentReference } from './payments';
import { previewOutreachEmail, queueNotification } from './notifications';
import {
  DEFAULT_CRITERIA,
  OUTREACH_EMAIL_BY_COLUMN,
  OUTREACH_STATUS_LABELS,
  type Organization,
  type OutreachEmailTemplate,
  type OutreachStatus,
} from '../types';

export async function setOutreachStatus(orgId: string, outreach: OutreachStatus) {
  const { error } = await supabase
    .from('organizations')
    .update({ outreach_status: outreach, updated_at: new Date().toISOString() })
    .eq('id', orgId);
  if (error) throw error;
  await supabase.from('activity_log').insert({
    organization_id: orgId,
    action: 'outreach_updated',
    description: `Outreach: ${OUTREACH_STATUS_LABELS[outreach]}`,
    performed_by: 'staff',
  });
}

export async function bulkSetOutreachStatus(orgIds: string[], outreach: OutreachStatus) {
  if (!orgIds.length) return { updated: 0 };

  // .in() puts every id in the request URL. A thousand uuids is ~37KB of query
  // string — past what proxies accept — so the set moves in slices the URL can
  // carry. The activity rows ride in the body and merely follow the same rhythm.
  const CHUNK = 200;
  for (let i = 0; i < orgIds.length; i += CHUNK) {
    const slice = orgIds.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('organizations')
      .update({ outreach_status: outreach, updated_at: new Date().toISOString() })
      .in('id', slice);
    if (error) throw error;

    await supabase.from('activity_log').insert(
      slice.map((organization_id) => ({
        organization_id,
        action: 'outreach_updated',
        description: `Bulk outreach: ${OUTREACH_STATUS_LABELS[outreach]}`,
        performed_by: 'staff',
      })),
    );
  }

  return { updated: orgIds.length };
}

/** Interested NGO — moves to Inbound queue (off outreach kanban) */
export async function markRegisteredInbound(orgId: string) {
  await setOutreachStatus(orgId, 'registered');
}

/** Becomes a paying / active NGOreality customer */
export async function registerAsCustomer(orgId: string) {
  const { error } = await supabase
    .from('organizations')
    .update({
      is_customer: true,
      status: 'onboarding',
      onboarding_stage: 'intake',
      outreach_status: 'not_applicable',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);
  if (error) throw error;

  const { count } = await supabase
    .from('service_engagements')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('status', ['lead', 'active']);

  if (!count) {
    await supabase.from('service_engagements').insert({
      organization_id: orgId,
      engagement_type: 'verification',
      status: 'active',
      started_at: new Date().toISOString(),
    });
  }

  const { count: criteriaCount } = await supabase
    .from('verification_criteria')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId);

  if (!criteriaCount) {
    await supabase.from('verification_criteria').insert(
      DEFAULT_CRITERIA.map((c) => ({ organization_id: orgId, ...c })),
    );
  }

  await ensurePaymentReference(orgId);

  await supabase.from('activity_log').insert({
    organization_id: orgId,
    action: 'customer_registered',
    description: 'Registered as NGOreality customer',
    performed_by: 'staff',
  });
}

export type BulkEmailResult = {
  queued: number;
  skippedNoEmail: number;
  errors: string[];
  flushError: string | null;
};

export async function queueOutreachBulkEmail(
  orgs: Pick<Organization, 'id' | 'name' | 'email'>[],
  template: OutreachEmailTemplate,
  options?: {
    incidentIdByOrg?: Record<string, string>;
    errorDetailByOrg?: Record<string, string>;
    subjectDraft?: string;
    bodyDraft?: string;
  },
): Promise<BulkEmailResult> {
  const result: BulkEmailResult = {
    queued: 0,
    skippedNoEmail: 0,
    errors: [],
    flushError: null,
  };

  const subjectDraft = options?.subjectDraft?.trim();
  const bodyDraft = options?.bodyDraft?.trim();

  for (const org of orgs) {
    if (!org.email?.trim()) {
      result.skippedNoEmail += 1;
      continue;
    }
    const { error } = await queueNotification({
      organizationId: org.id,
      template,
      recipientEmail: org.email,
      organizationName: org.name,
      incidentId: options?.incidentIdByOrg?.[org.id],
      extra: options?.errorDetailByOrg?.[org.id]
        ? { errorDetail: options.errorDetailByOrg[org.id] }
        : undefined,
      subjectOverride: subjectDraft || undefined,
      bodyOverride: bodyDraft || undefined,
    });
    if (error) result.errors.push(`${org.name}: ${error}`);
    else result.queued += 1;
  }

  return result;
}

/** Queue outreach emails for selected orgs — does not deliver until Email notifications / worker processes the queue. */
export async function sendOutreachForColumn(
  orgs: Pick<Organization, 'id' | 'name' | 'email' | 'outreach_status'>[],
  column: OutreachStatus,
  options?: {
    incidentIdByOrg?: Record<string, string>;
    errorDetailByOrg?: Record<string, string>;
    subjectDraft?: string;
    bodyDraft?: string;
  },
): Promise<BulkEmailResult> {
  const template = OUTREACH_EMAIL_BY_COLUMN[column];
  if (!template) {
    return { queued: 0, skippedNoEmail: 0, errors: ['No email template for this column'], flushError: null };
  }
  return queueOutreachBulkEmail(orgs, template, options);
}

export function draftOutreachEmailForOrg(
  template: OutreachEmailTemplate,
  organizationName: string,
  extra?: Record<string, string>,
) {
  return previewOutreachEmail(template, organizationName, extra);
}

/** Move listed leads without a website into the No website column (cap 100). */
export async function syncNoWebsiteLeads(limit = 100): Promise<number> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('status', 'listed')
    .eq('is_customer', false)
    .in('outreach_status', ['not_contacted', 'contacted', 'follow_up'])
    .or('website_url.is.null,website_url.eq.""')
    .limit(limit);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id);
  if (!ids.length) return 0;
  await bulkSetOutreachStatus(ids, 'no_website');
  return ids.length;
}

/** Move listed leads with open website incidents into Website issues column. */
export async function syncWebsiteIssueLeads(limit = 100): Promise<number> {
  const { data: incidents, error: incErr } = await supabase
    .from('website_incidents')
    .select('organization_id')
    .is('closed_at', null)
    .limit(limit);
  if (incErr) throw incErr;
  const orgIds = [...new Set((incidents ?? []).map((i) => i.organization_id))];
  if (!orgIds.length) return 0;

  const { data: orgs, error: orgErr } = await supabase
    .from('organizations')
    .select('id')
    .in('id', orgIds)
    .eq('status', 'listed')
    .eq('is_customer', false);
  if (orgErr) throw orgErr;
  const ids = (orgs ?? []).map((o) => o.id);
  if (!ids.length) return 0;
  await bulkSetOutreachStatus(ids, 'website_issues');
  return ids.length;
}
