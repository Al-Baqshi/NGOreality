import { Link } from 'react-router-dom';
import { usePaymentsLedger } from '../../hooks/useCrm';
import { SectionHeader } from '../../components/ui';
import { PAYMENT_PRODUCT_LABELS, PAYMENT_STATUS_LABELS } from '../../types';
import { ArrowLeft } from 'lucide-react';

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(cents / 100);
}

export default function PaymentsList() {
  const { payments, loading } = usePaymentsLedger(200);

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 mb-6"
      >
        <ArrowLeft size={14} /> Dashboard
      </Link>

      <SectionHeader>Payments</SectionHeader>
      <p className="font-mono text-2xs text-ink-500 -mt-4 mb-6">
        Badge $50/year · Monitoring $13/month · Record bank transfers on each org, or Stripe when connected.
      </p>

      <div className="card-brutal overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-sm text-ink-400">Loading…</p>
        ) : payments.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-400">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-3 border-ink-950 font-mono text-2xs uppercase tracking-wider text-left">
                  <th className="p-3">Date</th>
                  <th className="p-3">Organisation</th>
                  <th className="p-3">Reference</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="p-3 font-mono text-2xs whitespace-nowrap">
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="p-3">
                      <Link to={`/organizations/${p.organization_id}`} className="font-medium hover:text-accent">
                        {p.organizations?.name ?? '—'}
                      </Link>
                    </td>
                    <td className="p-3 font-mono text-2xs">{p.organizations?.payment_reference ?? '—'}</td>
                    <td className="p-3 text-xs">{PAYMENT_PRODUCT_LABELS[p.product_type]}</td>
                    <td className="p-3">{formatMoney(p.amount_cents, p.currency)}</td>
                    <td className="p-3 font-mono text-2xs uppercase">{PAYMENT_STATUS_LABELS[p.status]}</td>
                    <td className="p-3 font-mono text-2xs">{p.payment_method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
