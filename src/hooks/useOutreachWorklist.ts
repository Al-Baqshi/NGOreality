import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { OutreachStatus } from '../types';

/**
 * Outreach data at registry scale.
 *
 * Everything here goes through database functions rather than PostgREST table
 * reads, for one reason: the operator needs to act on a SET defined by a filter
 * ("every lead whose site is down"), not on a list of ids the browser happens
 * to have loaded. 29,226 leads cannot be selected client-side, and the previous
 * board's ceiling was 350.
 */

export type OutreachSegment =
  | 'all'
  | 'no_website'
  | 'has_website'
  | 'site_down'
  | 'site_ok'
  | 'never_checked'
  | 'url_invalid';

export interface OutreachSegmentCounts {
  all: number;
  no_website: number;
  has_website: number;
  site_down: number;
  site_ok: number;
  url_invalid: number;
  never_checked: number;
  never_touched: number;
}

export interface OutreachLead {
  id: string;
  name: string;
  slug: string | null;
  website_url: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  category: string | null;
  location: string | null;
  status: string;
  outreach_status: OutreachStatus;
  last_outreach_at: string | null;
  monitor_status: 'up' | 'down' | 'unknown' | 'url_invalid' | null;
  consecutive_failures: number | null;
  incident_opened_at: string | null;
}

export interface OutreachFilters {
  segment: OutreachSegment;
  outreach: OutreachStatus | '';
  q: string;
}

export const OUTREACH_PAGE_SIZE = 50;

/**
 * Segment sizes for the tab badges. Deliberately a separate call from the page:
 * the counts change rarely and re-running them on every page turn would put a
 * full scan behind the Next button.
 */
export function useOutreachSegmentCounts(refreshKey = 0) {
  const [counts, setCounts] = useState<OutreachSegmentCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc('outreach_segment_counts')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else {
          setCounts(data as OutreachSegmentCounts);
          setError(null);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { counts, loading, error };
}

export function useOutreachLeads(filters: OutreachFilters, page: number, refreshKey = 0) {
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { segment, outreach, q } = filters;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    supabase
      .rpc('outreach_leads', {
        p_segment: segment,
        p_outreach: outreach || null,
        p_q: q || null,
        p_limit: OUTREACH_PAGE_SIZE,
        p_offset: (page - 1) * OUTREACH_PAGE_SIZE,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setLeads([]);
          setTotal(0);
        } else {
          const rows = (data ?? []) as (OutreachLead & { total_count: number })[];
          setLeads(rows.map(({ total_count: _ignored, ...lead }) => lead));
          // total_count rides on every row; an empty page means an empty set.
          setTotal(rows.length ? Number(rows[0].total_count) : 0);
          setError(null);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [segment, outreach, q, page, refreshKey]);

  return { leads, total, loading, error };
}

export interface BulkResult {
  matched: number;
  updated: number;
  capped: boolean;
  cap: number;
}

/**
 * Apply a status to every lead matching the filter, minus the ones the operator
 * un-ticked. The filter travels, not the ids — this is what makes "all 14,482"
 * cost the same as one.
 */
export async function bulkSetOutreachByFilter(
  filters: OutreachFilters,
  newStatus: OutreachStatus,
  excludedIds: string[],
): Promise<BulkResult> {
  const { data, error } = await supabase.rpc('outreach_bulk_set_status', {
    p_new_status: newStatus,
    p_segment: filters.segment,
    p_outreach: filters.outreach || null,
    p_q: filters.q || null,
    p_exclude: excludedIds,
  });
  if (error) throw new Error(error.message);
  return data as BulkResult;
}

/**
 * Apply a status to an explicit list of ids.
 *
 * Must NOT be expressed as "the filter minus what I did not tick": the browser
 * only knows one page, so ticking three names inside a 14,482-row segment would
 * exclude fifty and update the other 14,479.
 */
export async function bulkSetOutreachByIds(
  ids: string[],
  newStatus: OutreachStatus,
): Promise<BulkResult> {
  if (!ids.length) return { matched: 0, updated: 0, capped: false, cap: 0 };
  const { data, error } = await supabase.rpc('outreach_set_status_for_ids', {
    p_new_status: newStatus,
    p_ids: ids,
  });
  if (error) throw new Error(error.message);
  return data as BulkResult;
}

/* ---------------------------------------------------------------------- */
/* Selection                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Selection is a description, not a list.
 *
 * 'ids'  — the operator ticked specific rows.
 * 'all'  — the operator chose "select all N matching"; `excluded` holds the few
 *          they then un-ticked. The browser never holds 14,482 uuids, and the
 *          bulk call re-derives the set server-side so it cannot drift from
 *          what the filter says.
 */
export type OutreachSelection =
  | { mode: 'ids'; ids: Set<string> }
  | { mode: 'all'; excluded: Set<string> };

export const EMPTY_SELECTION: OutreachSelection = { mode: 'ids', ids: new Set() };

export function selectionCount(selection: OutreachSelection, total: number): number {
  return selection.mode === 'ids'
    ? selection.ids.size
    : Math.max(0, total - selection.excluded.size);
}

export function isRowSelected(selection: OutreachSelection, id: string): boolean {
  return selection.mode === 'ids' ? selection.ids.has(id) : !selection.excluded.has(id);
}

export function toggleRow(selection: OutreachSelection, id: string): OutreachSelection {
  if (selection.mode === 'ids') {
    const ids = new Set(selection.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    return { mode: 'ids', ids };
  }
  const excluded = new Set(selection.excluded);
  if (excluded.has(id)) excluded.delete(id);
  else excluded.add(id);
  return { mode: 'all', excluded };
}

/** Convenience wrapper so pages do not re-implement the state machine. */
export function useOutreachSelection() {
  const [selection, setSelection] = useState<OutreachSelection>(EMPTY_SELECTION);

  const clear = useCallback(() => setSelection({ mode: 'ids', ids: new Set() }), []);
  const selectAllMatching = useCallback(
    () => setSelection({ mode: 'all', excluded: new Set() }),
    [],
  );
  const toggle = useCallback((id: string) => setSelection((s) => toggleRow(s, id)), []);
  const selectIds = useCallback(
    (ids: string[]) => setSelection({ mode: 'ids', ids: new Set(ids) }),
    [],
  );

  return { selection, setSelection, clear, selectAllMatching, toggle, selectIds };
}
