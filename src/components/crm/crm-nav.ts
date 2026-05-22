import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Award,
  Bell,
  Building2,
  CreditCard,
  FileText,
  Globe,
  Inbox,
  Kanban,
  LayoutDashboard,
  LineChart,
  ListTodo,
  Mail,
  Shield,
  Table2,
  UserCheck,
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
      { to: '/outreach', icon: Kanban, label: 'Outreach' },
      { to: '/inbound', icon: Inbox, label: 'Inbound' },
      { to: '/customers', icon: UserCheck, label: 'Customers' },
      { to: '/payments', icon: CreditCard, label: 'Payments' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/plan', icon: LineChart, label: 'Business plan' },
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
