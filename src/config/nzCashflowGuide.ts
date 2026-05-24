/**
 * NZ cashflow line explanations (MSD / IRD template alignment).
 * Not tax advice — confirm registration and GST treatment with your accountant.
 */

export const NZ_GST_RATE = 0.15;
export const NZ_GST_RATE_LABEL = '15%';

export interface CashflowLineGuide {
  key: string;
  title: string;
  summary: string;
  gstNote?: string;
}

export const NZ_CASHFLOW_RECEIPT_GUIDE: CashflowLineGuide[] = [
  {
    key: 'sales',
    title: 'Membership — Reality Badge ($100/yr)',
    summary:
      'Trading income when a charity pays annual membership after passing public trust standards. CRM “Record membership paid” rolls into Actual on this line.',
    gstNote: `Usually ${NZ_GST_RATE_LABEL} GST if you are GST-registered (price may be shown GST-inclusive).`,
  },
  {
    key: 'sales_other',
    title: 'Landing + standards package ($650)',
    summary:
      'One-off project revenue: trust landing page, standards education, checklist setup. Driven by “packages” units in the volume block.',
    gstNote: `Typically ${NZ_GST_RATE_LABEL} GST on NZ supplies.`,
  },
  {
    key: 'workspace_saas',
    title: 'Organisation Workspace SaaS',
    summary:
      'Monthly subscription from charities using their organisation portal ($25 admin + $15/extra user in the model). Driven by “workspace active” units.',
    gstNote: `SaaS to NZ charities is generally ${NZ_GST_RATE_LABEL} GST unless your accountant advises otherwise.`,
  },
  {
    key: 'flexi_wage',
    title: 'Flexi-Wage',
    summary:
      'MSD self-employment support paid to you while establishing the business — not customer sales. Default $2,400/mo for months 1–6 in the forecast.',
    gstNote: 'Not GST on Flexi-Wage receipts; it is personal income support.',
  },
  {
    key: 'govt_grant',
    title: 'Govt. grant (capitalisation)',
    summary:
      'One-off capitalisation grant in month 1 (e.g. equipment / setup). Treat separately from recurring trading income in your written plan.',
    gstNote: 'Grant GST treatment depends on grant terms — confirm with MSD / accountant.',
  },
  {
    key: 'other_income',
    title: 'Other income (e.g. CS + WFF)',
    summary: 'Non-trading cash such as Working for Families or child support if you model household cash in the same sheet.',
    gstNote: 'Generally not business GST.',
  },
  {
    key: 'other_receipts',
    title: 'Other receipts',
    summary:
      'Owner capital you put into the business (e.g. opening $3,000) — funds the bank account but is not revenue/profit.',
    gstNote: 'Not taxable income; balance-sheet injection.',
  },
  {
    key: 'gst_received',
    title: 'GST received',
    summary:
      'GST you collect on taxable sales (shown separately so cash in the bank matches invoices). Often ~3/23 of GST-inclusive income if all sales are standard-rated.',
    gstNote: `Offset against GST on expenses; net goes to IRD via “Net GST payable”.`,
  },
];

