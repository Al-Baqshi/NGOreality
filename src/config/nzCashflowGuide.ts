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
