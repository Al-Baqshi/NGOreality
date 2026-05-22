import { FLEXI_WAGE_DEFAULT_MONTHS, FLEXI_WAGE_MONTHLY_CENTS } from './businessPlanRef';
import {
  LANDING_STANDARDS_PACKAGE_CENTS,
  LANDING_STANDARDS_PACKAGE_LABEL,
  MEMBER_MONITORING_DETAIL,
  MEMBER_MONITORING_SUMMARY,
  ORGANISATION_WORKSPACE_NAME,
  ORGANISATION_WORKSPACE_TAGLINE,
} from './customerProducts';
import { MEMBERSHIP_ANNUAL_CENTS } from './pricing';

export const SERVICE_RATES = {
  workspace_setup_hourly_cents: 12_500,
  consulting_hourly_cents: 15_000,
} as const;

export interface CustomerJourneyStep {
  step: string;
  title: string;
  body: string;
}

/** NGO customer path — not the internal staff CRM. */
export const CUSTOMER_JOURNEY: CustomerJourneyStep[] = [
  {
    step: '01',
    title: 'We find the gap',
    body: 'Registry data shows no site, site down, or standards not met. Outreach is evidence-based.',
  },
  {
    step: '02',
    title: `Landing package ($${LANDING_STANDARDS_PACKAGE_CENTS / 100})`,
    body: 'Trust landing page, education on how standards work, and checklist wired up — especially if they need a proper web presence.',
  },
  {
    step: '03',
    title: ORGANISATION_WORKSPACE_NAME,
    body: `${ORGANISATION_WORKSPACE_TAGLINE}. Track criteria, uploads, and progress — separate from our internal staff tools.`,
  },
  {
    step: '04',
    title: 'Already have a website?',
    body: 'We help them meet public trust standards in place. When ready, membership + Reality Badge ($100/yr).',
  },
  {
    step: '05',
    title: 'Membership & care',
    body: `${MEMBER_MONITORING_SUMMARY}. Email if something looks wrong; phone consultation included in the relationship.`,
  },
  {
    step: '06',
    title: 'Custom solutions',
    body: 'Larger builds or integrations quoted as projects — partner pricing when they need more than the standard package.',
  },
];

export interface RevenueStream {
  id: string;
  title: string;
  price: string;
  description: string;
  icon: 'badge' | 'monitor' | 'workspace' | 'web' | 'custom';
}

export const REVENUE_STREAMS: RevenueStream[] = [
  {
    id: 'membership',
    title: 'Annual membership',
    price: `$${MEMBERSHIP_ANNUAL_CENTS / 100} NZD / year`,
    description: `Reality Badge after public standards pass. ${MEMBER_MONITORING_SUMMARY}. Consultation by phone when they need help.`,
    icon: 'badge',
  },
  {
    id: 'landing',
    title: 'Trust landing + standards',
    price: `$${LANDING_STANDARDS_PACKAGE_CENTS / 100} NZD (package)`,
    description: LANDING_STANDARDS_PACKAGE_LABEL,
    icon: 'web',
  },
  {
    id: 'workspace',
    title: ORGANISATION_WORKSPACE_NAME,
    price: `From $${SERVICE_RATES.workspace_setup_hourly_cents / 100}/hr setup`,
    description:
      'Customer-facing organisation portal (not our internal staff CRM): criteria tracking, documents, and badge readiness. Onboarding and training bundled into projects.',
    icon: 'workspace',
  },
  {
    id: 'custom',
    title: 'Custom solutions',
    price: 'Quoted projects',
    description:
      'Bespoke sites, integrations, or remediation for NGOs that need more than the standard package. Flexible deals for partners with existing websites.',
    icon: 'custom',
  },
];

export interface ChecklistAnswer {
  id: string;
  label: string;
  section: string;
  answer: string;
}

