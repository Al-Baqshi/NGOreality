import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Organization, Contact, VerificationCriterion, VerificationBadge, ActivityLogEntry, InquirySubmission, BlogPost } from '../types';

export function useOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setOrganizations(data);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);
  return { organizations, loading, refetch: fetchAll };
}

export function useOrganization(id: string | undefined) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    supabase.from('organizations').select('*').eq('id', id).maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) setOrganization(data);
        setLoading(false);
      });
  }, [id]);

  return { organization, loading };
}

export function useContacts(organizationId: string | undefined) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    supabase.from('contacts').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setContacts(data);
        setLoading(false);
      });
  }, [organizationId]);

  return { contacts, loading };
}

export function useVerificationCriteria(organizationId: string | undefined) {
  const [criteria, setCriteria] = useState<VerificationCriterion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    supabase.from('verification_criteria').select('*').eq('organization_id', organizationId).order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setCriteria(data);
        setLoading(false);
      });
  }, [organizationId]);

  return { criteria, loading };
}

export function useBadges(organizationId: string | undefined) {
  const [badges, setBadges] = useState<VerificationBadge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    supabase.from('verification_badges').select('*').eq('organization_id', organizationId).order('issued_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setBadges(data);
        setLoading(false);
      });
  }, [organizationId]);

  return { badges, loading };
}

export function useActivityLog(organizationId: string | undefined) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    supabase.from('activity_log').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setEntries(data);
        setLoading(false);
      });
  }, [organizationId]);

  return { entries, loading };
}

export function useInquiries() {
  const [inquiries, setInquiries] = useState<InquirySubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inquiry_submissions')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setInquiries(data);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);
  return { inquiries, loading, refetch: fetchAll };
}

const VERIFIED_STATUSES = ['verified', 'active'] as const;
const DIRECTORY_STATUSES = ['listed', 'verified', 'active'] as const;

export function usePublicOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('organizations')
      .select('*')
      .in('status', [...VERIFIED_STATUSES])
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setOrganizations(data);
        setLoading(false);
      });
  }, []);

  return { organizations, loading };
}

export function usePublicDirectoryOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('organizations')
      .select('*')
      .in('status', [...DIRECTORY_STATUSES])
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setOrganizations(data);
        setLoading(false);
      });
  }, []);

  return { organizations, loading };
}

export function usePublicOrganizationBySlug(slug: string | undefined) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .in('status', [...DIRECTORY_STATUSES])
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) setOrganization(data);
        else setOrganization(null);
        setLoading(false);
      });
  }, [slug]);

  return { organization, loading };
}

export function useBlogPosts() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase.from('blog_posts').select('*').eq('status', 'published').order('published_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setPosts(data);
        setLoading(false);
      });
  }, []);

  return { posts, loading };
}

export function useBlogPost(slug: string | undefined) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    supabase.from('blog_posts').select('*').eq('slug', slug).eq('status', 'published').maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) setPost(data);
        setLoading(false);
      });
  }, [slug]);

  return { post, loading };
}

export function useAllBlogPosts() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .order('published_at', { ascending: false });
    if (!error && data) setPosts(data);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);
  return { posts, loading, refetch: fetchAll };
}

export function useCountryCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase.from('organizations').select('country, status').in('status', [...DIRECTORY_STATUSES])
      .then(({ data, error }) => {
        if (!error && data) {
          const aggregated: Record<string, number> = {};
          for (const row of data) {
            if (row.country) {
              aggregated[row.country] = (aggregated[row.country] || 0) + 1;
            }
          }
          setCounts(aggregated);
        }
        setLoading(false);
      });
  }, []);

  return { counts, loading };
}
