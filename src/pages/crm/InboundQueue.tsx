import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganizationsPage } from '../../hooks/useCrm';
import { SectionHeader } from '../../components/ui';
import { registerAsCustomer } from '../../lib/crmOutreach';
import { useConfirm } from '../../contexts/ConfirmContext';
import PipelineGuide from '../../components/crm/PipelineGuide';
import { ArrowLeft, UserPlus, Mail } from 'lucide-react';

export default function InboundQueue() {
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const { organizations, totalCount, totalPages, loading, refetch } = useOrganizationsPage(
    { inboundOnly: true },
    page,
    50,
  );

  const handleCustomer = async (orgId: string, name: string) => {
    const ok = await confirm({
      title: 'Register as customer?',
      description: `Register "${name}" as a customer?`,
      confirmLabel: 'Register',
    });
    if (!ok) return;
    await registerAsCustomer(orgId);
    refetch();
  };

  const withEmail = organizations.filter((o) => o.email?.trim());

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        to="/outreach"
        className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 mb-6"
      >
        <ArrowLeft size={14} /> Back to outreach board
      </Link>

      <SectionHeader>Inbound queue</SectionHeader>
      <PipelineGuide variant="inbound" />

      {withEmail.length > 0 && (
        <div className="mb-6 card-brutal p-4">
          <p className="text-sm text-ink-600 mb-2">
            <Mail size={14} className="inline mr-1" />
            {withEmail.length} on this page have email (of {organizations.length} shown).
          </p>
          <p className="font-mono text-2xs text-ink-400">
            Bulk email to all customers: use <Link to="/customers" className="text-accent underline">Customers</Link> once registered.
          </p>
        </div>
      )}

      <div className="card-brutal overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-sm text-ink-400">Loading…</p>
        ) : organizations.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-400">No inbound leads yet. Move contacted NGOs to Registered on the outreach board.</p>
        ) : (
          <div className="divide-y divide-ink-100">
            {organizations.map((org) => (
              <div key={org.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link to={`/organizations/${org.id}`} className="text-sm font-semibold hover:text-accent">
                    {org.name}
                  </Link>
                  <p className="font-mono text-2xs text-ink-400 mt-0.5">
                    {org.email || 'No email'} · #{org.charity_registration_number || org.external_id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCustomer(org.id, org.name)}
                  className="btn-brutal-accent text-xs flex items-center justify-center gap-1 min-h-[44px] px-4 w-full sm:w-auto"
                >
                  <UserPlus size={14} /> Register as customer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 font-mono text-2xs">
          <span>
            {totalCount.toLocaleString()} inbound · page {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-brutal-outline px-3 py-2 min-h-[44px] disabled:opacity-40">
              Prev
            </button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-brutal-outline px-3 py-2 min-h-[44px] disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