export const MSD_CHECKLIST_ANSWERS: ChecklistAnswer[] = [
  {
    id: 'structure',
    label: 'Trading structure (sole trader / company) and why',
    section: 'Ownership',
    answer:
      'Operate as a New Zealand company (or sole trader during startup) to limit personal liability and invoice charity clients. A company fits when selling fixed packages ($650 landing/setup) and annual memberships. Responsibilities: IRD, GST when registered, director duties, separate business banking.',
  },
  {
    id: 'place',
    label: 'Where you trade — physical and digital channels',
    section: 'Place',
    answer:
      'Home-based admin. Customers reach us via ngoreality.com, the Organisation Workspace (NGO portal), email outreach from registry data, and phone consultation. Internal staff use a separate operations console — not sold as “CRM” to charities. Delivery is digital: verification, ~daily monitoring, landing pages, and education.',
  },
  {
    id: 'idea',
    label: 'Business idea and growth plans',
    section: 'Executive summary / Growth',
    answer:
      `NGOreality is a trust and implementation partner for nonprofits: badge, standards, ${MEMBER_MONITORING_SUMMARY.toLowerCase()}, plus landing packages and the ${ORGANISATION_WORKSPACE_NAME}. Year 1: memberships + $650 setups + custom projects. Year 2: hire delivery support. Year 3: AU registry. Growth uses live data on which charities have no site or a down site.`,
  },
  {
    id: 'skills',
    label: 'Skills to operate (technical + business)',
    section: 'Skills and knowledge',
    answer:
      'Full-stack web, product design, NGO sector sales, grant writing. We operate our own internal staff console, monitoring workers, and member email alerts. Advisers cover legal and accounting gaps.',
  },
  {
    id: 'processes',
    label: 'Operational processes',
    section: 'Operational processes',
    answer:
      `1) Registry import + outreach insights. 2) Sell $650 landing/standards package where needed. 3) Onboard to ${ORGANISATION_WORKSPACE_NAME}. 4) Education + criteria pass. 5) $100 membership → badge + ~24h monitoring + report rhythm + email if down. 6) Phone consultation as needed. 7) Custom quotes for larger NGOs. Internal fulfilment tracked in staff operations console (not customer-facing).`,
  },
  {
    id: 'assets',
    label: 'Equipment owned vs capitalisation grant',
    section: 'Assets / Capitalisation',
    answer:
      'Year 1 from home in Auckland. Capitalisation grant up to $10,000 funds a Mac Studio M4 Max (64GB/1TB) for local models and monitoring automation, logo/brand refresh, and business cards. Founder operates solo until month 9; then part-time customer care and (month 10+) a contract technical engineer plus a small shared office. Line-by-line forecast on CRM Cash flow — Apply Auckland forecast.',
  },
  {
    id: 'product',
    label: 'Product/service, price, and cost to deliver',
    section: 'What we sell',
    answer: `Membership $${MEMBERSHIP_ANNUAL_CENTS / 100}/yr (badge + ${MEMBER_MONITORING_SUMMARY.toLowerCase()} + consultation relationship). Landing/standards package $${LANDING_STANDARDS_PACKAGE_CENTS / 100}. ${ORGANISATION_WORKSPACE_NAME} setup from $${SERVICE_RATES.workspace_setup_hourly_cents / 100}/hr. Custom projects quoted. ${MEMBER_MONITORING_DETAIL} Cost: hosting, email API, founder time.`,
  },
  {
    id: 'research',
    label: 'Research and evidence of demand',
    section: 'Research',
    answer:
      'NZ Charities Register (~29k orgs) in our database with live stats: % without website, % site down, % profile-ready. Outreach proves messaging. Competitors: generic uptime (no badge/education), charity raters (different category).',
  },
  {
    id: 'pod',
    label: 'Point of difference',
    section: 'Point of difference',
    answer:
      `Not just verify or ping hourly. We combine registry intelligence, standards education, $650 setup package, ${ORGANISATION_WORKSPACE_NAME}, badge, human consultation, and ~daily monitoring with email when something is wrong. We help NGOs fix what the data already shows is broken.`,
  },
  {
    id: 'market',
    label: 'Market size and target customer',
    section: 'Marketing — market',
    answer:
      'All NZ registered charities; first segment = listed orgs with weak or missing web presence. Secondary = funders wanting verified lists. Size from registry insights on Dashboard and Business plan.',
  },
  {
    id: 'promo',
    label: 'Marketing and promotional activities',
    section: 'Marketing — promotional',
    answer:
      'Segmented outreach (“your site is down / no site”), badge explainer content, LinkedIn, sector networks, case studies. Costs in Cash flow. Flexi-Wage supports founder ramp.',
  },
  {
    id: 'financials',
    label: 'Financials: forecast, cashflow, P&L, breakeven',
    section: 'Financial information',
    answer:
      '12-month cashflow on CRM Cash flow page (Excel formulas, CSV export). Revenue: memberships, $650 packages, Flexi-Wage, grants, custom projects. Breakeven when recurring + projects cover costs — see closing balance row.',
  },
  {
    id: 'tax_acc',
    label: 'Taxes and ACC in forecast',
    section: 'Taxation',
    answer: 'GST, income tax, ACC reserves in cashflow lines. Accountant for annual compliance.',
  },
  {
    id: 'compliance',
    label: 'Compliance and insurance',
    section: 'Compliance / Risk',
    answer: 'Privacy Act, clear verification disclaimer, insurance quotes in appendix. Activity audit trail in internal systems.',
  },
  {
    id: 'advisers',
    label: 'Advisers and mentors',
    section: 'Professional advisers',
    answer: 'Flexi-Wage mentor, accountant, legal — names in appendix.',
  },
  {
    id: 'threats',
    label: 'Threats, mitigation, and SWOT',
    section: 'Risk assessment',
    answer:
      'Threats: long NGO sales cycles, alert fatigue. Mitigation: education-first $650 package, consultation, registry pipeline. SWOT in appendix.',
  },
  {
    id: 'staff',
    label: 'Staff and roles',
    section: 'Staffing',
    answer: 'Year 1 founder; Year 2+ part-time support and contract delivery for landing packages. Payroll when revenue supports it.',
  },
  {
    id: 'community',
    label: 'Community and environmental impact',
    section: 'Environmental / community',
    answer: 'Stronger public trust in charities; free directory browsing; digital-low footprint delivery.',
  },
];

export const FLEXI_WAGE_SUMMARY = {
  monthly: FLEXI_WAGE_MONTHLY_CENTS / 100,
  months: FLEXI_WAGE_DEFAULT_MONTHS,
  total: (FLEXI_WAGE_MONTHLY_CENTS * FLEXI_WAGE_DEFAULT_MONTHS) / 100,
};
