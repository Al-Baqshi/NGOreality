/**
 * Client for the Go CRM service (Organisation Workspace).
 *
 * The CRM runs on its own Postgres, separate from Supabase — see
 * docs/CRM_SAAS.md. Authentication reuses whichever access token the user
 * already holds, so there is no second login.
 */

import { supabase } from './supabase';
import { getCentralAccessToken } from './baqshiAuth';
import type {
  OrganizationRole,
  ServiceType,
  WorkspaceCase,
  WorkspaceCaseNote,
  WorkspaceClient,
  WorkspaceConsent,
  WorkspaceDocument,
  WorkspaceFieldDef,
  WorkspaceFieldEntity,
  WorkspaceSession,
  CrmSettings,
  WorkspaceStats,
} from '../types/workspace';

/**
 * The CRM service lives on our own domain, not a vendor hostname.
 *
 * api.ngoreality.com is a CNAME we control, so moving off Railway later is a
 * DNS change rather than a rebuild — and any callback URL registered with a
 * payment provider stays valid. The env override remains for staging and local
 * work; production needs no variable set at all.
 */
const DEFAULT_CRM_API_URL = 'https://api.ngoreality.com';

const BASE_URL = (
  (import.meta.env.VITE_CRM_API_URL as string | undefined)?.trim() || DEFAULT_CRM_API_URL
).replace(/\/$/, '');

export const CRM_API_CONFIGURED = BASE_URL !== '';

export class CrmApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CrmApiError';
  }
}

/** Server-paginated list response. */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Identity + capability flags, so the UI hides what the API would refuse. */
export interface CrmIdentity {
  user_id: string;
  email: string;
  role: OrganizationRole;
  tenant: {
    id: string;
    organization_id: string;
    slug: string;
    name: string;
    status: string;
    plan: string;
    seats_purchased: number;
  };
  can_write: boolean;
  can_access_sensitive: boolean;
  is_admin: boolean;
}

/**
 * The tenant to send as X-Tenant-ID when a user has more than one workspace.
 * Unset for the common single-workspace case.
 */
let activeTenantId: string | null = null;

export function setActiveTenant(tenantId: string | null): void {
  activeTenantId = tenantId;
}

/**
 * The bearer token for the CRM API.
 *
 * The Go service verifies both issuers, so either session works. Central goes
 * first because it is the NGO-user path: a client who has signed in centrally
 * should reach their workspace on that identity, not on a stale Supabase
 * session that may map to a different seat. Staff, who have no central session,
 * fall through to Supabase unchanged.
 *
 * getCentralAccessToken() refreshes when the token is missing or near expiry,
 * so callers never have to think about rotation.
 */
async function apiAccessToken(): Promise<string | null> {
  const central = await getCentralAccessToken();
  if (central) return central;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | undefined | null> } = {},
): Promise<T> {
  if (!CRM_API_CONFIGURED) {
    throw new CrmApiError('CRM API is not configured (set VITE_CRM_API_URL)', 0);
  }

  const token = await apiAccessToken();
  if (!token) {
    throw new CrmApiError('Not signed in', 401);
  }

  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (activeTenantId) {
    headers['X-Tenant-ID'] = activeTenantId;
  }

  const response = await fetch(url.toString(), { ...init, headers });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error ??
      `Request failed (${response.status})`;
    throw new CrmApiError(message, response.status);
  }

  return payload as T;
}

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

export interface SignupResult {
  tenant: CrmIdentity['tenant'];
  already_existed: boolean;
  role: OrganizationRole;
}

/**
 * Creates the workspace for an organisation the signed-in user owns or
 * administers. The server re-checks that against Supabase using this user's
 * own token, so passing another organisation's id gets a 403.
 *
 * Safe to call twice — an existing workspace returns `already_existed: true`
 * and grants the caller a seat rather than erroring.
 */
export const createWorkspace = (organizationId: string, name?: string) =>
  request<SignupResult>('/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ organization_id: organizationId, name: name ?? '' }),
  });

export interface SignupEligibility {
  exists: boolean;
  can_create: boolean;
  has_access: boolean;
  tenant?: CrmIdentity['tenant'];
  role?: OrganizationRole;
}

/** Lets the portal show the right thing without attempting provisioning. */
export const checkSignupEligibility = (organizationId: string) =>
  request<SignupEligibility>('/v1/signup/eligibility', {
    query: { organization_id: organizationId },
  });

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const getIdentity = () => request<CrmIdentity>('/v1/me');

