import { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ChevronRight } from 'lucide-react';
import { useOrganizationsPage } from '../../hooks/useCrm';
import { useOutreachEmailStatus } from '../../hooks/useOutreachEmail';
import { OUTREACH_STATUS_LABELS, OUTREACH_COLUMN_HINTS, type OutreachStatus, type Organization } from '../../types';
import { bulkSetOutreachStatus } from '../../lib/crmOutreach';
import OutreachKanbanCard from './OutreachKanbanCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  status: OutreachStatus;
  onGlobalRefresh: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectMany: (ids: string[]) => void;
  onClearSelection: () => void;
}

const KANBAN_PAGE_SIZE = 30;
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

export default function KanbanColumn({
  status,
  onGlobalRefresh,
  selectedIds,
  onToggleSelect,
  onSelectMany,
  onClearSelection,
}: Props) {
  const [limit, setLimit] = useState(KANBAN_PAGE_SIZE);
  const [dragOver, setDragOver] = useState(false);
  const [columnMsg, setColumnMsg] = useState<string | null>(null);

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

  const selectAllVisible = () => onSelectMany(organizations.map((o) => o.id));

  const selectFirstN = async (n: number) => {
    setColumnMsg(null);
    try {
      const ids = await fetchColumnLeadIds(status, n);
      onSelectMany(ids);
      setColumnMsg(`Selected first ${ids.length.toLocaleString()}`);
    } catch (err) {
      setColumnMsg(err instanceof Error ? err.message : 'Selection failed');
    }
  };

  const dragPayloadFor = (org: Organization) => {
    if (selectedIds.has(org.id) && selectedIds.size > 1) {
      return [...selectedIds];
    }
    return [org.id];
  };

  const label = OUTREACH_STATUS_LABELS[status];
  const hint = OUTREACH_COLUMN_HINTS[status];

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
      <div className={`kanban-column-header space-y-2 shrink-0 ${dragOver ? '!bg-teal/10' : ''}`}>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3
              className="min-w-0 truncate font-mono text-2xs uppercase tracking-wider font-semibold"
              title={hint || label}
            >
              {label}
            </h3>
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-mono text-2xs tabular-nums">
              {loading ? '…' : totalCount.toLocaleString()}
            </span>
          </div>
          {hint && (
            <p className="text-2xs text-ink-400 mt-0.5 leading-snug line-clamp-2">
              {hint}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={selectAllVisible}
            className="btn-brutal-outline text-2xs py-1 px-2 min-h-[32px] hidden sm:inline-flex"
          >
            All visible
          </button>
          <Select value="" onValueChange={(value: string) => { const n = Number(value); if (n) void selectFirstN(n); }}>
            <SelectTrigger className="w-[140px] min-h-[32px]">
              <SelectValue placeholder="Select first…" />
            </SelectTrigger>
            <SelectContent>
              {SELECT_SIZES.map((n) => (
                <SelectItem key={n} value={n}>
                  First {n.toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {columnMsg && <p className="font-mono text-2xs text-teal">{columnMsg}</p>}
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