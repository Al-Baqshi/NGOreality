/**
 * Data hooks for the Organisation Workspace (the Go CRM).
 *
 * Kept separate from `useNgoPortal`, which reads Supabase: the workspace is a
 * different service with a different database, and conflating them would blur
 * the boundary that keeps beneficiary records out of the public registry.
 */

import { useCallback, useEffect, useState } from 'react';
import * as crm from '../lib/crmApi';
import type {
  WorkspaceCase,
  WorkspaceCaseNote,
  WorkspaceClient,
  WorkspaceSession,
  WorkspaceStats,
} from '../types/workspace';

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

function messageOf(err: unknown): string {
  if (err instanceof crm.CrmApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

/**
 * Resolves who the caller is inside the workspace.
 *
 * A 403 is a normal state, not a failure: it means this user has no workspace
 * yet, which is exactly when the signup card should appear.
 */
export function useWorkspaceIdentity() {
  const [state, setState] = useState<AsyncState<crm.CrmIdentity>>({
    data: null,
    loading: true,
    error: null,
  });
  const [noWorkspace, setNoWorkspace] = useState(false);

  const refetch = useCallback(async () => {
    if (!crm.CRM_API_CONFIGURED) {
      setState({ data: null, loading: false, error: null });
      setNoWorkspace(true);
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await crm.getIdentity();
      setNoWorkspace(false);
      setState({ data, loading: false, error: null });
    } catch (err) {
      if (err instanceof crm.CrmApiError && err.status === 403) {
        setNoWorkspace(true);
        setState({ data: null, loading: false, error: null });
        return;
      }
      setState({ data: null, loading: false, error: messageOf(err) });
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, noWorkspace, refetch };
}

export function useWorkspaceStats(from?: string, to?: string) {
  const [state, setState] = useState<AsyncState<WorkspaceStats>>({
    data: null,
    loading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ data: await crm.getStats(from, to), loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: messageOf(err) });
    }
  }, [from, to]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, refetch };
}

/**
 * Paginated client list. Paging happens on the server — the caseload can be
 * thousands of records and must never be pulled into the browser wholesale.
 */
export function useClients(params: crm.ClientListParams) {
  const [state, setState] = useState<AsyncState<crm.Page<WorkspaceClient>>>({
    data: null,
    loading: true,
    error: null,
  });

  const { search, status, limit, offset } = params;

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await crm.listClients({ search, status, limit, offset });
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: messageOf(err) });
    }
  }, [search, status, limit, offset]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, refetch };
}

export function useClient(id: string | undefined) {
  const [state, setState] = useState<AsyncState<WorkspaceClient>>({
    data: null,
    loading: Boolean(id),
    error: null,
  });

  const refetch = useCallback(async () => {
    if (!id) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ data: await crm.getClient(id), loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: messageOf(err) });
    }
  }, [id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, refetch };
}

export function useCases(params: crm.CaseListParams) {
  const [state, setState] = useState<AsyncState<crm.Page<WorkspaceCase>>>({
    data: null,
    loading: true,
    error: null,
  });

  const { client_id: clientId, status, assigned_to: assignedTo, search, limit, offset } = params;

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await crm.listCases({
        client_id: clientId,
        status,
        assigned_to: assignedTo,
        search,
        limit,
        offset,
      });
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: messageOf(err) });
    }
  }, [clientId, status, assignedTo, search, limit, offset]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, refetch };
}

export function useCase(id: string | undefined) {
  const [state, setState] = useState<AsyncState<WorkspaceCase>>({
    data: null,
    loading: Boolean(id),
    error: null,
  });

  const refetch = useCallback(async () => {
    if (!id) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ data: await crm.getCase(id), loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: messageOf(err) });
    }
  }, [id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, refetch };
}

export function useCaseNotes(caseId: string | undefined) {
  const [state, setState] = useState<AsyncState<WorkspaceCaseNote[]>>({
    data: null,
    loading: Boolean(caseId),
    error: null,
  });

  const refetch = useCallback(async () => {
    if (!caseId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { items } = await crm.listCaseNotes(caseId);
      setState({ data: items, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: messageOf(err) });
    }
  }, [caseId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, refetch };
}

export function useSessions(params: crm.SessionListParams) {
  const [state, setState] = useState<AsyncState<crm.Page<WorkspaceSession>>>({
    data: null,
    loading: true,
    error: null,
  });

  const { client_id: clientId, case_id: caseId, from, to, limit, offset } = params;

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await crm.listSessions({
        client_id: clientId,
        case_id: caseId,
        from,
        to,
        limit,
        offset,
      });
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: messageOf(err) });
    }
  }, [clientId, caseId, from, to, limit, offset]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, refetch };
}

/**
 * Drives the "create your workspace" card.
 *
 * Eligibility is checked separately from creation so the portal can decide
 * whether to show the button at all, rather than surfacing a 403 to someone
 * who was never able to do it.
 */
export function useWorkspaceSignup(organizationId: string | undefined) {
  const [eligibility, setEligibility] = useState<crm.SignupEligibility | null>(null);
  const [loading, setLoading] = useState(Boolean(organizationId));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!organizationId || !crm.CRM_API_CONFIGURED) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setEligibility(await crm.checkSignupEligibility(organizationId));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void check();
  }, [check]);

  const create = useCallback(async (): Promise<crm.SignupResult | null> => {
    if (!organizationId) return null;
    setCreating(true);
    setError(null);
    try {
      const result = await crm.createWorkspace(organizationId);
      await check();
      return result;
    } catch (err) {
      setError(messageOf(err));
      return null;
    } finally {
      setCreating(false);
    }
  }, [organizationId, check]);

  return { eligibility, loading, creating, error, create, refetch: check };
}
