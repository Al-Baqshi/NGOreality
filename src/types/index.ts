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
  created_at: string;
  updated_at: string;
}

export type OrgStatus = 'onboarding' | 'under_review' | 'verified' | 'active' | 'lapsed';
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
  onboarding: 'Onboarding',
  under_review: 'Under Review',
  verified: 'Verified',
  active: 'Active',
  lapsed: 'Lapsed',
};

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
