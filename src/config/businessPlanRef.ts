/**
 * Aligns CRM business plan + cashflow with ref/ templates:
 * - MSD Business Plan check List.docx (Flexi-Wage submission checklist)
 * - Cashflow Forecasting Template.xlsx (receipts / payments lines)
 * - PSG Business Plan Template.docx (narrative sections — see docs/BUSINESS_PLAN.md)
 */

export type CashflowSection = 'receipt' | 'expense_gst' | 'expense_non_gst' | 'other_payment';

export interface CashflowLineDef {
  key: string;
  section: CashflowSection;
  /** Label as in the MSD cashflow spreadsheet */
  label: string;
  /** Shown under the label on Cash flow (what this row is for). */
  guide?: string;
  /** Maps to CRM payment rollup when set */
  paymentActualKey?: 'sales';
  gst?: boolean;
}

/** Receipt lines (MSD template: RECEIPTS + Other Receipts) */
export const CASHFLOW_RECEIPT_LINES: CashflowLineDef[] = [
  {
    key: 'sales',
    section: 'receipt',
    label: 'Membership — Reality Badge ($70/yr)',
    paymentActualKey: 'sales',
  },
  { key: 'sales_other', section: 'receipt', label: 'Landing + standards package ($650)' },
  {
    key: 'workspace_saas',
    section: 'receipt',
    label: 'Organisation Workspace SaaS ($25/org/mo)',
  },
  { key: 'flexi_wage', section: 'receipt', label: 'Flexi-Wage' },
  { key: 'govt_grant', section: 'receipt', label: 'Govt. grant (capitalisation)' },
  { key: 'other_income', section: 'receipt', label: 'Other income (e.g. CS + WFF)' },
  { key: 'other_receipts', section: 'receipt', label: 'Other receipts' },
  { key: 'gst_received', section: 'receipt', label: 'GST received' },
];

/** Payment lines — GST expenses (LESS CASH PAYMENTS) */
export const CASHFLOW_EXPENSE_GST_LINES: CashflowLineDef[] = [
  {
    key: 'cog_materials',
    section: 'expense_gst',
    label: 'COG — materials purchased',
    guide: 'Physical goods only: print stock, badge cards, packaging — not software or hosting.',
    gst: true,
  },
  {
    key: 'it_internet',
    section: 'expense_gst',
    label: 'IT & internet (fibre + mobile)',
    guide: 'Home/office fibre and mobile for running the business (~$100/mo in the default forecast).',
    gst: true,
  },
  { key: 'maintenance', section: 'expense_gst', label: 'General maintenance and repairs', gst: true },
  { key: 'health_safety', section: 'expense_gst', label: 'Health & safety', gst: true },
  { key: 'accountancy', section: 'expense_gst', label: 'Accountancy and bookkeeping', gst: true },
  { key: 'training', section: 'expense_gst', label: 'Training and development', gst: true },
  {
    key: 'hosting_saas',
    section: 'expense_gst',
    label: 'Hosting & cloud (Vercel, DB, Resend)',
    guide: 'Platform hosting: Vercel (~$35) + Postgres tier ($65→$140 as data grows) + Resend email ($25→$55 as outreach/alerts scale) + domain ($3). ≈ $128/mo at launch rising to ≈ $233/mo at full year-1 volume — scales with members, not a flat fee.',
    gst: true,
  },
  {
    key: 'saas_ai_dev',
    section: 'expense_gst',
    label: 'AI & dev tools (Claude Max, Cursor)',
    guide: 'Founder/build stack: Claude Max (~$200/mo NZD), Cursor Pro, API headroom — not charity-facing COGS.',
    gst: true,
  },
  {
    key: 'subscriptions',
    section: 'expense_gst',
    label: 'Professional subscriptions (misc)',
    guide: 'Other SaaS: GitHub, Xero/accounting add-ons, design tools — not hosting or Claude (those are separate rows).',
    gst: true,
  },
  { key: 'cogs_setup', section: 'expense_gst', label: 'Incoming COG set-up costs', gst: true },
  { key: 'motor_vehicle', section: 'expense_gst', label: 'Motor vehicle expenses', gst: true },
  { key: 'insurance', section: 'expense_gst', label: 'Insurance', gst: true },
  { key: 'mv_insurance', section: 'expense_gst', label: 'MV insurance', gst: true },
  { key: 'marketing', section: 'expense_gst', label: 'Marketing and promotion', gst: true },
  { key: 'cogs_stock', section: 'expense_gst', label: 'Cost of goods — materials & stock', gst: true },
  { key: 'overheads', section: 'expense_gst', label: 'Overheads (rent, power)', gst: true },
  { key: 'loan_repayment', section: 'expense_gst', label: 'Repayment of loans', gst: true },
  { key: 'staff_wages', section: 'expense_gst', label: 'Staff wages and salaries', gst: true },
  { key: 'other_expense_gst', section: 'expense_gst', label: 'Other payments', gst: true },
];

export const CASHFLOW_EXPENSE_NON_GST_LINES: CashflowLineDef[] = [
  { key: 'bank_fees', section: 'expense_non_gst', label: 'Bank & Stripe merchant fees', gst: false },
  { key: 'other_non_gst', section: 'expense_non_gst', label: 'Other (non-GST)', gst: false },
];

