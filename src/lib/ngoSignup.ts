import { supabase } from './supabase';
import { DEFAULT_CRITERIA } from '../types';

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function notifyStaffPortalRegistration(
  organizationId: string,
  description: string,
): Promise<void> {
  await supabase.rpc('notify_staff_ngo_portal_event', {
    p_organization_id: organizationId,
    p_action: 'ngo_portal_registration',
    p_description: description,
  });
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

  const criteriaRows = DEFAULT_CRITERIA.map((c) => ({
    organization_id: org.id,
    ...c,
  }));
  const { error: criteriaError } = await supabase.from('verification_criteria').insert(criteriaRows);
  if (criteriaError) {
    return { organizationId: null, error: criteriaError.message };
  }

  const { error: contactError } = await supabase.from('contacts').insert({
    organization_id: org.id,
    name: input.contactName,
    email: input.email,
    is_primary: true,
    role: 'Primary contact',
  });
  if (contactError) {
    return { organizationId: null, error: contactError.message };
  }

  await supabase.from('activity_log').insert({
    organization_id: org.id,
    action: 'ngo_signup',
    description: 'Organization registered via NGO portal',
    performed_by: input.contactName,
  });

  await notifyStaffPortalRegistration(
    org.id,
    `New organization registered via portal: ${input.organizationName}`,
  );

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

  const { count: criteriaCount } = await supabase
    .from('verification_criteria')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id);

  if (!criteriaCount) {
    const { error: criteriaError } = await supabase.from('verification_criteria').insert(
      DEFAULT_CRITERIA.map((c) => ({ organization_id: org.id, ...c })),
    );
    if (criteriaError) {
      return { organizationId: null, error: criteriaError.message };
    }
  }

  await notifyStaffPortalRegistration(
    org.id,
    'Existing directory organization linked to a new NGO portal account',
  );

  return { organizationId: org.id, error: null };
}
