import type { OrganizationMembership } from '../types';

export type MembershipDisplayStatus = 'active' | 'expiring_soon' | 'expired' | 'pending_renewal' | 'none';

export function getLatestMembership(
  memberships: OrganizationMembership[],
): OrganizationMembership | null {
  if (memberships.length === 0) return null;
  return [...memberships].sort(
    (a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime(),
  )[0];
}

export function getMembershipDisplayStatus(
  membership: OrganizationMembership | null,
): MembershipDisplayStatus {
  if (!membership) return 'none';
  if (membership.status === 'pending_renewal') return 'pending_renewal';

  const expiresAt = new Date(membership.expires_at);
  const now = new Date();
  if (expiresAt < now || membership.status === 'expired') return 'expired';

  const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry <= 60) return 'expiring_soon';
  return 'active';
}

export function formatMembershipDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function daysUntilExpiry(expiresAt: string): number {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipDisplayStatus, string> = {
  active: 'Active membership',
  expiring_soon: 'Renewal due soon',
  expired: 'Membership expired',
  pending_renewal: 'Renewal in progress',
  none: 'No membership on file',
};
