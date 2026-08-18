import { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useOrganizationsPage } from '../../hooks/useCrm';
import { useOutreachEmailStatus } from '../../hooks/useOutreachEmail';
import { OUTREACH_STATUS_LABELS, type OutreachStatus, type Organization } from '../../types';
import { bulkSetOutreachStatus } from '../../lib/crmOutreach';
import OutreachKanbanCard from './OutreachKanbanCard';

interface Props {
  status: OutreachStatus;
  onGlobalRefresh: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onClearSelection: () => void;
}

const KANBAN_PAGE_SIZE = 30;
const KANBAN_LOAD_STEP = 50;
const KANBAN_MAX_VISIBLE = 500;

export async function fetchColumnLeadIds(status: OutreachStatus, limit: number): Promise<string[]> {
  const { supabase } = await import('../../lib/supabase');
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('status', 'listed')
    .eq('is_customer', false)
    .eq('outreach_status', status)
    .order('name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

export default function KanbanColumn({
  status,
  onGlobalRefresh,
  selectedIds,
  onToggleSelect,
  onClearSelection,
}: Props) {
  const [limit, setLimit] = useState(KANBAN_PAGE_SIZE);
  const [dragOver, setDragOver] = useState(false);

  const { organizations, totalCount, loading, refetch } = useOrganizationsPage(
    { leadsOnly: true, outreach: status },
    1,
    limit,
  );

  const orgIds = useMemo(() => organizations.map((o) => o.id), [organizations]);
  const { byOrgId, refetch: refetchEmail } = useOutreachEmailStatus(orgIds);

  const refresh = useCallback(() => {
    refetch();
    refetchEmail();
    onGlobalRefresh();
  }, [refetch, refetchEmail, onGlobalRefresh]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const idsRaw = e.dataTransfer.getData('application/org-ids');
    const single = e.dataTransfer.getData('application/org-id');
    const ids = idsRaw
      ? idsRaw.split(',').filter(Boolean)
      : single
        ? [single]
        : [];
    if (!ids.length) return;
    await bulkSetOutreachStatus(ids, status);
    onClearSelection();
    refresh();
  };

  const dragPayloadFor = (org: Organization) => {
    if (selectedIds.has(org.id) && selectedIds.size > 1) {
      return [...selectedIds];
    }
    return [org.id];
  };

  const label = OUTREACH_STATUS_LABELS[status];

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={handleDrop}
      className={`kanban-column flex flex-col h-full min-h-0 transition-colors ${dragOver ? 'bg-teal/5' : ''}`}
    >
      <div className={`kanban-column-header shrink-0 flex items-center justify-between gap-2 px-2 py-2 ${dragOver ? 'bg-teal/5' : ''}`}>
        <h3 className="min-w-0 truncate font-mono text-2xs uppercase tracking-wider font-semibold">
          {label}
        </h3>
        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-mono text-2xs tabular-nums">
          {loading ? '…' : totalCount.toLocaleString()}
        </span>
        <div className="relative">
          <button
            type="button"
            className="p-1 text-ink-400 hover:text-ink-900 dark:hover:text-white rounded transition-colors"
            aria-label="Column options"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      <div className="kanban-column-body flex-1 min-h-0 overflow-y-auto space-y-2 p-2">
        {loading ? (
          <div className="p-4 text-center">
            <Loader2 className="animate-spin inline mx-auto" size={20} />
            <p className="font-mono text-2xs text-ink-400 mt-2">Loading…</p>
          </div>
        ) : (organizations ?? []).length === 0 ? (
          <div className="p-4 text-center text-xs text-ink-400">
            <p>No organizations in this stage</p>
            <p className="mt-1">Drag cards here or use "Select first…"</p>
          </div>
        ) : (
          <>
            {(organizations ?? []).map((org) => (
              <OutreachKanbanCard
                key={org.id}
                org={org}
                column={status}
                onUpdated={refresh}
                selected={selectedIds.has(org.id)}
                onToggleSelect={onToggleSelect}
                emailStatus={byOrgId[org.id]}
                dragPayloadIds={dragPayloadFor(org)}
              />
            ))}
            {(organizations ?? []).length < totalCount && (
              (organizations ?? []).length < KANBAN_MAX_VISIBLE ? (
                <button
                  type="button"
                  onClick={() => setLimit((l) => Math.min(l + KANBAN_LOAD_STEP, KANBAN_MAX_VISIBLE))}
                  className="w-full border-2 border-dashed border-ink-300 py-2 font-mono text-2xs uppercase tracking-wider text-ink-500 transition-colors hover:border-ink-950 hover:text-ink-950 dark:border-ink-700 dark:hover:border-ink-300 dark:hover:text-white"
                >
                  Load {KANBAN_LOAD_STEP} more · {(organizations ?? []).length} of {totalCount.toLocaleString()}
                </button>
              ) : (
                <p className="p-2 text-center font-mono text-2xs text-ink-400">
                  Showing the first {KANBAN_MAX_VISIBLE} — use View all or the worklist for the rest.
                </p>
              )
            )}
          </>
        )}
      </div>

      <Link
        to={`/organizations?status=listed&outreach=${status}`}
        className="kanban-column-footer flex items-center gap-1 shrink-0"
      >
        View all <ChevronRight size={12} />
      </Link>
    </div>
  );
}