export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string;
  mission_statement: string;
  category: string;
  location: string;
  country: string;
  website_url: string;
  email: string;
  phone: string;
  status: OrgStatus;
  verification_level: VerificationLevel;
  onboarding_stage: string;
  logo_url: string;
  tags: string[];
  source_registry: string;
  external_id: string;
  registry_url: string;
  charity_registration_number: string;
  nzbn: string;
  imported_at: string | null;
  outreach_status: OutreachStatus;
  created_at: string;
  updated_at: string;
}

export type OrgStatus =
  | 'listed'
  | 'onboarding'
  | 'under_review'
  | 'verified'
  | 'active'
  | 'lapsed';

export type OutreachStatus =
  | 'not_contacted'
  | 'contacted'
  | 'responded'
  | 'declined'
  | 'not_applicable';
export type VerificationLevel = 'none' | 'verified' | 'transparent_financial';

export interface Contact {
  id: string;
  organization_id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  is_primary: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface VerificationCriterion {
  id: string;
  organization_id: string;
  criterion_key: string;
  criterion_label: string;
  status: 'pass' | 'fail' | 'pending';
  notes: string;
  evaluated_at: string | null;
  created_at: string;
}

export interface VerificationBadge {
  id: string;
  organization_id: string;
  verification_id: string;
  level: VerificationLevel;
  issued_at: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  organization_id: string;
  action: string;
  description: string;
  performed_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface InquirySubmission {
  id: string;
  organization_id: string | null;
  organization_name: string;
  contact_name: string;
  email: string;
  phone: string;
  message: string;
  category: string;
  status: 'new' | 'contacted' | 'qualified' | 'closed';
  created_at: string;
}

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  listed: 'Listed (registry)',
  onboarding: 'Onboarding',
  under_review: 'Under Review',
  verified: 'Verified',
  active: 'Active',
  lapsed: 'Lapsed',
};

export const OUTREACH_STATUS_LABELS: Record<OutreachStatus, string> = {
  not_contacted: 'Not contacted',
  contacted: 'Contacted',
  responded: 'Responded',
  declined: 'Declined',
  not_applicable: 'N/A',
};

export const REGISTRY_SOURCE_LABELS: Record<string, string> = {
  nz_charities_register: 'NZ Charities Register',
};

export function isNgorealityVerified(org: Pick<Organization, 'status' | 'verification_level'>): boolean {
  return (
    (org.status === 'verified' || org.status === 'active') &&
    org.verification_level !== 'none'
  );
}

export function isRegistryListed(org: Pick<Organization, 'status' | 'source_registry'>): boolean {
  return org.status === 'listed' && Boolean(org.source_registry);
}

export const VERIFICATION_LEVEL_LABELS: Record<VerificationLevel, string> = {
  none: 'None',
  verified: 'Verified',
  transparent_financial: 'Transparent Financial',
};

export const CATEGORIES = [
  'Education',
  'Health',
  'Environment',
  'Social Services',
  'Arts & Culture',
  'Human Rights',
  'Community Development',
  'Animal Welfare',
  'Disaster Relief',
  'Youth Development',
  'Other',
];

export const DEFAULT_CRITERIA: Omit<VerificationCriterion, 'id' | 'organization_id' | 'created_at'>[] = [
  { criterion_key: 'website_functional', criterion_label: 'Website is functional and live', status: 'pending', notes: '', evaluated_at: null },
  { criterion_key: 'mission_clear', criterion_label: 'Mission statement is clear and present', status: 'pending', notes: '', evaluated_at: null },
  { criterion_key: 'contact_accessible', criterion_label: 'Contact information is accessible', status: 'pending', notes: '', evaluated_at: null },
  { criterion_key: 'mobile_responsive', criterion_label: 'Website is mobile responsive', status: 'pending', notes: '', evaluated_at: null },
  { criterion_key: 'legal_pages', criterion_label: 'Privacy policy and terms are present', status: 'pending', notes: '', evaluated_at: null },
  { criterion_key: 'donation_transparency', criterion_label: 'Donation usage is clearly explained', status: 'pending', notes: '', evaluated_at: null },
  { criterion_key: 'uptime_reliable', criterion_label: 'Website has reliable uptime', status: 'pending', notes: '', evaluated_at: null },
  { criterion_key: 'communication_clear', criterion_label: 'Communication is clear and professional', status: 'pending', notes: '', evaluated_at: null },
];

export const FINANCIAL_CRITERIA: Omit<VerificationCriterion, 'id' | 'organization_id' | 'created_at'>[] = [
  { criterion_key: 'financial_public', criterion_label: 'Financial records are publicly accessible', status: 'pending', notes: '', evaluated_at: null },
  { criterion_key: 'income_reported', criterion_label: 'Income sources are disclosed', status: 'pending', notes: '', evaluated_at: null },
  { criterion_key: 'expenditure_breakdown', criterion_label: 'Expenditure breakdown is provided', status: 'pending', notes: '', evaluated_at: null },
  { criterion_key: 'independent_audit', criterion_label: 'Independent audit or review exists', status: 'pending', notes: '', evaluated_at: null },
  { criterion_key: 'regular_reporting', criterion_label: 'Regular reporting cadence is maintained', status: 'pending', notes: '', evaluated_at: null },
  { criterion_key: 'donor_traceability', criterion_label: 'Donor acknowledgment and traceability', status: 'pending', notes: '', evaluated_at: null },
];

export type MembershipStatus = 'active' | 'expired' | 'pending_renewal';

export interface OrganizationMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: 'owner' | 'admin';
  created_at: string;
}

export interface OrganizationMembership {
  id: string;
  organization_id: string;
  started_at: string;
  expires_at: string;
  status: MembershipStatus;
  created_at: string;
}

export type BadgeRequestType = 'new_badge' | 'renewal' | 'reissue';
export type BadgeRequestStatus = 'pending' | 'in_review' | 'approved' | 'rejected';

export interface BadgeRequest {
  id: string;
  organization_id: string;
  requested_by: string;
  request_type: BadgeRequestType;
  status: BadgeRequestStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export const BADGE_REQUEST_TYPE_LABELS: Record<BadgeRequestType, string> = {
  new_badge: 'New Reality Badge',
  renewal: 'Annual membership renewal',
  reissue: 'Badge reissue',
};

export const BADGE_REQUEST_STATUS_LABELS: Record<BadgeRequestStatus, string> = {
  pending: 'Pending',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
};

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featured_image_url: string;
  author: string;
  status: 'published' | 'draft';
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
