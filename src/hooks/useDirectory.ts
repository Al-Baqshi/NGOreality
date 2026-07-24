import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Organization } from '../types';

const DIRECTORY_STATUSES = ['listed', 'verified', 'active'] as const;
const PAGE_SIZE = 48;

/* Only the columns the directory cards render — avoids shipping every org
   column (financials, contact details, timestamps) for each listed row. */
const DIRECTORY_CARD_COLUMNS =
  'id,slug,name,charity_registration_number,description,mission_statement,location,country,tags,status,verification_level';

export type DirectoryPageFilters = {
  country?: string;
  search?: string;
  tag?: string;
  verifiedOnly?: boolean;
};

export function useDirectoryCountryCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase.rpc('directory_country_counts').then(({ data, error }) => {
      if (!error && data && typeof data === 'object') {
        setCounts(data as Record<string, number>);
      }
      setLoading(false);
    });
  }, []);

  return { counts, loading, nzTotal: counts.NZ ?? 0 };
}

export function useDirectoryTagCounts(country: string) {
  const [tags, setTags] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase.rpc('directory_tag_counts', { p_country: country || null }).then(({ data, error }) => {
      if (!error && data && typeof data === 'object') {
        setTags(data as Record<string, number>);
      } else {
        setTags({});
      }
      setLoading(false);
    });
  }, [country]);

  return { tags, loading };
}

export function useDirectorySummary(filters: DirectoryPageFilters) {
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let q = supabase
      .from('organizations')
      .select('*', { count: 'exact', head: true })
      .in('status', ['verified', 'active'])
      .neq('verification_level', 'none');

    if (filters.country) q = q.eq('country', filters.country);

    q.then(({ count }) => {
      setVerifiedCount(count ?? 0);
      setLoading(false);
    });
  }, [filters.country]);

  return { verifiedCount, loading };
}

export function useDirectoryPage(filters: DirectoryPageFilters, page: number) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from('organizations')
      .select(DIRECTORY_CARD_COLUMNS, { count: 'exact' })
      .in('status', [...DIRECTORY_STATUSES])
      .order('name', { ascending: true });

    if (filters.country) q = q.eq('country', filters.country);
    if (filters.verifiedOnly) {
      q = q.in('status', ['verified', 'active']).neq('verification_level', 'none');
    }
    if (filters.tag) q = q.contains('tags', [filters.tag]);
    const term = filters.search?.trim();
    if (term) {
      q = q.or(
        `name.ilike.%${term}%,charity_registration_number.ilike.%${term}%,description.ilike.%${term}%`,
      );
    }

    const { data, error, count } = await q.range(from, to);
    if (!error && data) {
      // Narrowed column set (DIRECTORY_CARD_COLUMNS) — the cards only read these fields.
      setOrganizations(data as unknown as Organization[]);
      setTotalCount(count ?? 0);
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
    refetch: fetchPage,
  };
}
