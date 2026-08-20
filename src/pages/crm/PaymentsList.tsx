import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePaymentsLedger } from '../../hooks/useCrm';
import { EmptyState, MetricCard, SectionHeader } from '../../components/ui';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_PRODUCT_LABELS,
  PAYMENT_STATUS_LABELS,
  type PaymentMethod,
  type PaymentStatus,
} from '../../types';
import { MEMBERSHIP_ANNUAL_CENTS, GST_PRICE_SUFFIX, PRICING_CURRENCY } from '../../config/pricing';
import { ArrowLeft, Check, Copy, CreditCard, Landmark, Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const FILTER_TRIGGER =
  'h-auto w-full min-h-[44px] min-w-[11rem] rounded-none border-3 border-ink-950 bg-white px-3 py-2 font-mono text-sm text-ink-950 shadow-none hover:bg-gold-light/50 focus-visible:border-ink-950 focus-visible:ring-2 focus-visible:ring-gold data-[size=default]:h-auto dark:border-border dark:bg-card dark:text-foreground';
const FILTER_CONTENT =
  'rounded-none border-3 border-ink-950 bg-white p-1 shadow-brutal max-h-72 dark:border-border dark:bg-card';
const FILTER_ITEM =
  'rounded-none py-2.5 pl-3 pr-8 text-sm text-ink-950 focus:bg-gold focus:text-ink-950 data-highlighted:bg-gold dark:text-foreground';

const PAGE_SIZE = 25;
const STATUSES: PaymentStatus[] = ['pending', 'paid', 'failed', 'refunded', 'cancelled'];
const METHODS: PaymentMethod[] = ['bank_transfer', 'stripe', 'manual'];

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(cents / 100);
}

function statusClass(status: PaymentStatus): string {
  if (status === 'paid') return 'border-gold bg-gold-light text-ink-950';
  if (status === 'pending') return 'border-ink-300 bg-ink-50 text-ink-700';
  if (status === 'failed' || status === 'refunded') return 'border-accent bg-accent-light text-accent';
  return 'border-ink-200 bg-white text-ink-500';
}

