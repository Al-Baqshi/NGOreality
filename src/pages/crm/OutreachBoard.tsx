import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCrmDashboardStats, useOrganizationsPage } from '../../hooks/useCrm';
import { SectionHeader } from '../../components/ui';
import OutreachKanbanCard from '../../components/crm/OutreachKanbanCard';
import { OUTREACH_KANBAN_STATUSES, OUTREACH_STATUS_LABELS, type OutreachStatus } from '../../types';
import { setOutreachStatus } from '../../lib/crmOutreach';
import { ArrowRight, Inbox, Users } from 'lucide-react';
import RegistryInsights from '../../components/crm/RegistryInsights';

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
      className="kanban-column"
    >
      <div className="kanban-column-header">
        <h3 className="font-mono text-2xs uppercase tracking-wider font-semibold">
          {OUTREACH_STATUS_LABELS[status]}
        </h3>
        <p className="font-mono text-2xs text-ink-400 mt-0.5">
          {loading ? '…' : `${totalCount.toLocaleString()} leads`}
        </p>
      </div>
      <div className="kanban-column-body">
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
        className="kanban-column-footer flex items-center gap-1"
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
    <div className="page-shell w-full min-w-0 max-w-none">
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

      <div className="card-brutal mb-6 p-4 sm:p-6">
        <RegistryInsights country="NZ" />
      </div>

      <div key={tick} className="kanban-shell">
        <div className="kanban-board kanban-board-tall">
          {OUTREACH_KANBAN_STATUSES.map((status) => (
            <OutreachColumn key={status} status={status} onGlobalRefresh={() => { bump(); refetch(); }} />
          ))}
        </div>
      </div>
    </div>
  );
}
