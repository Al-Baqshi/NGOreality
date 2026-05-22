import type { Organization } from '../types';

export type ProfileCompletionItem = {
  key: string;
  label: string;
  complete: boolean;
  hint?: string;
};

export function getProfileCompletionItems(org: Pick<
  Organization,
  | 'name'
  | 'description'
  | 'mission_statement'
  | 'category'
  | 'location'
  | 'email'
  | 'phone'
  | 'website_url'
  | 'logo_url'
>): ProfileCompletionItem[] {
  const hasWebsite = Boolean(org.website_url?.trim());

  return [
    {
      key: 'logo',
      label: 'Logo',
      complete: Boolean(org.logo_url?.trim()),
      hint: 'Required for trust pages and your public profile unless you only use an existing website.',
    },
    {
      key: 'mission',
      label: 'Mission statement',
      complete: Boolean(org.mission_statement?.trim()),
    },
    {
      key: 'description',
      label: 'Short description',
      complete: Boolean(org.description?.trim()),
    },
    {
      key: 'category',
      label: 'Category',
      complete: Boolean(org.category?.trim()),
    },
    {
      key: 'location',
      label: 'Location',
      complete: Boolean(org.location?.trim()),
    },
    {
      key: 'email',
      label: 'Contact email',
      complete: Boolean(org.email?.trim()),
    },
    {
      key: 'phone',
      label: 'Phone (recommended)',
      complete: Boolean(org.phone?.trim()),
      hint: 'Helps donors and our team reach you quickly.',
    },
    {
      key: 'website',
      label: hasWebsite ? 'Website on file' : 'Website or landing page',
      complete: hasWebsite,
      hint: hasWebsite
        ? 'We can monitor this URL with membership.'
        : 'No website yet — request our trust landing package below.',
    },
  ];
}

export function profileCompletionPercent(items: ProfileCompletionItem[]): number {
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.complete).length;
  return Math.round((done / items.length) * 100);
}
