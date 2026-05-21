import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCrmDashboardStats, useOrganizationsPage } from '../../hooks/useCrm';
import { SectionHeader } from '../../components/ui';
import OutreachKanbanCard from '../../components/crm/OutreachKanbanCard';
import { OUTREACH_KANBAN_STATUSES, OUTREACH_STATUS_LABELS, type OutreachStatus } from '../../types';
import { setOutreachStatus } from '../../lib/crmOutreach';
import { ArrowRight, Inbox, Users } from 'lucide-react';

function OutreachColumn({
  status,
  onGlobalRefresh,
}: {
  status: OutreachStatus;
  onGlobalRefresh: () => void;
}) {
  const { organizations, totalCount, loading, refetch } = useOrganizationsPage(
    { leadsOnly: true, outreach: status },
    1,
    30,
  );

  const refresh = useCallback(() => {
    refetch();
    onGlobalRefresh();
  }, [refetch, onGlobalRefresh]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const orgId = e.dataTransfer.getData('application/org-id');
    const from = e.dataTransfer.getData('application/from-status') as OutreachStatus;
    if (!orgId || from === status) return;
    await setOutreachStatus(orgId, status);
    refresh();
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={handleDrop}
      className="flex flex-col min-w-[272px] max-w-[320px] flex-1 border-3 border-ink-950 bg-surface-raised min-h-[320px]"
    >
      <div className="border-b-3 border-ink-950 px-3 py-3 bg-ink-950 text-white">
        <h3 className="font-mono text-2xs uppercase tracking-wider font-semibold">
          {OUTREACH_STATUS_LABELS[status]}
        </h3>
        <p className="font-mono text-2xs text-ink-400 mt-0.5">
          {loading ? '…' : `${totalCount.toLocaleString()} leads`}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[calc(100vh-300px)] p-2 space-y-2">
        {loading ? (
          <p className="font-mono text-2xs text-ink-400 p-2">Loading…</p>
        ) : organizations.length === 0 ? (
          <p className="text-xs text-ink-400 p-2">Drop cards here</p>
        ) : (
          organizations.map((org) => (
            <OutreachKanbanCard key={org.id} org={org} column={status} onUpdated={refresh} />
          ))
        )}
      </div>
      <Link
        to={`/organizations?status=listed&outreach=${status}`}
        className="border-t-2 border-ink-200 px-3 py-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-accent flex items-center gap-1"
      >
        View all <ArrowRight size={12} />
      </Link>
    </div>
  );
}

export default function OutreachBoard() {
  const { stats, loading, refetch } = useCrmDashboardStats();
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  return (
    <div className="max-w-[1500px] mx-auto">
      <SectionHeader>Outreach — leads</SectionHeader>
      <p className="font-mono text-2xs text-ink-500 uppercase tracking-wider -mt-4 mb-4">
        All registry NGOs are leads until they become customers. Drag between columns or use the move menu.
        After contact: follow-up, declined, or registered (moves to Inbound).
      </p>

      <div className="flex flex-wrap gap-3 mb-6">
        <Link to="/inbound" className="card-brutal-hover px-4 py-3 flex items-center gap-2 text-sm min-h-[44px]">
          <Inbox size={16} className="text-teal" />
          <span>
            <strong>Inbound queue</strong>
            <span className="block font-mono text-2xs text-ink-400">Registered — ready to become customers</span>
          </span>
        </Link>
        <Link to="/customers" className="card-brutal-hover px-4 py-3 flex items-center gap-2 text-sm min-h-[44px]">
          <Users size={16} className="text-accent" />
          <span>
            <strong>Customers</strong>
            <span className="block font-mono text-2xs text-ink-400">For verification, email, services</span>
          </span>
        </Link>
        <div className="card-brutal px-4 py-3 font-mono text-2xs text-ink-500 flex items-center">
          Leads not contacted: {loading ? '…' : stats.outreach_due.toLocaleString()}
        </div>
      </div>

      <div key={tick} className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory">
        {OUTREACH_KANBAN_STATUSES.map((status) => (
          <OutreachColumn key={status} status={status} onGlobalRefresh={() => { bump(); refetch(); }} />
        ))}
      </div>
    </div>
  );
}
