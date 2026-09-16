import { supabase } from './supabase';
import { captureEmptyMutation, captureError } from './errorReporting';
import { LANDING_STANDARDS_PACKAGE_LABEL } from '../config/customerProducts';

export type NgoSetupRequestKind = 'landing_standards' | 'brand_assets' | 'general';
export type NgoSetupRequestStatus = 'pending' | 'in_review' | 'approved' | 'completed' | 'cancelled';

export type NgoSetupQuestionnaire = {
  has_existing_website: boolean;
  wants_landing_package: boolean;
  primary_goal?: string;
  request_type?: 'landing_page' | 'custom_work';
  current_website?: string;
  page_email?: string;
  page_phone?: string;
  page_address?: string;
  domain_status?: 'own' | 'need' | 'unsure';
  domain_name?: string;
  /** Readiness checklist keys the NGO says it already has (see SETUP_READINESS_ITEMS). */
  ready?: string[];
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
  /** Overrides the kind inferred from the package / logo flags. */
  requestKind?: NgoSetupRequestKind;
};

export async function submitNgoSetupRequest(
  input: SubmitNgoSetupInput,
): Promise<{ error: string | null }> {
  const kind: NgoSetupRequestKind = input.requestKind ?? (input.wantsLandingPackage
    ? 'landing_standards'
    : input.logoUrl.trim()
      ? 'brand_assets'
      : 'general');

  const { data: reqRow, error: reqError } = await supabase.from('ngo_setup_requests').insert({
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
  }).select('id');

  if (reqError) return { error: captureError(reqError, { where: 'submitNgoSetupRequest.insert' }) };
  if (!reqRow?.length) {
    return { error: captureEmptyMutation('submitNgoSetupRequest.insertEmpty', 'The setup request was not saved. Refresh and try again.') };
  }

  const orgPatch: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };
  if (input.logoUrl.trim()) orgPatch.logo_url = input.logoUrl.trim();
  if (input.brandPrimary.trim()) orgPatch.brand_primary = input.brandPrimary.trim();
  if (input.brandSecondary.trim()) orgPatch.brand_secondary = input.brandSecondary.trim();

  const { data: orgRow, error: orgError } = await supabase
    .from('organizations')
    .update(orgPatch)
    .eq('id', input.organizationId)
    .select('id');

  if (orgError) {
    captureError(orgError, { where: 'submitNgoSetupRequest.orgPatch' });
    return {
      error: `Request submitted, but organisation brand details could not be saved: ${orgError.message}`,
    };
  }
  if (!orgRow?.length) {
    return {
      error: captureEmptyMutation(
        'submitNgoSetupRequest.orgPatchEmpty',
        'Request submitted, but organisation brand details could not be saved. Refresh and try again.',
      ),
    };
  }

  return { error: null };
}

export function setupRequestSummary(input: {
  hasExistingWebsite: boolean;
  wantsLandingPackage: boolean;
}): string {
  if (input.hasExistingWebsite) {
    return 'You have a website on file — we will use it for monitoring and trust review. Logo, brand colours, and notes are required with this request.';
  }
  if (input.wantsLandingPackage) {
    return LANDING_STANDARDS_PACKAGE_LABEL;
  }
  return 'Tell us what you need and our team will follow up.';
}
