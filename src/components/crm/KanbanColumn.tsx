import { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ChevronRight } from 'lucide-react';
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
  onSelectMany: (ids: string[]) => void;
}

const KANBAN_PAGE_SIZE = 50;
const KANBAN_LOAD_STEP = 50;
const KANBAN_MAX_VISIBLE = 500;
const SELECT_SIZES = [50, 100, 1000] as const;

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

function formatSelectSize(n: number): string {
  return n >= 1000 ? '1k' : String(n);
}

export default function KanbanColumn({
  status,
  onGlobalRefresh,
  selectedIds,
  onToggleSelect,
  onClearSelection,
  onSelectMany,
}: Props) {
  const [limit, setLimit] = useState(KANBAN_PAGE_SIZE);
  const [dragOver, setDragOver] = useState(false);
  const [selectBusy, setSelectBusy] = useState(false);

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

  const handleSelectFirstN = useCallback(async (n: number) => {
    setSelectBusy(true);
    try {
      const ids = await fetchColumnLeadIds(status, n);
      onSelectMany(ids);
    } finally {
      setSelectBusy(false);
    }
  }, [status, onSelectMany]);

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
  const columnSelectedCount = organizations?.filter((o) => selectedIds.has(o.id)).length ?? 0;

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
      <div className={`kanban-column-header shrink-0 space-y-2.5 px-3 py-3 ${dragOver ? '!bg-teal/90' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-mono text-2xs uppercase tracking-wider font-semibold leading-snug">
              {label}
            </h3>
            <p className="mt-0.5 font-mono text-2xs text-ink-400 tabular-nums">
              {loading ? 'Loading…' : `${totalCount.toLocaleString()} in stage`}
            </p>
          </div>
          {columnSelectedCount > 0 && (
            <span className="shrink-0 rounded-full bg-teal/20 px-2 py-0.5 font-mono text-2xs text-teal whitespace-nowrap">
              {columnSelectedCount} here
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-2xs uppercase tracking-wider text-ink-400">Select</span>
          <div className="flex flex-1 items-center gap-1">
            {SELECT_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                disabled={selectBusy || totalCount === 0}
                onClick={() => void handleSelectFirstN(n)}
                className="kanban-select-chip flex-1"
                title={`Add first ${n.toLocaleString()} in this column to selection`}
              >
                {formatSelectSize(n)}
              </button>
            ))}
          </div>
          {selectBusy && (
            <Loader2 size={14} className="shrink-0 animate-spin text-teal" aria-label="Selecting…" />
          )}
        </div>
      </div>

      <div className="kanban-column-body flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-ink-400">
            <Loader2 className="animate-spin" size={20} />
            <p className="font-mono text-2xs">Loading cards…</p>
          </div>
        ) : (organizations ?? []).length === 0 ? (
          <div className="kanban-column-empty">
            <p className="font-medium text-ink-600 dark:text-foreground">Empty stage</p>
            <p className="mt-1">Drop cards here or use Select above</p>
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
                  className="mx-1 mb-1 w-[calc(100%-0.5rem)] rounded-lg border border-dashed border-ink-300 py-2 font-mono text-2xs uppercase tracking-wider text-ink-500 transition-colors hover:border-teal hover:bg-teal/5 hover:text-teal dark:border-border"
                >
                  Load {KANBAN_LOAD_STEP} more · {(organizations ?? []).length} of {totalCount.toLocaleString()}
                </button>
              ) : (
                <p className="px-2 py-2 text-center font-mono text-2xs text-ink-400">
                  Showing first {KANBAN_MAX_VISIBLE} — use View all or the worklist for the rest.
                </p>
              )
            )}
          </>
        )}
      </div>

      <Link
        to={`/organizations?status=listed&outreach=${status}`}
        className="kanban-column-footer flex items-center gap-1 shrink-0 px-3 py-2.5 transition-colors hover:bg-ink-50 dark:hover:bg-muted/30"
      >
        View all <ChevronRight size={12} />
      </Link>
    </div>
  );
}
