import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganizationsPage } from '../../hooks/useCrm';
import { SectionHeader, StatusPill } from '../../components/ui';
import PipelineGuide from '../../components/crm/PipelineGuide';
import { Mail, Copy, ArrowLeft } from 'lucide-react';

export default function CustomersList() {
  const [page, setPage] = useState(1);
  const { organizations, totalCount, totalPages, loading } = useOrganizationsPage(
    { isCustomer: true },
    page,
    50,
  );

  const emails = useMemo(
    () =>
      organizations
        .map((o) => o.email?.trim())
        .filter((e): e is string => Boolean(e)),
    [organizations],
  );

  const [copied, setCopied] = useState(false);

  const copyEmails = async () => {
    if (emails.length === 0) return;
    await navigator.clipboard.writeText(emails.join(', '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        to="/outreach"
        className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 mb-6"
      >
        <ArrowLeft size={14} /> Outreach & leads
      </Link>

      <SectionHeader>Customers</SectionHeader>
      <PipelineGuide variant="customers" />

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          type="button"
          onClick={copyEmails}
          disabled={emails.length === 0}
          className="btn-brutal-outline text-sm flex items-center gap-2 min-h-[44px] disabled:opacity-40"
        >
          <Copy size={16} /> {copied ? 'Copied!' : `Copy emails on this page (${emails.length})`}
        </button>
        <p className="font-mono text-2xs text-ink-400 self-center">
          Full customer count: {loading ? '…' : totalCount.toLocaleString()}
        </p>
      </div>

      <div className="card-brutal overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-sm text-ink-400">Loading…</p>
        ) : organizations.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-400">
            No customers yet. Use <strong>Register as customer</strong> on the outreach board or inbound queue.
          </p>
        ) : (
          <div className="divide-y divide-ink-100">
            {organizations.map((org) => (
              <Link
                key={org.id}
                to={`/organizations/${org.id}`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-ink-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{org.name}</p>
                  <p className="font-mono text-2xs text-ink-400 flex items-center gap-1 mt-0.5">
                    {org.email ? (
                      <>
                        <Mail size={10} /> {org.email}
                      </>
                    ) : (
                      'No email'
                    )}
                  </p>
                </div>
                <StatusPill status={org.status} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between mt-4 font-mono text-2xs">
          <span>Page {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-brutal-outline px-3 min-h-[44px]">
              Prev
            </button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-brutal-outline px-3 min-h-[44px]">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
