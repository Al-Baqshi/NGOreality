import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OrgManagerInfo = {
  email: string;
  full_name: string;
  role: string;
};

export type LinkResult = {
  status: 'linked' | 'already_managed' | 'error';
  organizationId: string | null;
  managers: OrgManagerInfo[];
  error: string | null;
};

/**
 * Registration details captured before the email-confirmation round-trip.
 * Stored in auth user metadata at signUp() so the link/provision step can be
 * resumed on first login even though the original browser session is gone.
 */
export type PendingRegistration =
  | { mode: 'existing'; organizationId: string; organizationName: string }
  | {
      mode: 'new';
      organizationName: string;
      contactName: string;
      category: string;
      location: string;
      websiteUrl: string;
    };

const okStatuses = new Set(['claimed', 'joined', 'already_member', 'created']);

function rpcError(message: string): LinkResult {
  return { status: 'error', organizationId: null, managers: [], error: message };
}

/** Claim an organisation from the directory. The RPC links the caller as
 *  owner when the organisation has no managers yet; otherwise it reports who
 *  already manages it so the caller can choose to join or contact them. */
export async function linkExistingOrganization(organizationId: string): Promise<LinkResult> {
  const { data, error } = await supabase.rpc('claim_organization', {
    p_organization_id: organizationId,
  });

  if (error) return rpcError(error.message);

  if (data?.status === 'already_managed') {
    return {
      status: 'already_managed',
      organizationId,
      managers: (data.managers ?? []) as OrgManagerInfo[],
      error: null,
    };
  }

  if (okStatuses.has(data?.status)) {
    return { status: 'linked', organizationId, managers: [], error: null };
  }

  if (data?.status === 'not_found') {
    return rpcError('Organization not found. Search again or register as a new organization.');
  }

  return rpcError(data?.message ?? 'Could not link the organization. Please try again.');
}

/** Join an organisation that already has managers ("keep going" choice). */
export async function joinOrganization(organizationId: string): Promise<LinkResult> {
  const { data, error } = await supabase.rpc('join_organization', {
    p_organization_id: organizationId,
  });

  if (error) return rpcError(error.message);

  if (okStatuses.has(data?.status)) {
    return { status: 'linked', organizationId, managers: [], error: null };
  }

  return rpcError(data?.message ?? 'Could not join the organization. Please try again.');
}

export async function provisionNgoOrganization(input: {
  organizationName: string;
  contactName: string;
  category: string;
  location: string;
  websiteUrl: string;
}): Promise<LinkResult> {
  const { data, error } = await supabase.rpc('register_new_organization', {
    p_name: input.organizationName,
    p_contact_name: input.contactName,
    p_category: input.category,
    p_location: input.location,
    p_website_url: input.websiteUrl,
  });

  if (error) return rpcError(error.message);

  if (data?.status === 'created') {
    return { status: 'linked', organizationId: data.organization_id ?? null, managers: [], error: null };
  }

  return rpcError(data?.message ?? 'Could not create the organization. Please try again.');
}

export function getPendingRegistration(user: User | null | undefined): PendingRegistration | null {
  const pending = user?.user_metadata?.pending_registration as PendingRegistration | undefined;
  if (!pending || typeof pending !== 'object') return null;
  if (pending.mode === 'existing' && pending.organizationId) return pending;
  if (pending.mode === 'new' && pending.organizationName) return pending;
  return null;
}

export async function clearPendingRegistration(): Promise<void> {
  await supabase.auth.updateUser({ data: { pending_registration: null } });
}

/**
 * Finish a registration that was interrupted by the email-confirmation
 * round-trip. Returns null when there is nothing pending. On
 * 'already_managed' the pending metadata is kept so the signup page can offer
 * the join/contact choice.
 */
export async function resumePendingRegistration(
  user: User | null | undefined,
): Promise<(LinkResult & { pending: PendingRegistration }) | null> {
  const pending = getPendingRegistration(user);
  if (!pending) return null;

  const result =
    pending.mode === 'existing'
      ? await linkExistingOrganization(pending.organizationId)
      : await provisionNgoOrganization({
          organizationName: pending.organizationName,
          contactName: pending.contactName,
          category: pending.category,
          location: pending.location,
          websiteUrl: pending.websiteUrl,
        });

  if (result.status === 'linked') {
    await clearPendingRegistration();
  }

  return { ...result, pending };
}
