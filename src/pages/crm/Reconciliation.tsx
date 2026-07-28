import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, Landmark, Search } from 'lucide-react';
import { SectionHeader } from '../../components/ui';
import {
  listPendingPayments,
  matchReference,
  reconcilePayment,
  type PendingPayment,
  type ReferenceMatch,
} from '../../lib/reconciliation';
import { PAYMENT_PRODUCT_LABELS } from '../../types';
import { NGO_BANK_ACCOUNT } from '../../config/billing';

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(cents / 100);
}

function daysWaiting(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Turns a line on a bank statement into an active membership.
 *
 * The workflow this replaces: read the statement, find the NGR- code, search
 * the CRM, open the org, click "record payment", hope it was the right one.
 * Here the reference is pasted once and the matching payment is found for you.
 */
export default function Reconciliation() {
  const [pending, setPending] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setPending(await listPendingPayments(200));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const matches: ReferenceMatch[] = useMemo(
    () => (query.trim() ? matchReference(query, pending) : []),
    [query, pending],
  );

  // With no search, show everything outstanding — the daily worklist.
  const rows: ReferenceMatch[] = query.trim()
    ? matches
    : pending.map((p) => ({ payment: p, confidence: 'none' as const }));

  async function clear(match: ReferenceMatch) {
    const p = match.payment;
    setBusyId(p.id);
    setError(null);
    setMessage(null);

    const result = await reconcilePayment({
      paymentId: p.id,
      organizationId: p.organization_id,
      productType: p.product_type,
      // Prefer what the bank actually showed; fall back to the expected code.
      bankReference: query.trim() || p.bank_transfer_reference || '',
      amountCents: p.amount_cents,
    });

    if (result.error) setError(result.error);
    else setMessage(result.message ?? 'Payment recorded.');

    setBusyId(null);
    setQuery('');
    await refetch();
  }

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 mb-6"
      >
        <ArrowLeft size={14} /> Dashboard
      </Link>

      <SectionHeader>Bank reconciliation</SectionHeader>
      <p className="font-mono text-2xs text-ink-500 -mt-4 mb-6">
        Paste a reference from your {NGO_BANK_ACCOUNT.bankName} statement to find its payment and
        activate the membership.
      </p>

      <div className="card-brutal p-4 mb-6">
        <label htmlFor="bankref" className="label-brutal">
          Reference from the bank statement
        </label>
        <div className="relative mt-2">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            aria-hidden
          />
          <input
            id="bankref"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. NGR-4F2A9C11, or however your bank mangled it"
            className="w-full border-3 border-ink-950 bg-white py-2.5 pl-9 pr-3 font-mono text-sm"
            autoFocus
          />
        </div>
        {/* Banks strip punctuation, uppercase, and prepend their own text. */}
        <p className="mt-2 font-mono text-2xs text-ink-500">
          Case, spaces and dashes are ignored, so “ngr 4f2a9c11” matches “NGR-4F2A9C11”.
        </p>
      </div>

      {message && (
        <div className="card-brutal mb-4 flex items-start gap-2 border-emerald-600 p-3 text-sm">
          <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="card-brutal mb-4 flex items-start gap-2 border-red-600 p-3 text-sm" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {query.trim() && matches.length === 0 && !loading && (
        <div className="card-brutal mb-4 p-4 text-sm">
          <p className="font-medium">No pending payment matches that reference.</p>
          <p className="mt-1 text-ink-600">
            The transfer may be for something else, the charity may have quoted the wrong code, or
            it may already have been reconciled. Clear the box to see everything outstanding.
          </p>
        </div>
      )}

      <div className="card-brutal overflow-hidden">
        <div className="border-b-3 border-ink-950 p-3">
          <h2 className="font-mono text-2xs uppercase tracking-wider">
            {query.trim() ? `Matches (${matches.length})` : `Awaiting payment (${pending.length})`}
          </h2>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-ink-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-400">
            Nothing outstanding — every membership payment is reconciled.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-ink-200 text-left font-mono text-2xs uppercase tracking-wider">
                  <th className="p-3">Organisation</th>
                  <th className="p-3">Expected ref</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Waiting</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map(({ payment: p, confidence }) => {
                  const waited = daysWaiting(p.created_at);
                  return (
                    <tr key={p.id} className={confidence === 'exact' ? 'bg-emerald-50' : undefined}>
                      <td className="p-3">
                        <Link
                          to={`/organizations/${p.organization_id}`}
                          className="font-medium hover:text-accent"
                        >
                          {p.organizations?.name ?? '—'}
                        </Link>
                        {confidence === 'partial' && (
                          <span className="ml-2 border border-amber-600 px-1 font-mono text-2xs uppercase text-amber-700">
                            partial
                          </span>
                        )}
                        {confidence === 'exact' && (
                          <span className="ml-2 border border-emerald-600 px-1 font-mono text-2xs uppercase text-emerald-700">
                            exact
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-2xs">
                        {p.bank_transfer_reference || p.organizations?.payment_reference || '—'}
                      </td>
                      <td className="p-3 text-xs">
                        {PAYMENT_PRODUCT_LABELS[p.product_type] ?? p.product_type}
                      </td>
                      <td className="p-3 whitespace-nowrap">{money(p.amount_cents, p.currency)}</td>
                      <td
                        className={`p-3 font-mono text-2xs ${waited >= 7 ? 'font-bold text-red-600' : 'text-ink-500'}`}
                      >
                        {waited === 0 ? 'today' : `${waited}d`}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => void clear({ payment: p, confidence })}
                          disabled={busyId === p.id}
                          className="btn-brutal-gold whitespace-nowrap px-3 py-2 text-2xs"
                        >
                          {busyId === p.id ? 'Recording…' : 'Mark received'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card-brutal mt-6 p-4">
        <h2 className="flex items-center gap-2 font-mono text-2xs uppercase tracking-wider">
          <Landmark size={14} aria-hidden /> Account members pay into
        </h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-mono text-2xs uppercase text-ink-500">Name</dt>
            <dd>{NGO_BANK_ACCOUNT.accountName}</dd>
          </div>
          <div>
            <dt className="font-mono text-2xs uppercase text-ink-500">Bank</dt>
            <dd>{NGO_BANK_ACCOUNT.bankName}</dd>
          </div>
          <div>
            <dt className="font-mono text-2xs uppercase text-ink-500">Account</dt>
            <dd className="font-mono">{NGO_BANK_ACCOUNT.accountNumber}</dd>
          </div>
        </dl>
        <p className="mt-3 font-mono text-2xs text-ink-500">
          Marking a membership received activates it immediately: badge eligibility, hourly
          monitoring, and the welcome email.
        </p>
      </div>
    </div>
  );
}
