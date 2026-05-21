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
  is_customer: boolean;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentProductType = 'verification_annual' | 'monitoring_monthly';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
export type PaymentMethod = 'stripe' | 'bank_transfer' | 'manual';

export interface OrganizationPayment {
  id: string;
  organization_id: string;
  product_type: PaymentProductType;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  payment_method: PaymentMethod;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  bank_transfer_reference: string | null;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  notes: string;
  recorded_by: string;
  created_at: string;
  updated_at: string;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

export const PAYMENT_PRODUCT_LABELS: Record<PaymentProductType, string> = {
  verification_annual: 'Reality Badge — $50/year',
  monitoring_monthly: 'Monitoring — $13/month',
};

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
  | 'follow_up'
  | 'registered'
  | 'responded'
  | 'declined'
  | 'not_applicable';

/** Kanban columns for registry leads (listed, not yet inbound/customer) */
export const OUTREACH_KANBAN_STATUSES: OutreachStatus[] = [
  'not_contacted',
  'contacted',
  'follow_up',
  'declined',
];

/** Inbound queue (left kanban, not customers yet) */
export const OUTREACH_INBOUND_STATUSES: OutreachStatus[] = ['registered', 'responded'];
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
  not_contacted: 'Lead — not contacted',
  contacted: 'Contacted',
  follow_up: 'Follow-up',
  registered: 'Registered (inbound)',
  responded: 'Registered (inbound)',
  declined: 'Declined',
  not_applicable: 'N/A',
};

export function isOutreachLead(org: Pick<Organization, 'status' | 'is_customer'>): boolean {
  return org.status === 'listed' && !org.is_customer;
}

export function isInboundLead(org: Pick<Organization, 'outreach_status' | 'status' | 'is_customer'>): boolean {
  return (
    !org.is_customer &&
    org.status === 'listed' &&
    (org.outreach_status === 'registered' || org.outreach_status === 'responded')
  );
}

export function isCrmCustomer(org: Pick<Organization, 'is_customer' | 'status'>): boolean {
  return org.is_customer || (org.status !== 'listed' && org.status !== 'lapsed');
}

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

export type EngagementType = 'verification' | 'renewal' | 'consulting' | 'monitoring';
export type EngagementStatus = 'lead' | 'active' | 'completed' | 'cancelled';
export type StaffTaskType = 'call' | 'email' | 'review' | 'other';
export type StaffTaskStatus = 'open' | 'done' | 'cancelled';

export interface ServiceEngagement {
  id: string;
  organization_id: string;
  engagement_type: EngagementType;
  status: EngagementStatus;
  fee_cents: number;
  currency: string;
  notes: string;
  next_follow_up_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffTask {
  id: string;
  organization_id: string;
  engagement_id: string | null;
  title: string;
  task_type: StaffTaskType;
  status: StaffTaskStatus;
  due_date: string;
  notes: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = {
  verification: 'Verification',
  renewal: 'Renewal',
  consulting: 'Consulting',
  monitoring: 'Monitoring',
};

export const ENGAGEMENT_STATUS_LABELS: Record<EngagementStatus, string> = {
  lead: 'Lead',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const STAFF_TASK_TYPE_LABELS: Record<StaffTaskType, string> = {
  call: 'Call',
  email: 'Email',
  review: 'Review',
  other: 'Other',
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

// ─── Business plan ─────────────────────────────────────────────────────────

export type BusinessPlanMetric =
  | 'total_revenue_cents'
  | 'badge_revenue_cents'
  | 'monitoring_revenue_cents'
  | 'badges_sold'
  | 'monitoring_subs'
  | 'expense_cents'
  | 'net_cents';

/** Metrics whose values are cents (formatted as currency in the UI). */
export const MONEY_METRICS: ReadonlySet<BusinessPlanMetric> = new Set<BusinessPlanMetric>([
  'total_revenue_cents',
  'badge_revenue_cents',
  'monitoring_revenue_cents',
  'expense_cents',
  'net_cents',
]);

export const BUSINESS_PLAN_METRIC_LABELS: Record<BusinessPlanMetric, string> = {
  total_revenue_cents: 'Total revenue',
  badge_revenue_cents: 'Badge revenue',
  monitoring_revenue_cents: 'Monitoring revenue',
  badges_sold: 'Badges sold',
  monitoring_subs: 'Monitoring subscriptions',
  expense_cents: 'Expenses',
  net_cents: 'Net (revenue − expenses)',
};

/** Display order for the monthly plan grid. */
export const BUSINESS_PLAN_METRIC_ORDER: BusinessPlanMetric[] = [
  'total_revenue_cents',
  'badge_revenue_cents',
  'monitoring_revenue_cents',
  'badges_sold',
  'monitoring_subs',
  'expense_cents',
  'net_cents',
];

export interface BusinessPlanTarget {
  id: string;
  period: string; // YYYY-MM-01
  metric: BusinessPlanMetric;
  expected_value: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessPlanActual {
  period: string; // YYYY-MM-01
  badge_revenue_cents: number;
  monitoring_revenue_cents: number;
  total_revenue_cents: number;
  badges_sold: number;
  monitoring_subs: number;
  expense_cents: number;
  net_cents: number;
}

export interface BusinessExpense {
  id: string;
  incurred_on: string; // YYYY-MM-DD
  category: string;
  amount_cents: number;
  currency: string;
  vendor: string;
  notes: string;
  created_at: string;
  updated_at: string;
}
