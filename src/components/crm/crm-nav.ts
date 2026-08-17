import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Award,
  Bell,
  Building2,
  CreditCard,
  FileText,
  History,
  Landmark,
  Globe,
  Inbox,
  LayoutDashboard,
  // LineChart, // TODO: re-enable with the Business plan nav item
  ListTodo,
  Mail,
  Send,
  Shield,
  Table2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';

/**
 * Counters the sidebar can show against a nav item.
 *
 * The point is that "where is there work waiting?" should be answerable from
 * the sidebar without visiting five screens. Previously the CRM had four
 * separate inboxes — Work queue, Registrations, Inquiries and Notifications —
 * and no indication which of them had anything in it.
 *
 * Keys map to fields on CrmNavCounts (see useCrmNavCounts).
 */
export type CrmNavCountKey =
  | 'workQueue'
  | 'registrations'
  | 'inquiries'
  | 'outreachDue'
  | 'incidents'
  | 'unreconciled';

export type CrmNavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Shows a count pill when the value is > 0. */
  countKey?: CrmNavCountKey;
  /** Renders the pill in the alert colour rather than neutral. */
  urgent?: boolean;
};

export type CrmNavGroup = { label: string; items: CrmNavItem[] };

/**
 * Grouped by what you are trying to DO, not by what the data happens to be.
 *
 * The previous grouping put Verification, Badges and Monitoring under "Data"
 * — they are the product's core workflows, not reference tables — while the
 * outreach funnel was scattered across "Pipeline" in no particular order.
 */
export const CRM_NAV_GROUPS: CrmNavGroup[] = [
  {
    label: 'Today',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/work-queue', icon: ListTodo, label: 'Work queue', countKey: 'workQueue' },
      { to: '/inquiries', icon: Inbox, label: 'Inbox', countKey: 'inquiries', urgent: true },
      { to: '/activity', icon: History, label: 'Activity' },
    ],
  },
  {
    // In funnel order: reach out, they sign up, they get in touch, they buy.
    label: 'Growth',
    items: [
      { to: '/outreach', icon: Send, label: 'Outreach', countKey: 'outreachDue' },
      { to: '/registrations', icon: UserPlus, label: 'Sign-ups', countKey: 'registrations', urgent: true },
      { to: '/inbound', icon: Mail, label: 'Inbound' },
      { to: '/customers', icon: UserCheck, label: 'Customers' },
    ],
  },
  {
    label: 'Trust',
    items: [
      { to: '/organizations', icon: Building2, label: 'Organisations' },
      { to: '/verification', icon: Shield, label: 'Verification' },
      { to: '/badges', icon: Award, label: 'Badges' },
      { to: '/monitoring', icon: Activity, label: 'Monitoring', countKey: 'incidents' },
    ],
  },
  {
    label: 'Money',
    items: [
      { to: '/payments', icon: CreditCard, label: 'Payments' },
      { to: '/reconciliation', icon: Landmark, label: 'Reconciliation', countKey: 'unreconciled' },
      // TODO: re-enable once external business plan is finalized
      // { to: '/plan', icon: LineChart, label: 'Business plan' },
      { to: '/cash-flow', icon: Table2, label: 'Cash flow' },
    ],
  },
  {
    label: 'Content & system',
    items: [
      { to: '/contacts', icon: Users, label: 'Contacts' },
      { to: '/blog-manager', icon: FileText, label: 'Blog' },
      { to: '/notifications', icon: Bell, label: 'Notifications' },
      { to: '/email-notifications', icon: Mail, label: 'Email queue' },
      { to: '/public', icon: Globe, label: 'Public site' },
    ],
  },
];
