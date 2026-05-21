import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';

/** Explains outreach → inbound → customer and where leads originate */
export default function PipelineGuide({ variant }: { variant: 'inbound' | 'customers' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <p className="font-mono text-2xs text-ink-500 leading-relaxed">
        <strong className="text-ink-700">Outreach</strong> = registry leads ·{' '}
        <strong className="text-ink-700">Inbound</strong> = showed interest ·{' '}
        <strong className="text-ink-700">Customers</strong> = paying verification
      </p>
    );
  }

  return (
    <details className="card-brutal mb-6 group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-mono text-2xs uppercase tracking-wider text-ink-600 min-h-[44px]">
        <Info size={14} className="shrink-0" />
        {variant === 'inbound' ? 'What is inbound vs customers?' : 'Pipeline: where do customers come from?'}
      </summary>
      <div className="px-4 pb-4 text-sm text-ink-600 space-y-3 border-t border-ink-100">
        <PipelineBody variant={variant} />
      </div>
    </details>
  );
}

function PipelineBody({ variant }: { variant: 'inbound' | 'customers' }) {
  return (
    <>
      <p>
        <strong className="text-ink-950">Outreach board</strong> (~29k NZ registry rows): staff track contact
        status (not contacted → contacted → follow-up). Still listed, not customers.
      </p>
      <p>
        <strong className="text-ink-950">Inbound queue</strong>: orgs you moved to Registered or Responded on
        outreach—they expressed interest but are not customers yet.
      </p>
      <p>
        <strong className="text-ink-950">Customers</strong>: you clicked Register as customer when starting paid
        verification ($50/yr badge) or services. Verification criteria are initialized; status moves to onboarding.
      </p>
      <p className="font-mono text-2xs text-ink-500 uppercase tracking-wider">Other entry points</p>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        <li>
          <Link to="/inquiries" className="text-teal hover:underline">
            Inquiries
          </Link>{' '}
          — public contact form (separate table; link org manually if needed)
        </li>
        <li>NGO portal signup — claim directory org or new org → onboarding (not auto-inbound)</li>
      </ul>
      {variant === 'inbound' && (
        <p className="text-ink-500 font-mono text-2xs">
          Tip: Register as customer when they agree to pay; use payment reference on the org record for bank transfer.
        </p>
      )}
    </>
  );
}
