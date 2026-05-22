import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface ClaimSearchOrganization {
  id: string;
  name: string;
  slug: string;
  charity_registration_number: string | null;
  location: string;
  country: string;
  status: string;
  description?: string;
  mission_statement?: string;
  website_url?: string;
  logo_url?: string;
  category?: string;
  email?: string;
  phone?: string;
}

const DIRECTORY_STATUSES = ['listed', 'verified', 'active'] as const;

function sanitizeIlikeQuery(raw: string): string {
  return raw.trim().replace(/[%_]/g, '').slice(0, 80);
}

export function useOrganizationClaimSearch(query: string) {
  const [results, setResults] = useState<ClaimSearchOrganization[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const q = sanitizeIlikeQuery(query);
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      setSearchError(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      setSearchError(null);
      const pattern = `%${q}%`;
      const { data, error } = await supabase
        .from('organizations')
        .select(
          'id, name, slug, charity_registration_number, location, country, status, description, mission_statement, website_url, logo_url, category, email, phone',
        )
        .in('status', [...DIRECTORY_STATUSES])
        .or(`name.ilike.${pattern},charity_registration_number.ilike.${pattern}`)
        .order('name', { ascending: true })
        .limit(12);

      if (error) {
        setResults([]);
        setSearchError(error.message);
      } else {
        setResults((data ?? []) as ClaimSearchOrganization[]);
      }
      setLoading(false);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  return { results, loading, searched, searchError };
}
