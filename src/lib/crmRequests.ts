import { supabase } from './supabase';
import type { BadgeRequestStatus, NgoSetupRequestStatus } from '../types';

/**
 * Staff actions on NGO-submitted requests. Updating `status` is enough to
 * inform the NGO: the on_*_status_change triggers (migration 023) insert the
 * portal notification for them — do not queue one here as well.
 */

export async function updateBadgeRequestStatus(
  requestId: string,
  organizationId: string,
  status: BadgeRequestStatus,
): Promise<string | null> {
  const { error } = await supabase
    .from('badge_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) return error.message;

  await supabase.from('activity_log').insert({
    organization_id: organizationId,
    action: 'badge_request_status',
    description: `Badge request marked ${status.replace('_', ' ')}`,
    performed_by: 'staff',
    metadata: { badge_request_id: requestId, status },
  });
  return null;
}

export async function updateSetupRequestStatus(
  requestId: string,
  organizationId: string,
  status: NgoSetupRequestStatus,
): Promise<string | null> {
  const { error } = await supabase
    .from('ngo_setup_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) return error.message;

  await supabase.from('activity_log').insert({
    organization_id: organizationId,
    action: 'setup_request_status',
    description: `Setup request marked ${status.replace('_', ' ')}`,
    performed_by: 'staff',
    metadata: { setup_request_id: requestId, status },
  });
  return null;
}