export const CASHFLOW_OTHER_PAYMENT_LINES: CashflowLineDef[] = [
  { key: 'gst_paid', section: 'other_payment', label: 'GST paid' },
  { key: 'net_gst_ird', section: 'other_payment', label: 'Net GST payable to IRD' },
  { key: 'drawings', section: 'other_payment', label: 'Drawings — personal' },
  { key: 'income_tax_reserve', section: 'other_payment', label: 'Savings for income tax payments' },
  { key: 'acc_reserve', section: 'other_payment', label: 'Savings for ACC levy costs' },
];

export const ALL_CASHFLOW_LINES: CashflowLineDef[] = [
  ...CASHFLOW_RECEIPT_LINES,
  ...CASHFLOW_EXPENSE_GST_LINES,
  ...CASHFLOW_EXPENSE_NON_GST_LINES,
  ...CASHFLOW_OTHER_PAYMENT_LINES,
];

/** MSD Flexi-Wage self-employment support (from ref/Cashflow Forecasting Template.xlsx). */
export const FLEXI_WAGE_MONTHLY_CENTS = 240_000; // $2,400 NZD/month
export const FLEXI_WAGE_DEFAULT_MONTHS = 6; // months 1–6 in the 12-month forecast

/**
 * Expected $ auto-calculated from volume units (receipts) or receipt totals (bank_fees).
 * Professional subscriptions is editable — use Actual for real invoices; expected is your forecast.
 */
export const UNIT_DERIVED_LINE_KEYS = [
  'sales',
  'sales_other',
  'workspace_saas',
  'bank_fees',
] as const;

export type UnitDerivedLineKey = (typeof UNIT_DERIVED_LINE_KEYS)[number];

export const CASHFLOW_SECTION_LABELS: Record<CashflowSection, string> = {
  receipt: 'Receipts',
  expense_gst: 'Less cash payments (GST)',
  expense_non_gst: 'Non-GST expenses',
  other_payment: 'Other payments (GST, tax, drawings)',
};

/** Expense log categories — same labels as cashflow spreadsheet */
export const EXPENSE_CATEGORY_OPTIONS = [
  ...CASHFLOW_EXPENSE_GST_LINES.map((l) => l.label),
  ...CASHFLOW_EXPENSE_NON_GST_LINES.map((l) => l.label),
  'Hosting / infrastructure',
  'Software (SaaS)',
  'Other',
];

/**
 * MSD Flexi-Wage self-employment checklist (ref/MSD Business Plan check List.docx).
 * Use in CRM to confirm the written plan (docs/BUSINESS_PLAN.md) covers each item.
 */
export const MSD_FLEXIWAGE_CHECKLIST: { id: string; label: string; docSection?: string }[] = [
  { id: 'structure', label: 'Trading structure (sole trader / company) and why', docSection: 'Ownership' },
  { id: 'place', label: 'Where you trade — physical + digital channels (website, CRM)', docSection: 'Place' },
  { id: 'idea', label: 'Business idea described with growth plans', docSection: 'Executive summary / Growth' },
  { id: 'skills', label: 'Skills to operate (technical + business)', docSection: 'Skills and knowledge' },
  { id: 'processes', label: 'Operational processes documented', docSection: 'Operational processes' },
  { id: 'assets', label: 'Equipment owned vs capitalisation grant items', docSection: 'Assets / Capitalisation' },
  { id: 'product', label: 'Product/service, price, and cost to deliver', docSection: 'What we sell' },
  { id: 'research', label: 'Research methods and evidence of demand', docSection: 'Research' },
  { id: 'pod', label: 'Point of difference vs competitors', docSection: 'Point of difference' },
  { id: 'market', label: 'Market size and target customer described', docSection: 'Marketing — market' },
  { id: 'promo', label: 'Marketing and promotional activities', docSection: 'Marketing — promotional' },
  {
    id: 'financials',
    label: 'Financials: sales forecast, 12-month cashflow, P&L, breakeven',
    docSection: 'Financial information',
  },
  { id: 'tax_acc', label: 'Taxes and ACC included in forecast', docSection: 'Taxation' },
  { id: 'compliance', label: 'Compliance and insurance', docSection: 'Compliance / Risk' },
  { id: 'advisers', label: 'Advisers and mentors', docSection: 'Professional advisers' },
  { id: 'threats', label: 'Threats and mitigation (incl. SWOT)', docSection: 'Risk assessment' },
  { id: 'staff', label: 'Staff / contractors and roles', docSection: 'Staffing' },
  { id: 'community', label: 'Community and environmental impact', docSection: 'Environmental / community' },
];

export const PSG_NARRATIVE_SECTIONS = [
  'Executive summary',
  'The business idea',
  'What we sell — products and services',
  'Place',
  'Ownership',
  'Skills and knowledge',
  'Research',
  'Point of difference',
  'Operational processes',
  'Growth plans',
  'Staffing',
  'Professional advisers and mentors',
  'Compliance',
  'Risk assessment & backup plan',
  'Assets owned / capitalisation grant',
  'Marketing — market size and demand',
  'Marketing — identifying your customer',
  'Marketing — promotional activities & calendar',
  'Financial information — sales, cashflow, P&L, breakeven',
  'Taxes and ACC',
  'Environmental considerations and community involvement',
  'Appendices',
] as const;
