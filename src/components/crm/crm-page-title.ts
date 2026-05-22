import { CRM_NAV_GROUPS } from './crm-nav';

const EXTRA_TITLES: Record<string, string> = {
  '/organizations/new': 'New organization',
  '/notifications': 'Notifications',
  '/email-notifications': 'Email notifications',
};

export function getCrmPageTitle(pathname: string): string {
  const extra = EXTRA_TITLES[pathname];
  if (extra) return extra;

  for (const group of CRM_NAV_GROUPS) {
    for (const item of group.items) {
      if (item.to === '/dashboard') {
        if (pathname === '/dashboard') return item.label;
        continue;
      }
      if (item.to === '/public') {
        if (pathname.startsWith('/public')) return item.label;
        continue;
      }
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        return item.label;
      }
    }
  }

  return 'CRM';
}
