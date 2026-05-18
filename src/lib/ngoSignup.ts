import { supabase } from './supabase';
import { DEFAULT_CRITERIA } from '../types';

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (attempt < 20) {
    const { data } = await supabase.from('organizations').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
    attempt += 1;
    slug = `${base}-${attempt}`;
  }
  return `${base}-${Date.now()}`;
}

export async function provisionNgoOrganization(input: {
  userId: string;
  organizationName: string;
  contactName: string;
  email: string;
  category: string;
  location: string;
  websiteUrl: string;
}): Promise<{ organizationId: string | null; error: string | null }> {
  const baseSlug = generateSlug(input.organizationName);
  const slug = await uniqueSlug(baseSlug || 'organization');

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: input.organizationName,
      slug,
      email: input.email,
      category: input.category,
      location: input.location,
      website_url: input.websiteUrl,
      status: 'onboarding',
      verification_level: 'none',
      onboarding_stage: 'intake',
    })
    .select('id')
    .maybeSingle();

  if (orgError || !org) {
    return { organizationId: null, error: orgError?.message ?? 'Could not create organization' };
  }

  const { error: memberError } = await supabase.from('organization_members').insert({
    user_id: input.userId,
    organization_id: org.id,
    role: 'owner',
  });

  if (memberError) {
    return { organizationId: null, error: memberError.message };
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const { error: membershipError } = await supabase.from('organization_memberships').insert({
    organization_id: org.id,
    expires_at: expiresAt.toISOString(),
    status: 'active',
  });

  if (membershipError) {
    return { organizationId: null, error: membershipError.message };
  }

  const criteriaRows = DEFAULT_CRITERIA.map((c) => ({
    organization_id: org.id,
    ...c,
  }));
  await supabase.from('verification_criteria').insert(criteriaRows);

  await supabase.from('contacts').insert({
    organization_id: org.id,
    name: input.contactName,
    email: input.email,
    is_primary: true,
    role: 'Primary contact',
  });

  await supabase.from('activity_log').insert({
    organization_id: org.id,
    action: 'ngo_signup',
    description: 'Organization registered via NGO portal',
    performed_by: input.contactName,
  });

  return { organizationId: org.id, error: null };
}

export async function linkExistingOrganization(input: {
  userId: string;
  email: string;
  organizationId?: string;
  organizationSlug?: string;
}): Promise<{ organizationId: string | null; error: string | null }> {
  if (!input.organizationId && !input.organizationSlug?.trim()) {
    return { organizationId: null, error: 'Select your organization from the directory search.' };
  }

  let query = supabase.from('organizations').select('id, email, status');

  if (input.organizationId) {
    query = query.eq('id', input.organizationId);
  } else {
    query = query.eq('slug', input.organizationSlug!.trim().toLowerCase());
  }

  const { data: org, error: orgError } = await query.maybeSingle();

  if (orgError || !org) {
    return { organizationId: null, error: 'Organization not found. Search again or register as a new organization.' };
  }

  const orgEmail = org.email?.trim();
  if (orgEmail && orgEmail.toLowerCase() !== input.email.toLowerCase()) {
    return {
      organizationId: null,
      error:
        'This signup email must match the email on file for that organization. Use the same email or contact NGOreality staff.',
    };
  }

  const { data: existingMember } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', org.id)
    .maybeSingle();

  if (existingMember) {
    return { organizationId: null, error: 'This organization already has a portal account.' };
  }

  const { error: memberError } = await supabase.from('organization_members').insert({
    user_id: input.userId,
    organization_id: org.id,
    role: 'owner',
  });

  if (memberError) {
    return { organizationId: null, error: memberError.message };
  }

  if (!orgEmail) {
    await supabase.from('organizations').update({ email: input.email }).eq('id', org.id);
  }

  if (org.status === 'listed') {
    await supabase
      .from('organizations')
      .update({ status: 'onboarding', onboarding_stage: 'intake' })
      .eq('id', org.id);
  }

  await supabase.from('activity_log').insert({
    organization_id: org.id,
    action: 'ngo_claim',
    description: 'Organization claimed via NGO portal signup',
    performed_by: input.email,
  });

  const { data: existingMembership } = await supabase
    .from('organization_memberships')
    .select('id')
    .eq('organization_id', org.id)
    .limit(1)
    .maybeSingle();

  if (!existingMembership) {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    await supabase.from('organization_memberships').insert({
      organization_id: org.id,
      expires_at: expiresAt.toISOString(),
      status: 'active',
    });
  }

  return { organizationId: org.id, error: null };
}
