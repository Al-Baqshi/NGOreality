import type { LucideIcon } from 'lucide-react';
import { Activity, Award, Bell, Calendar, LayoutDashboard, RefreshCw, Shield, Sparkles, User, UserPlus } from 'lucide-react';

export type NgoNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  description?: string;
};

export const NGO_PORTAL_BASE = '/ngo';

export const NGO_PORTAL_NAV_ONBOARDING: NgoNavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: NGO_PORTAL_BASE },
  { id: 'registration', label: 'Complete registration', icon: UserPlus, path: '/ngo/signup' },
];

export const NGO_PORTAL_NAV: NgoNavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: NGO_PORTAL_BASE },
  { id: 'profile', label: 'Profile', icon: User, path: `${NGO_PORTAL_BASE}/profile`, description: 'Mission, logo & completion' },
  { id: 'setup-request', label: 'Setup request', icon: Sparkles, path: `${NGO_PORTAL_BASE}/setup-request`, description: 'Landing page & brand' },
  { id: 'membership', label: 'Membership', icon: Calendar, path: `${NGO_PORTAL_BASE}/membership`, description: 'Annual plan & renewal' },
  { id: 'standards', label: 'Trust standards', icon: Shield, path: `${NGO_PORTAL_BASE}/standards`, description: 'Public criteria progress' },
  { id: 'badge', label: 'Reality Badge', icon: Award, path: `${NGO_PORTAL_BASE}/badge` },
  { id: 'monitoring', label: 'Website monitoring', icon: Activity, path: `${NGO_PORTAL_BASE}/monitoring`, description: 'Uptime alerts' },
  { id: 'requests', label: 'Requests', icon: RefreshCw, path: `${NGO_PORTAL_BASE}/requests` },
  { id: 'notifications', label: 'Notifications', icon: Bell, path: `${NGO_PORTAL_BASE}/notifications` },
];

export function ngoNavIdFromPathname(pathname: string): string {
  if (pathname === NGO_PORTAL_BASE || pathname === `${NGO_PORTAL_BASE}/`) {
    return 'overview';
  }
  const segment = pathname.replace(`${NGO_PORTAL_BASE}/`, '').split('/')[0];
  return segment || 'overview';
}

export function ngoNavItemById(id: string, onboarding: boolean): NgoNavItem | undefined {
  const items = onboarding ? NGO_PORTAL_NAV_ONBOARDING : NGO_PORTAL_NAV;
  return items.find((item) => item.id === id);
}
