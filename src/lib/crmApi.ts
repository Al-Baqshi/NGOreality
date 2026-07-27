/**
 * Client for the Go CRM service (Organisation Workspace).
 *
 * The CRM runs on its own Postgres, separate from Supabase — see
 * docs/CRM_SAAS.md. Authentication reuses the Supabase access token the user
 * already holds, so there is no second login.
 */

import { supabase } from './supabase';
import type {
  WorkspaceCase,
  WorkspaceCaseNote,
  WorkspaceClient,
  WorkspaceConsent,
  WorkspaceSession,
  WorkspaceStats,
  OrganizationRole,
} from '../types/workspace';

const BASE_URL = (import.meta.env.VITE_CRM_API_URL ?? '').replace(/\/$/, '');

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

async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | undefined | null> } = {},
): Promise<T> {
  if (!CRM_API_CONFIGURED) {
    throw new CrmApiError('CRM API is not configured (set VITE_CRM_API_URL)', 0);
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
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
