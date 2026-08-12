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
      // This runs for LOGGED-OUT visitors on the signup page. It previously
      // selected email and phone for every match and interpolated the term into
      // a PostgREST .or() string — a contact-harvesting endpoint with an
      // injection hole, on the most public page there is.
      //
      // directory_search takes the term as a bound parameter and can only
      // return the column-scoped view.
      const { data, error } = await supabase.rpc('directory_search', {
        p_q: q,
        p_country: null,
        p_tag: null,
        p_verified_only: false,
        p_limit: 12,
        p_offset: 0,
      });

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
