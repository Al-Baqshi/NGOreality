import { supabase } from './supabase';
import { LANDING_STANDARDS_PACKAGE_LABEL } from '../config/customerProducts';

export type NgoSetupRequestKind = 'landing_standards' | 'brand_assets' | 'general';
export type NgoSetupRequestStatus = 'pending' | 'in_review' | 'approved' | 'completed' | 'cancelled';

export type NgoSetupQuestionnaire = {
  has_existing_website: boolean;
  wants_landing_package: boolean;
  primary_goal?: string;
};

export type SubmitNgoSetupInput = {
  organizationId: string;
  userId: string;
  hasExistingWebsite: boolean;
  wantsLandingPackage: boolean;
  logoUrl: string;
  brandPrimary: string;
  brandSecondary: string;
  notes: string;
  questionnaire: NgoSetupQuestionnaire;
};

export async function submitNgoSetupRequest(
  input: SubmitNgoSetupInput,
): Promise<{ error: string | null }> {
  const kind: NgoSetupRequestKind = input.wantsLandingPackage
    ? 'landing_standards'
    : input.logoUrl.trim()
      ? 'brand_assets'
      : 'general';

  const { error: reqError } = await supabase.from('ngo_setup_requests').insert({
    organization_id: input.organizationId,
    requested_by: input.userId,
    request_kind: kind,
    has_existing_website: input.hasExistingWebsite,
    wants_landing_package: input.wantsLandingPackage,
    logo_url: input.logoUrl.trim(),
    brand_primary: input.brandPrimary.trim(),
    brand_secondary: input.brandSecondary.trim(),
    notes: input.notes.trim(),
    questionnaire: input.questionnaire,
  });

  if (reqError) return { error: reqError.message };

  const orgPatch: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };
  if (input.logoUrl.trim()) orgPatch.logo_url = input.logoUrl.trim();
  if (input.brandPrimary.trim()) orgPatch.brand_primary = input.brandPrimary.trim();
  if (input.brandSecondary.trim()) orgPatch.brand_secondary = input.brandSecondary.trim();

  const { error: orgError } = await supabase
    .from('organizations')
    .update(orgPatch)
    .eq('id', input.organizationId);

  if (orgError) return { error: orgError.message };

  return { error: null };
}

export function setupRequestSummary(input: {
  hasExistingWebsite: boolean;
  wantsLandingPackage: boolean;
}): string {
  if (input.hasExistingWebsite) {
    return 'You have a website on file — we will use it for monitoring and trust review. Submit your logo and brand colours if you want them on your NGOreality profile.';
  }
  if (input.wantsLandingPackage) {
    return LANDING_STANDARDS_PACKAGE_LABEL;
  }
  return 'Tell us what you need and our team will follow up.';
}
