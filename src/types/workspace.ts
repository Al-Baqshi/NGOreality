/**
 * Organisation Workspace — beneficiary & case management types.
 *
 * Mirrors supabase/migrations/20260728090000_027_workspace_case_management.sql.
 * Tenant scoping is `organization_id` on every row, enforced by RLS.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type OrganizationRole =
  | 'owner'
  | 'admin'
  | 'caseworker'
  | 'volunteer'
  | 'viewer';

export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  caseworker: 'Caseworker',
  volunteer: 'Volunteer',
  viewer: 'Viewer',
};

export const ORGANIZATION_ROLE_DESCRIPTIONS: Record<OrganizationRole, string> = {
  owner: 'Full access, including billing and ownership transfer.',
  admin: 'Full access to client records, settings, seats and exports.',
  caseworker: 'Full case work, including sensitive details and restricted notes.',
  volunteer: 'Can record clients and sessions. Cannot see sensitive details.',
  viewer: 'Read-only. Cannot see sensitive details.',
};

/** Roles that may read `workspace_client_sensitive` and restricted notes. */
export const SENSITIVE_ACCESS_ROLES: OrganizationRole[] = [
  'owner',
  'admin',
  'caseworker',
];

/** Roles that may create or edit client and case data. */
export const WORKSPACE_WRITE_ROLES: OrganizationRole[] = [
  'owner',
  'admin',
  'caseworker',
  'volunteer',
];

export const WORKSPACE_ADMIN_ROLES: OrganizationRole[] = ['owner', 'admin'];

/**
 * UI-side mirrors of the SQL helpers. These hide controls; they do not grant
 * anything — RLS is the actual boundary.
 */
export function canAccessSensitive(role: OrganizationRole | null): boolean {
  return role !== null && SENSITIVE_ACCESS_ROLES.includes(role);
}

export function canWriteWorkspace(role: OrganizationRole | null): boolean {
  return role !== null && WORKSPACE_WRITE_ROLES.includes(role);
}

export function isWorkspaceAdmin(role: OrganizationRole | null): boolean {
  return role !== null && WORKSPACE_ADMIN_ROLES.includes(role);
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export type WorkspaceClientStatus = 'active' | 'inactive' | 'closed';

export interface WorkspaceClient {
  id: string;
  organization_id: string;
  reference_code: string | null;
  given_name: string;
  family_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  status: WorkspaceClientStatus;
  custom: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  /**
   * Restricted attributes, returned by `GET /v1/clients/{id}` only for roles
   * permitted to see them.
   *
   * Absent — not null, not blanked — for volunteer and viewer, because the
   * server never selects those columns for them. Treat `undefined` as "you
   * cannot see this", never as "there is none recorded".
   */
  sensitive?: WorkspaceClientSensitive;
}

/** Separate table with a tighter policy — may be absent for a given client. */
export interface WorkspaceClientSensitive {
  client_id: string;
  organization_id: string;
  ethnicity: string | null;
  iwi_affiliation: string | null;
  gender: string | null;
  health_notes: string | null;
  legal_status: string | null;
  risk_flags: string[];
  data: Record<string, unknown>;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Consent (Privacy Act 2020 — IPP3 / IPP11)
// ---------------------------------------------------------------------------

export type ConsentMethod = 'verbal' | 'written' | 'digital';

export interface WorkspaceConsent {
  id: string;
  organization_id: string;
  client_id: string;
  purpose: string;
  method: ConsentMethod;
  evidence: string | null;
  granted_at: string;
  expires_at: string | null;
  withdrawn_at: string | null;
  collected_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export type WorkspaceCaseStatus = 'open' | 'on_hold' | 'closed';
export type WorkspaceCasePriority = 'low' | 'normal' | 'high' | 'urgent';

export interface WorkspaceCase {
  id: string;
  organization_id: string;
  client_id: string;
  reference_code: string | null;
  title: string;
  service_type: string | null;
  status: WorkspaceCaseStatus;
  priority: WorkspaceCasePriority;
  assigned_to: string | null;
  opened_at: string;
  due_at: string | null;
  closed_at: string | null;
  closure_reason: string | null;
  outcome: string | null;
  custom: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type NoteVisibility = 'team' | 'restricted';

/** Append-only: the database has no UPDATE or DELETE policy for these. */
export interface WorkspaceCaseNote {
  id: string;
  organization_id: string;
  case_id: string;
  author_id: string | null;
  body: string;
  visibility: NoteVisibility;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Service delivery
// ---------------------------------------------------------------------------

export type DeliveryMode = 'in_person' | 'phone' | 'video' | 'email' | 'other';

export interface WorkspaceSession {
  id: string;
  organization_id: string;
  client_id: string;
  case_id: string | null;
  occurred_at: string;
  service_type: string | null;
  delivery_mode: DeliveryMode | null;
  duration_minutes: number | null;
  attendees: number | null;
  outcome: string | null;
  notes: string | null;
  custom: Record<string, unknown>;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceDocument {
  id: string;
  organization_id: string;
  client_id: string | null;
  case_id: string | null;
  storage_path: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  sensitivity: NoteVisibility;
  uploaded_by: string | null;
  uploaded_at: string;
}

// ---------------------------------------------------------------------------
// Custom fields — an escape hatch, deliberately not a table builder
// ---------------------------------------------------------------------------

export type WorkspaceFieldEntity = 'client' | 'case' | 'session';

export type WorkspaceFieldType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'multi_select';

export interface WorkspaceFieldDef {
  id: string;
  organization_id: string;
  entity: WorkspaceFieldEntity;
  key: string;
  label: string;
  data_type: WorkspaceFieldType;
  options: string[];
  required: boolean;
  sensitive: boolean;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Settings & audit
// ---------------------------------------------------------------------------

export interface WorkspaceSettings {
  organization_id: string;
  client_retention_months: number;
  collection_notice: string;
  data_region: string;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Per-tenant service catalogue, so each NGO names its own programmes rather
 * than using a fixed list. Lives in the Go CRM.
 */
export interface ServiceType {
  id: string;
  key: string;
  label: string;
  active: boolean;
  sort_order: number;
  created_at: string;
}

/**
 * Settings as returned by the Go CRM (`GET /v1/settings`).
 *
 * Distinct from `WorkspaceSettings` above, which is the Supabase-side shape:
 * the CRM keeps tenant identity and residency in its control plane, so its
 * settings row holds only what the NGO itself configures.
 */
export interface CrmSettings {
  client_retention_months: number;
  collection_notice: string;
  case_reference_prefix: string;
  branding: Record<string, unknown>;
  updated_at: string;
}

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'export'
  | 'login';

export interface WorkspaceAuditEntry {
  id: string;
  organization_id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: AuditAction;
  diff: Record<string, unknown>;
  occurred_at: string;
}

// ---------------------------------------------------------------------------
// Reporting — shape returned by the workspace_stats() RPC
// ---------------------------------------------------------------------------

export interface WorkspaceStats {
  clients_total: number;
  clients_active: number;
  clients_new_in_period: number;
  cases_open: number;
  cases_closed_in_period: number;
  cases_overdue: number;
  sessions_in_period: number;
  session_minutes_in_period: number;
  clients_served_in_period: number;
  sessions_by_service_type: Record<string, number>;
  period_from: string;
  period_to: string;
}
