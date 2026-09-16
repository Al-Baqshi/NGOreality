import { supabase } from './supabase';
import { captureError } from './errorReporting';

export const ORG_LOGO_BUCKET = 'org-logos';
export const ORG_LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** Raster only — the bucket rejects SVG because it can carry script. */
export const ORG_LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function validateLogoFile(file: File): string | null {
  if (!(ORG_LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Upload a PNG, JPG or WebP image.';
  }
  if (file.size > ORG_LOGO_MAX_BYTES) {
    return 'Logo must be 2 MB or smaller.';
  }
  return null;
}

/** Uploads under `<orgId>/` (the only folder storage RLS lets members write) and returns the public URL. */
export async function uploadOrgLogo(
  organizationId: string,
  file: File,
): Promise<{ url: string | null; error: string | null }> {
  const invalid = validateLogoFile(file);
  if (invalid) return { url: null, error: invalid };

  const path = `${organizationId}/logo-${Date.now()}.${EXTENSIONS[file.type]}`;
  const { error } = await supabase.storage
    .from(ORG_LOGO_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (error) {
    return { url: null, error: captureError(error, { where: 'uploadOrgLogo' }) };
  }
  const { data } = supabase.storage.from(ORG_LOGO_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
