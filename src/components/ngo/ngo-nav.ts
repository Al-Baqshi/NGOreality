import type { LucideIcon } from 'lucide-react';
import { WORKSPACE_ENABLED } from '../../config/features';
import {
  Activity,
  Award,
  Bell,
  Calendar,
  CreditCard,
  LayoutDashboard,
  RefreshCw,
  Shield,
  Sparkles,
  User,
  UserPlus,
  Users,
} from 'lucide-react';

export type NgoNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  description?: string;
};

export type NgoNavGroup = {
  label: string;
  items: NgoNavItem[];
};

export const NGO_PORTAL_BASE = '/ngo';

export const NGO_PORTAL_NAV_ONBOARDING: NgoNavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: NGO_PORTAL_BASE },
  { id: 'registration', label: 'Complete registration', icon: UserPlus, path: '/ngo/signup' },
];

const overview: NgoNavItem = {
  id: 'overview',
  label: 'Overview',
  icon: LayoutDashboard,
  path: NGO_PORTAL_BASE,
};

const services: NgoNavItem = {
  id: 'services',
  label: 'Services & pay',
  icon: CreditCard,
  path: `${NGO_PORTAL_BASE}/services`,
  description: 'Badge + landing package',
};

const workspace: NgoNavItem | null = WORKSPACE_ENABLED
  ? {
      id: 'workspace',
      label: 'Client workspace',
      icon: Users,
      path: `${NGO_PORTAL_BASE}/workspace`,
      description: 'Clients, cases & service records',
    }
  : null;

export const NGO_PORTAL_NAV_GROUPS: NgoNavGroup[] = [
  {
    label: 'Home',
    items: [overview, services, ...(workspace ? [workspace] : [])],
  },
  {
    label: 'Organisation',
    items: [
      {
        id: 'profile',
        label: 'Profile',
        icon: User,
        path: `${NGO_PORTAL_BASE}/profile`,
        description: 'Mission, logo & completion',
      },
      {
        id: 'setup-request',
        label: 'Setup request',
        icon: Sparkles,
        path: `${NGO_PORTAL_BASE}/setup-request`,
        description: 'Landing page & brand',
      },
      {
        id: 'membership',
        label: 'Membership',
        icon: Calendar,
        path: `${NGO_PORTAL_BASE}/membership`,
        description: 'Annual plan & renewal',
      },
    ],
  },
  {
    label: 'Trust',
    items: [
      {
        id: 'standards',
        label: 'Trust standards',
        icon: Shield,
        path: `${NGO_PORTAL_BASE}/standards`,
        description: 'Public criteria progress',
      },
      { id: 'badge', label: 'Reality Badge', icon: Award, path: `${NGO_PORTAL_BASE}/badge` },
      {
        id: 'monitoring',
        label: 'Website monitoring',
        icon: Activity,
        path: `${NGO_PORTAL_BASE}/monitoring`,
        description: 'Uptime alerts',
      },
    ],
  },
  {
    label: 'Activity',
    items: [
      { id: 'requests', label: 'Requests', icon: RefreshCw, path: `${NGO_PORTAL_BASE}/requests` },
      {
        id: 'notifications',
        label: 'Notifications',
        icon: Bell,
        path: `${NGO_PORTAL_BASE}/notifications`,
      },
    ],
  },
];

export const NGO_PORTAL_NAV: NgoNavItem[] = NGO_PORTAL_NAV_GROUPS.flatMap((g) => g.items);

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