export const NZ_CASHFLOW_PAYMENT_GUIDE: CashflowLineGuide[] = [
  {
    key: 'cog_materials',
    title: 'COG — materials purchased',
    summary:
      'Cost of physical materials you resell or use in delivery (print stock, cards, packaging). Software, hosting, and Claude/Cursor belong on Hosting or AI & dev tools — not here.',
    gstNote: `${NZ_GST_RATE_LABEL} GST on NZ purchases if you are registered.`,
  },
  {
    key: 'hosting_saas',
    title: 'Hosting & cloud',
    summary:
      'SaaS platform infrastructure: Vercel (app), database (Supabase/Neon), Resend (transactional email), domain. At ~30 NGOs and low workspace count this is roughly $80–120 NZD/mo — edit Expected to match your invoices.',
    gstNote: 'Often USD invoices; claim GST if supplier charges NZ GST or you use a NZ entity billing.',
  },
  {
    key: 'saas_ai_dev',
    title: 'AI & dev tools',
    summary:
      'Operating the product as a founder: Claude Max subscription, Cursor Pro, and API usage while building. Default ~$360/mo NZD in the forecast — adjust to your Anthropic/Cursor bills.',
    gstNote: 'Typically no NZ GST on overseas SaaS; still a real cash expense.',
  },
  {
    key: 'subscriptions',
    title: 'Professional subscriptions (misc)',
    summary:
      'Other business software not in Hosting or AI rows: GitHub, accounting add-ons, design tools, monitoring. Small placeholder in the default plan (~$45/mo).',
  },
  {
    key: 'it_internet',
    title: 'IT & internet',
    summary: 'Fibre and mobile for home/office — separate from cloud hosting.',
  },
  {
    key: 'bank_fees',
    title: 'Bank & Stripe merchant fees',
    summary: 'Stripe ~2.9% + 30¢ per charge on badge, $650 packages, and workspace MRR. Expected auto-calculates from receipt lines when you edit volume units.',
    gstNote: 'Stripe fees are not GST; they reduce cash from sales.',
  },
  {
    key: 'staff_wages',
    title: 'Staff wages',
    summary: 'PAYE wages when you hire (Flexi-Wage is on the receipt side, not wages).',
  },
  {
    key: 'marketing',
    title: 'Marketing and promotion',
    summary: 'Ads, events, brand setup in month 1 includes logo/print in the default Auckland forecast.',
  },
  {
    key: 'accountancy',
    title: 'Accountancy',
    summary: 'Bookkeeper or accountant for GST returns and year-end.',
  },
  {
    key: 'insurance',
    title: 'Insurance',
    summary: 'Public liability / professional indemnity as you scale.',
  },
  {
    key: 'overheads',
    title: 'Overheads (rent, power)',
    summary:
      'Office rent, power, cleaning, etc. Home-based early months; Auckland office rent placeholder from month 10 in the default forecast.',
    gstNote: `NZ commercial rent usually has ${NZ_GST_RATE_LABEL} GST if the landlord is registered.`,
  },
  {
    key: 'gst_paid',
    title: 'GST paid',
    summary: 'GST on business purchases (subscriptions, marketing, rent with GST, etc.).',
  },
  {
    key: 'net_gst_ird',
    title: 'Net GST payable to IRD',
    summary: 'GST collected minus GST paid — cash you set aside to pay Inland Revenue (usually two-monthly if registered).',
  },
  {
    key: 'drawings',
    title: 'Drawings — personal',
    summary: 'Money you take out for personal use (not wages). Reduces cash but is not an expense for income tax.',
  },
  {
    key: 'income_tax_reserve',
    title: 'Income tax reserve',
    summary: 'Cash set aside for provisional / terminal tax on business profit.',
  },
  {
    key: 'acc_reserve',
    title: 'ACC levy reserve',
    summary: 'Set aside for ACC earners’ levy on self-employed income.',
  },
];

/** How to read the bottom of the worksheet */
export const CASHFLOW_OUTCOME_FORMULAE = [
  { label: '(A) Total receipts', meaning: 'All cash in: sales, grants, Flexi-Wage, GST received, owner funds.' },
  { label: '(C) Total expenses', meaning: 'GST and non-GST business costs (wages, infra, rent, etc.).' },
  { label: 'Operating profit (A − C)', meaning: 'Trading result before drawings and tax reserves — “are we making money on operations?”' },
  { label: 'Net cashflow (A − E)', meaning: 'Cash left after everything including drawings and GST/tax set-asides — “what stays in the business bank?”' },
  { label: 'Closing bank balance', meaning: 'Running total month to month — month 12 shows where you expect to land.' },
] as const;

export const GLOBAL_TAX_NOTE =
  'Going global in ~6 months: keep NZ GST lines for the NZ entity; add country-specific VAT/GST and currency columns when you open AU/UK/etc. The volume → revenue link stays the same; tax lines duplicate per jurisdiction.';

const ALL_LINE_GUIDES = [...NZ_CASHFLOW_RECEIPT_GUIDE, ...NZ_CASHFLOW_PAYMENT_GUIDE];

/** One-line explanation for a cashflow row (NZ guide + optional def.guide on the line). */
export function cashflowLineGuideSummary(
  lineKey: string,
  defGuide?: string,
): string | undefined {
  if (defGuide?.trim()) return defGuide.trim();
  return ALL_LINE_GUIDES.find((g) => g.key === lineKey)?.summary;
}
