import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Award,
  Bell,
  Building2,
  CreditCard,
  FileText,
  Landmark,
  Globe,
  Inbox,
  Kanban,
  LayoutDashboard,
  // LineChart, // TODO: re-enable with the Business plan nav item
  ListTodo,
  Mail,
  Shield,
  Table2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';

export type CrmNavItem = { to: string; icon: LucideIcon; label: string };

export type CrmNavGroup = { label: string; items: CrmNavItem[] };

export const CRM_NAV_GROUPS: CrmNavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/work-queue', icon: ListTodo, label: 'Work queue' },
    ],
  },
  {
    label: 'Pipeline',
    items: [
      { to: '/registrations', icon: UserPlus, label: 'Registrations' },
      { to: '/outreach', icon: Kanban, label: 'Outreach' },
      { to: '/inbound', icon: Inbox, label: 'Inbound' },
      { to: '/customers', icon: UserCheck, label: 'Customers' },
      { to: '/payments', icon: CreditCard, label: 'Payments' },
      { to: '/reconciliation', icon: Landmark, label: 'Reconciliation' },
    ],
  },
  {
    label: 'Finance',
    items: [
      // TODO: re-enable once external business plan is finalized
      // { to: '/plan', icon: LineChart, label: 'Business plan' },
      { to: '/cash-flow', icon: Table2, label: 'Cash flow' },
    ],
  },
  {
    label: 'Data',
    items: [
      { to: '/organizations', icon: Building2, label: 'Organizations' },
      { to: '/verification', icon: Shield, label: 'Verification' },
      { to: '/badges', icon: Award, label: 'Badges' },
      { to: '/monitoring', icon: Activity, label: 'Monitoring' },
      { to: '/contacts', icon: Users, label: 'Contacts' },
      { to: '/inquiries', icon: Mail, label: 'Inquiries' },
      { to: '/blog-manager', icon: FileText, label: 'Blog' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/notifications', icon: Bell, label: 'Notifications' },
      { to: '/email-notifications', icon: Mail, label: 'Email notifications' },
      { to: '/public', icon: Globe, label: 'Public site' },
    ],
  },
];