export const listWorkspaces = () =>
  request<{ workspaces: { tenant: CrmIdentity['tenant']; role: OrganizationRole }[] }>(
    '/v1/workspaces',
  );

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export interface ClientListParams {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export const listClients = (params: ClientListParams = {}) =>
  request<Page<WorkspaceClient>>('/v1/clients', { query: { ...params } });

export const getClient = (id: string) => request<WorkspaceClient>(`/v1/clients/${id}`);

export const createClient = (input: Partial<WorkspaceClient>) =>
  request<WorkspaceClient>('/v1/clients', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateClient = (id: string, input: Partial<WorkspaceClient>) =>
  request<WorkspaceClient>(`/v1/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export const deleteClient = (id: string) =>
  request<void>(`/v1/clients/${id}`, { method: 'DELETE' });

/** Restricted attributes — the API rejects this for volunteer and viewer. */
export const updateClientSensitive = (
  id: string,
  input: Record<string, unknown>,
) =>
  request<{ status: string }>(`/v1/clients/${id}/sensitive`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });

// ---------------------------------------------------------------------------
// Consents
// ---------------------------------------------------------------------------

export const listConsents = (clientId: string) =>
  request<{ items: WorkspaceConsent[] }>(`/v1/clients/${clientId}/consents`);

export const createConsent = (
  clientId: string,
  input: { purpose: string; method?: string; evidence?: string | null; expires_at?: string | null },
) =>
  request<WorkspaceConsent>(`/v1/clients/${clientId}/consents`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const withdrawConsent = (consentId: string) =>
  request<{ status: string }>(`/v1/consents/${consentId}/withdraw`, { method: 'POST' });

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export interface CaseListParams {
  client_id?: string;
  status?: string;
  assigned_to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const listCases = (params: CaseListParams = {}) =>
  request<Page<WorkspaceCase>>('/v1/cases', { query: { ...params } });

export const getCase = (id: string) => request<WorkspaceCase>(`/v1/cases/${id}`);

export const createCase = (input: Partial<WorkspaceCase>) =>
  request<WorkspaceCase>('/v1/cases', { method: 'POST', body: JSON.stringify(input) });

export const updateCase = (id: string, input: Partial<WorkspaceCase>) =>
  request<WorkspaceCase>(`/v1/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export const deleteCase = (id: string) =>
  request<void>(`/v1/cases/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------------------
// Case notes — append-only; there is deliberately no update or delete
// ---------------------------------------------------------------------------

export const listCaseNotes = (caseId: string) =>
  request<{ items: WorkspaceCaseNote[] }>(`/v1/cases/${caseId}/notes`);

export const createCaseNote = (
  caseId: string,
  input: { body: string; visibility?: 'team' | 'restricted' },
) =>
  request<WorkspaceCaseNote>(`/v1/cases/${caseId}/notes`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface SessionListParams {
  client_id?: string;
  case_id?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export const listSessions = (params: SessionListParams = {}) =>
  request<Page<WorkspaceSession>>('/v1/sessions', { query: { ...params } });

export const createSession = (input: Partial<WorkspaceSession>) =>
  request<WorkspaceSession>('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateSession = (id: string, input: Partial<WorkspaceSession>) =>
  request<WorkspaceSession>(`/v1/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export const deleteSession = (id: string) =>
  request<void>(`/v1/sessions/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export const getStats = (from?: string, to?: string) =>
  request<WorkspaceStats>('/v1/stats', { query: { from, to } });

// ---------------------------------------------------------------------------
// Customisation
// ---------------------------------------------------------------------------

export const listFieldDefs = (entity?: WorkspaceFieldEntity, includeArchived = false) =>
  request<{ items: WorkspaceFieldDef[] }>('/v1/field-defs', {
    query: { entity, include_archived: includeArchived ? 'true' : undefined },
  });

export const createFieldDef = (input: Partial<WorkspaceFieldDef>) =>
  request<WorkspaceFieldDef>('/v1/field-defs', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateFieldDef = (id: string, input: Partial<WorkspaceFieldDef>) =>
  request<WorkspaceFieldDef>(`/v1/field-defs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

/**
 * Archives rather than deletes — values already stored under this key stay in
 * each record's `custom` object, so removing the definition outright would
 * strand data the NGO still relies on.
 */
export const archiveFieldDef = (id: string) =>
  request<{ status: string }>(`/v1/field-defs/${id}`, { method: 'DELETE' });

export const listServiceTypes = (includeInactive = false) =>
  request<{ items: ServiceType[] }>('/v1/service-types', {
    query: { include_inactive: includeInactive ? 'true' : undefined },
  });

export const upsertServiceType = (input: Partial<ServiceType>) =>
  request<ServiceType>('/v1/service-types', {
    method: 'PUT',
    body: JSON.stringify(input),
  });

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const getSettings = () => request<CrmSettings>('/v1/settings');

export const updateSettings = (input: Partial<CrmSettings>) =>
  request<CrmSettings>('/v1/settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const listDocuments = (params: { client_id?: string; case_id?: string } = {}) =>
  request<{ items: WorkspaceDocument[] }>('/v1/documents', { query: { ...params } });

export const createDocument = (input: Partial<WorkspaceDocument>) =>
  request<WorkspaceDocument>('/v1/documents', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const deleteDocument = (id: string) =>
  request<void>(`/v1/documents/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------------------
// Import / export (admin only)
// ---------------------------------------------------------------------------

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/** Posts a raw CSV. Everything commits together — no half-imported caseload. */
export async function importClients(csv: File | string): Promise<ImportResult> {
  const body = typeof csv === 'string' ? csv : await csv.text();
  return request<ImportResult>('/v1/import/clients', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'text/csv' },
  });
}

/**
 * Downloads a CSV export. Returns a Blob rather than triggering navigation,
 * because the request needs an Authorization header.
 */
async function downloadCsv(path: string, query: Record<string, string | undefined>): Promise<Blob> {
  if (!CRM_API_CONFIGURED) {
    throw new CrmApiError('CRM API is not configured (set VITE_CRM_API_URL)', 0);
  }
  const token = await apiAccessToken();
  if (!token) throw new CrmApiError('Not signed in', 401);

  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (activeTenantId) headers['X-Tenant-ID'] = activeTenantId;

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    let message = `Export failed (${response.status})`;
    try {
      message = (JSON.parse(await response.text()) as { error?: string }).error ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new CrmApiError(message, response.status);
  }
  return response.blob();
}

export const exportClientsCsv = () => downloadCsv('/v1/export/clients.csv', {});

export const exportSessionsCsv = (from?: string, to?: string) =>
  downloadCsv('/v1/export/sessions.csv', { from, to });

/** Saves a Blob to the user's machine. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
