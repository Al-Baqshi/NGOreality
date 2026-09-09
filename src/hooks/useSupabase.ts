import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { captureError } from '../lib/errorReporting';
import type { Organization, Contact, VerificationCriterion, VerificationBadge, ActivityLogEntry, InquirySubmission, BlogPost } from '../types';

export function useOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });
    if (queryError) {
      setError(captureError(queryError, { where: 'useOrganizations' }));
      setOrganizations([]);
    } else {
      setOrganizations(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);
  return { organizations, loading, error, refetch: fetchAll };
}

export function useOrganization(id: string | undefined) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase.from('organizations').select('*').eq('id', id).maybeSingle();
    if (queryError) {
      setError(captureError(queryError, { where: 'useOrganization' }));
    } else {
      setOrganization(data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { organization, loading, error, refetch };
}

export function useContacts(organizationId: string | undefined) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    supabase.from('contacts').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(captureError(queryError, { where: 'useContacts' }));
        } else {
          setContacts(data ?? []);
        }
        setLoading(false);
      });
  }, [organizationId]);

  return { contacts, loading, error };
}

export function useVerificationCriteria(organizationId: string | undefined) {
  const [criteria, setCriteria] = useState<VerificationCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('verification_criteria')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });
    if (queryError) {
      setError(captureError(queryError, { where: 'useVerificationCriteria' }));
    } else {
      setCriteria(data ?? []);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { criteria, loading, error, refetch, setCriteria };
}

export function useBadges(organizationId: string | undefined) {
  const [badges, setBadges] = useState<VerificationBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('verification_badges')
      .select('*')
      .eq('organization_id', organizationId)
      .order('issued_at', { ascending: false });
    if (queryError) {
      setError(captureError(queryError, { where: 'useBadges' }));
    } else {
      setBadges(data ?? []);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { badges, loading, error, refetch };
}

export function useActivityLog(organizationId: string | undefined) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    supabase.from('activity_log').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(captureError(queryError, { where: 'useActivityLog' }));
        } else {
          setEntries(data ?? []);
        }
        setLoading(false);
      });
  }, [organizationId]);

  return { entries, loading, error };
}

export function useInquiries() {
  const [inquiries, setInquiries] = useState<InquirySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('inquiry_submissions')
      .select('*')
      .order('created_at', { ascending: false });
    if (queryError) {
      setError(captureError(queryError, { where: 'useInquiries' }));
    } else {
      setInquiries(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);
  return { inquiries, loading, error, refetch: fetchAll };
}

const VERIFIED_STATUSES = ['verified', 'active'] as const;
const DIRECTORY_STATUSES = ['listed', 'verified', 'active'] as const;

export function usePublicOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // directory_listings, not organizations: the anon key ships in the bundle,
    // and the table carries email, phone and our own outreach state.
    supabase
      .from('directory_listings')
      .select('*')
      .in('status', [...VERIFIED_STATUSES])
      .order('name', { ascending: true })
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(captureError(queryError, { where: 'usePublicOrganizations' }));
        } else {
          setOrganizations(data ?? []);
        }
        setLoading(false);
      });
  }, []);

  return { organizations, loading, error };
}

export function usePublicDirectoryOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    supabase
      .from('directory_listings')
      .select('*')
      .in('status', [...DIRECTORY_STATUSES])
      .order('name', { ascending: true })
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(captureError(queryError, { where: 'usePublicDirectoryOrganizations' }));
        } else {
          setOrganizations(data ?? []);
        }
        setLoading(false);
      });
  }, []);

  return { organizations, loading, error };
}

export function usePublicOrganizationBySlug(slug: string | undefined) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setOrganization(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    supabase
      .from('directory_listings')
      .select('*')
      .eq('slug', slug)
      .in('status', [...DIRECTORY_STATUSES])
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(captureError(queryError, { where: 'usePublicOrganizationBySlug' }));
          setOrganization((prev) => (prev?.slug === slug ? prev : null));
        } else {
          setOrganization(data);
        }
        setLoading(false);
      });
  }, [slug]);

  return { organization, loading, error };
}

export function useBlogPosts() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    supabase.from('blog_posts').select('*').eq('status', 'published').order('published_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(captureError(queryError, { where: 'useBlogPosts' }));
        } else {
          setPosts(data ?? []);
        }
        setLoading(false);
      });
  }, []);

  return { posts, loading, error };
}

export function useBlogPost(slug: string | undefined) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setPost(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    supabase.from('blog_posts').select('*').eq('slug', slug).eq('status', 'published').maybeSingle()
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(captureError(queryError, { where: 'useBlogPost' }));
          setPost((prev) => (prev?.slug === slug ? prev : null));
        } else {
          setPost(data);
        }
        setLoading(false);
      });
  }, [slug]);

  return { post, loading, error };
}

export function useAllBlogPosts() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('blog_posts')
      .select('*')
      .order('published_at', { ascending: false });
    if (queryError) {
      setError(captureError(queryError, { where: 'useAllBlogPosts' }));
    } else {
      setPosts(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);
  return { posts, loading, error, refetch: fetchAll };
}

/** @deprecated Use useDirectoryCountryCounts from useDirectory.ts (accurate at 29k+ scale) */
export function useCountryCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    supabase.rpc('directory_country_counts').then(({ data, error: queryError }) => {
      if (queryError) {
        setError(captureError(queryError, { where: 'useCountryCounts' }));
      } else if (data && typeof data === 'object') {
        setCounts(data as Record<string, number>);
      } else {
        setError(captureError(new Error('Country counts response was empty'), { where: 'useCountryCounts.empty' }));
      }
      setLoading(false);
    });
  }, []);

  return { counts, loading, error };
}
