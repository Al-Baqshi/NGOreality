import { supabase } from './supabase';
import { ensurePaymentReference } from './payments';
import { DEFAULT_CRITERIA, OUTREACH_STATUS_LABELS, type OutreachStatus } from '../types';

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
