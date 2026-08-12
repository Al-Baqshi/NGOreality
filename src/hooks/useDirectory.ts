import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { captureError } from '../lib/errorReporting';
import type { Organization } from '../types';

const PAGE_SIZE = 48;


export type DirectoryPageFilters = {
  country?: string;
  search?: string;
  tag?: string;
  verifiedOnly?: boolean;
};

export function useDirectoryCountryCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    supabase.rpc('directory_country_counts').then(({ data, error }) => {
      if (error) {
        setError(captureError(error, { where: 'useDirectoryCountryCounts' }));
      } else if (data && typeof data === 'object') {
        setCounts(data as Record<string, number>);
        setError(null);
      }
      setLoading(false);
    });
  }, []);

  return { counts, loading, error, nzTotal: counts.NZ ?? 0 };
}

export function useDirectoryTagCounts(country: string) {
  const [tags, setTags] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    supabase.rpc('directory_tag_counts', { p_country: country || null }).then(({ data, error }) => {
      if (error) {
        setTags({});
        setError(captureError(error, { where: 'useDirectoryTagCounts', detail: { country } }));
      } else if (data && typeof data === 'object') {
        setTags(data as Record<string, number>);
        setError(null);
      } else {
        setTags({});
      }
      setLoading(false);
    });
  }, [country]);

  return { tags, loading, error };
}

export function useDirectorySummary(filters: DirectoryPageFilters) {
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    // The column-scoped view, not the table — see directory_search above.
    let q = supabase
      .from('directory_listings')
      .select('id', { count: 'exact', head: true })
      .in('status', ['verified', 'active'])
      .neq('verification_level', 'none');

    if (filters.country) q = q.eq('country', filters.country);

    q.then(({ count, error }) => {
      if (error) {
        // A failed count previously showed a confident "0 verified", which is
        // worse than showing nothing: it is a wrong number, not a missing one.
        setError(captureError(error, { where: 'useDirectorySummary', detail: { country: filters.country } }));
      } else {
        setVerifiedCount(count ?? 0);
        setError(null);
      }
      setLoading(false);
    });
  }, [filters.country]);

  return { verifiedCount, loading, error };
}

export function useDirectoryPage(filters: DirectoryPageFilters, page: number) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    const term = filters.search?.trim();

    // directory_search, not .from('organizations'):
    //  - the term is a BOUND PARAMETER. The previous `.or()` string
    //    interpolated it raw, so a comma injected extra OR conditions — a
    //    blind-search oracle over every column anon could read.
    //  - it reads a column-scoped view, so no email, phone, outreach_status or
    //    is_customer can come back down the wire.
    //  - it searches one generated, trigram-indexed column instead of three
    //    unindexed ones: 36ms rather than 1.14s.
    const { data, error } = await supabase.rpc('directory_search', {
      p_q: term || null,
      p_country: filters.country || null,
      p_tag: filters.tag || null,
      p_verified_only: Boolean(filters.verifiedOnly),
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    });

    const rows = (data ?? []) as (Organization & { total_count: number })[];
    const count = rows.length ? Number(rows[0].total_count) : 0;

    if (error) {
      // Previously this left the last successful page on screen and cleared the
      // spinner, so a failure looked like "no charities match".
      setOrganizations([]);
      setTotalCount(0);
      setError(
        captureError(error, {
          where: 'useDirectoryPage',
          // Named individually rather than spreading `filters`: the callback's
          // deps are the individual fields, so spreading the object would make
          // this close over a stale one.
          detail: {
            page,
            country: filters.country,
            tag: filters.tag,
            verifiedOnly: filters.verifiedOnly,
            hasSearch: Boolean(term),
          },
        }),
      );
    } else {
      // total_count rides on every row, so page and total arrive together.
      setOrganizations(rows as unknown as Organization[]);
      setTotalCount(count);
      setError(null);
    }
    setLoading(false);
  }, [filters.country, filters.search, filters.tag, filters.verifiedOnly, page]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return {
    organizations,
    totalCount,
    totalPages,
    pageSize: PAGE_SIZE,
    loading,
    error,
    refetch: fetchPage,
  };
}
