import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import {
  CASHFLOW_OUTCOME_FORMULAE,
  GLOBAL_TAX_NOTE,
  NZ_CASHFLOW_PAYMENT_GUIDE,
  NZ_CASHFLOW_RECEIPT_GUIDE,
  NZ_GST_RATE_LABEL,
} from '../../config/nzCashflowGuide';

function GuideList({ items }: { items: typeof NZ_CASHFLOW_RECEIPT_GUIDE }) {
  return (
    <ul className="space-y-3 text-xs text-ink-700 leading-relaxed">
      {items.map((item) => (
        <li key={item.key} className="border-l-2 border-ink-200 pl-3">
          <p className="font-semibold text-ink-950">{item.title}</p>
          <p className="mt-0.5">{item.summary}</p>
          {item.gstNote && <p className="mt-1 font-mono text-2xs text-ink-500">GST: {item.gstNote}</p>}
        </li>
      ))}
    </ul>
  );
}

export default function CashflowNzGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="card-brutal mb-6 overflow-hidden border-l-4 border-l-teal">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left min-h-[48px] hover:bg-ink-50/80"
      >
        <Info size={18} className="text-teal shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="font-mono text-2xs uppercase tracking-wider text-ink-500 block">New Zealand</span>
          <span className="font-semibold text-sm">GST ({NZ_GST_RATE_LABEL}), receipts &amp; profit lines explained</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-ink-100 grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="font-mono text-2xs uppercase text-emerald-800 mb-2">Green — receipts</h4>
            <GuideList items={NZ_CASHFLOW_RECEIPT_GUIDE} />
          </div>
          <div>
            <h4 className="font-mono text-2xs uppercase text-red-800 mb-2">Red — costs &amp; set-asides</h4>
            <GuideList items={NZ_CASHFLOW_PAYMENT_GUIDE} />
            <h4 className="font-mono text-2xs uppercase text-ink-700 mt-4 mb-2">Bottom of sheet — profit or loss?</h4>
            <ul className="space-y-2 text-xs text-ink-700">
              {CASHFLOW_OUTCOME_FORMULAE.map((row) => (
                <li key={row.label}>
                  <span className="font-semibold text-ink-950">{row.label}</span> — {row.meaning}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-2xs text-ink-500 font-mono leading-relaxed border-t border-ink-100 pt-3">
              {GLOBAL_TAX_NOTE}
            </p>
            <p className="mt-2 text-2xs text-ink-400 italic">Confirm GST registration and line treatment with your accountant.</p>
          </div>
        </div>
      )}
    </div>
  );
}