export default function PaymentsList() {
  const { payments, loading } = usePaymentsLedger(500);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (methodFilter !== 'all' && p.payment_method !== methodFilter) return false;
      if (!q) return true;
      const name = p.organizations?.name ?? '';
      const ref = p.organizations?.payment_reference ?? '';
      const bank = p.bank_transfer_reference ?? '';
      return (
        name.toLowerCase().includes(q) ||
        ref.toLowerCase().includes(q) ||
        bank.toLowerCase().includes(q)
      );
    });
  }, [payments, search, statusFilter, methodFilter]);

  const summary = useMemo(() => {
    const paid = payments.filter((p) => p.status === 'paid');
    const pending = payments.filter((p) => p.status === 'pending');
    const paidCents = paid.reduce((sum, p) => sum + p.amount_cents, 0);
    const pendingCents = pending.reduce((sum, p) => sum + p.amount_cents, 0);
    const currency = payments[0]?.currency ?? PRICING_CURRENCY;
    return {
      paidCount: paid.length,
      pendingCount: pending.length,
      paidCents,
      pendingCents,
      currency,
    };
  }, [payments]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const copyRef = async (id: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);
  };

  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 mb-6 min-h-[44px]"
      >
        <ArrowLeft size={14} /> Dashboard
      </Link>

      <SectionHeader
        action={
          <Link
            to="/reconciliation"
            className="btn-brutal-outline text-sm inline-flex min-h-[44px] items-center gap-2"
          >
            <Landmark size={16} /> Reconcile bank
          </Link>
        }
      >
        Payments
      </SectionHeader>
      <p className="font-mono text-2xs text-ink-500 -mt-4 mb-6 max-w-2xl leading-relaxed">
        Annual membership {formatMoney(MEMBERSHIP_ANNUAL_CENTS, PRICING_CURRENCY)} {GST_PRICE_SUFFIX}{' '}
        (badge + monitoring). Record on the organisation after standards pass, or match a bank line
        on Reconciliation.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <MetricCard
          label="Paid"
          value={formatMoney(summary.paidCents, summary.currency)}
          sub={`${summary.paidCount} recorded`}
          currency
          compact
          accent
        />
        <MetricCard
          label="Awaiting bank"
          value={summary.pendingCount}
          sub={
            summary.pendingCount
              ? `${formatMoney(summary.pendingCents, summary.currency)} outstanding`
              : 'Nothing waiting'
          }
          compact
        />
        <MetricCard
          label="Membership price"
          value={formatMoney(MEMBERSHIP_ANNUAL_CENTS, PRICING_CURRENCY)}
          sub={`per year ${GST_PRICE_SUFFIX}`}
          currency
          compact
        />
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end gap-3 mb-6">
        <label className="flex min-w-0 flex-[2] flex-col gap-1.5">
          <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-ink-500">Search</span>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Organisation or NGR reference…"
              className="input-brutal w-full pl-10 min-h-[44px]"
              aria-label="Search payments"
            />
          </div>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-ink-500">Status</span>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter((v as typeof statusFilter) || 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className={FILTER_TRIGGER} aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={FILTER_CONTENT} align="start" alignItemWithTrigger={false}>
              <SelectItem value="all" className={FILTER_ITEM}>All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className={FILTER_ITEM}>
                  {PAYMENT_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-ink-500">Method</span>
          <Select
            value={methodFilter}
            onValueChange={(v) => {
              setMethodFilter((v as typeof methodFilter) || 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className={FILTER_TRIGGER} aria-label="Filter by method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={FILTER_CONTENT} align="start" alignItemWithTrigger={false}>
              <SelectItem value="all" className={FILTER_ITEM}>All methods</SelectItem>
              {METHODS.map((m) => (
                <SelectItem key={m} value={m} className={FILTER_ITEM}>
                  {PAYMENT_METHOD_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="card-brutal overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-sm text-ink-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<CreditCard size={48} />}
            title={payments.length === 0 ? 'No payments recorded yet' : 'No matching payments'}
            description={
              payments.length === 0
                ? 'Record membership on an organisation after standards pass, or match a bank transfer on Reconciliation.'
                : 'Try a different search or clear the filters.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-950 font-mono text-2xs uppercase tracking-wider text-gold text-left">
                  <th className="p-3 whitespace-nowrap">Date</th>
                  <th className="p-3">Organisation</th>
                  <th className="p-3 whitespace-nowrap">Reference</th>
                  <th className="p-3">Product</th>
                  <th className="p-3 whitespace-nowrap">Amount</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {pageRows.map((p) => {
                  const ref = p.organizations?.payment_reference;
                  return (
                    <tr key={p.id} className="hover:bg-gold-light/30">
                      <td className="p-3 font-mono text-2xs whitespace-nowrap text-ink-600">
                        {p.paid_at
                          ? new Date(p.paid_at).toLocaleDateString()
                          : new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 min-w-[12rem]">
                        <Link
                          to={`/organizations/${p.organization_id}`}
                          className="font-medium hover:text-gold"
                        >
                          {p.organizations?.name ?? '—'}
                        </Link>
                      </td>
                      <td className="p-3">
                        {ref ? (
                          <button
                            type="button"
                            onClick={() => void copyRef(p.id, ref)}
                            className="inline-flex items-center gap-1 font-mono text-2xs text-ink-700 hover:text-ink-950"
                            title="Copy payment reference"
                          >
                            {copiedId === p.id ? <Check size={12} className="text-gold" /> : <Copy size={12} />}
                            {ref}
                          </button>
                        ) : (
                          <span className="font-mono text-2xs text-ink-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-xs">{PAYMENT_PRODUCT_LABELS[p.product_type]}</td>
                      <td className="p-3 font-semibold whitespace-nowrap">
                        {formatMoney(p.amount_cents, p.currency)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex border px-2 py-0.5 font-mono text-2xs uppercase tracking-wider ${statusClass(p.status)}`}
                        >
                          {PAYMENT_STATUS_LABELS[p.status]}
                        </span>
                        {p.status === 'pending' && (
                          <Link
                            to="/reconciliation"
                            className="mt-1 block font-mono text-2xs text-gold hover:underline"
                          >
                            Reconcile
                          </Link>
                        )}
                      </td>
                      <td className="p-3 font-mono text-2xs text-ink-600">
                        {PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="font-mono text-2xs text-ink-500 uppercase tracking-wider">
            Showing {((safePage - 1) * PAGE_SIZE + 1).toLocaleString()}–
            {Math.min(safePage * PAGE_SIZE, filtered.length).toLocaleString()} of{' '}
            {filtered.length.toLocaleString()}
          </p>
          {totalPages > 1 && (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-brutal-outline text-2xs min-h-[40px] px-3 disabled:opacity-40"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-brutal-outline text-2xs min-h-[40px] px-3 disabled:opacity-40"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
