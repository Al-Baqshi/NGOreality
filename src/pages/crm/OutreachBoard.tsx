import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, ChevronDown, ChevronRight, Inbox, List, Loader2, Mail, Plus, Users,
} from 'lucide-react';
import { useCrmDashboardStats, useOrganizationsPage } from '../../hooks/useCrm';
import { useOutreachEmailStatus, useOutreachFailedCount } from '../../hooks/useOutreachEmail';
import OutreachKanbanCard from '../../components/crm/OutreachKanbanCard';
import NewLeadDialog from '../../components/crm/NewLeadDialog';
import OutreachBulkToolbar, { OutreachBatchManager } from '../../components/crm/OutreachBulkToolbar';
import {
  OUTREACH_COLUMN_HINTS,
  OUTREACH_EMAIL_BY_COLUMN,
  OUTREACH_KANBAN_STATUSES,
  OUTREACH_STATUS_LABELS,
  type Organization,
  type OutreachStatus,
} from '../../types';
import {
  bulkSetOutreachStatus,
  syncNoWebsiteLeads,
  syncWebsiteIssueLeads,
} from '../../lib/crmOutreach';
import OutreachSendPanel from '../../components/crm/OutreachSendPanel';
import RegistryInsights from '../../components/crm/RegistryInsights';
import { supabase } from '../../lib/supabase';

const KANBAN_PAGE_SIZE = 30;
/** How much a column grows per "Load more"; the ceiling keeps the DOM sane. */
const KANBAN_LOAD_STEP = 50;
const KANBAN_MAX_VISIBLE = 500;
const SELECT_SIZES = [50, 100, 1000] as const;

/**
 * First-N selection asks the SERVER for the column's leading ids instead of
 * slicing whatever happens to be rendered — "First 50" on a column showing 30
 * cards used to select 30 and say nothing.
 */
async function fetchColumnLeadIds(status: OutreachStatus, limit: number): Promise<string[]> {
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

function CollapsibleSection({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card-brutal mb-4 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 text-left min-h-[44px] hover:bg-ink-50 dark:hover:bg-ink-900"
      >
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <span className="font-mono text-xs uppercase tracking-wider font-semibold">{title}</span>
        {!open && <span className="font-mono text-2xs text-ink-400 truncate ml-1">{summary}</span>}
      </button>
      {open && <div className="px-4 pb-4 pt-0 border-t border-ink-100 dark:border-ink-800">{children}</div>}
    </div>
  );
}

function OutreachColumn({
  status,
  onGlobalRefresh,
  selectedIds,
  onToggleSelect,
  onSelectMany,
  onClearSelection,
}: {
  status: OutreachStatus;
  onGlobalRefresh: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectMany: (ids: string[]) => void;
  onClearSelection: () => void;
}) {
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

  const [emailBusy, setEmailBusy] = useState(false);
  const [columnMsg, setColumnMsg] = useState<string | null>(null);

  const emailTemplate = OUTREACH_EMAIL_BY_COLUMN[status];

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

  const selectedInColumn = organizations.filter((o) => selectedIds.has(o.id));

  const handleSync = async () => {
    setEmailBusy(true);
    setColumnMsg(null);
    try {
      const n =
        status === 'no_website'
          ? await syncNoWebsiteLeads(100)
          : status === 'website_issues'
            ? await syncWebsiteIssueLeads(100)
            : 0;
      setColumnMsg(n ? `Moved ${n} organisations into this column` : 'Nothing to sync');
      refresh();
    } catch (err) {
      setColumnMsg(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setEmailBusy(false);
    }
  };

  const dragPayloadFor = (org: Organization) => {
    if (selectedIds.has(org.id) && selectedIds.size > 1) {
      return [...selectedIds];
    }
    return [org.id];
  };

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
      className={`kanban-column transition-colors ${dragOver ? 'bg-gold/10' : ''}`}
    >
      <div className={`kanban-column-header space-y-2 ${dragOver ? '!bg-ink-800' : ''}`}>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3
              className="min-w-0 truncate font-mono text-2xs uppercase tracking-wider font-semibold"
              title={OUTREACH_COLUMN_HINTS[status] || OUTREACH_STATUS_LABELS[status]}
            >
              {OUTREACH_STATUS_LABELS[status]}
            </h3>
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-mono text-2xs tabular-nums">
              {loading ? '…' : totalCount.toLocaleString()}
            </span>
          </div>
          {OUTREACH_COLUMN_HINTS[status] && (
            <p className="text-2xs text-ink-400 mt-0.5 leading-snug line-clamp-2">
              {OUTREACH_COLUMN_HINTS[status]}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={selectAllVisible} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[32px]">
            All visible
          </button>
          <select
            aria-label={`Select the first N leads in ${OUTREACH_STATUS_LABELS[status]}`}
            className="input-brutal text-2xs py-1 min-h-[32px] bg-white text-ink-950"
            value=""
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n) void selectFirstN(n);
            }}
          >
            <option value="" disabled>
              Select first…
            </option>
            {SELECT_SIZES.map((n) => (
              <option key={n} value={n}>
                First {n.toLocaleString()}
              </option>
            ))}
          </select>
        </div>
        {emailTemplate && (
          <OutreachSendPanel
            column={status}
            columnLabel={OUTREACH_STATUS_LABELS[status]}
            template={emailTemplate}
            selectedOrgs={selectedInColumn}
            busy={emailBusy}
            setBusy={setEmailBusy}
            onSent={refresh}
            onMessage={setColumnMsg}
          />
        )}
        {(status === 'no_website' || status === 'website_issues') && (
          <button
            type="button"
            disabled={emailBusy}
            onClick={handleSync}
            className="btn-brutal-outline w-full text-2xs py-1.5 min-h-[36px]"
          >
            Auto-fill column (up to 100)
          </button>
        )}
        {columnMsg && <p className="font-mono text-2xs text-teal">{columnMsg}</p>}
      </div>
      <div className="kanban-column-body">
        {loading ? (
          <p className="font-mono text-2xs text-ink-400 p-2">Loading…</p>
        ) : organizations.length === 0 ? (
          <p className="text-xs text-ink-400 p-2">Drop cards here or use auto-fill</p>
        ) : (
          <>
            {organizations.map((org) => (
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
            {organizations.length < totalCount && (
              organizations.length < KANBAN_MAX_VISIBLE ? (
                <button
                  type="button"
                  onClick={() => setLimit((l) => Math.min(l + KANBAN_LOAD_STEP, KANBAN_MAX_VISIBLE))}
                  className="w-full border-2 border-dashed border-ink-300 py-2 font-mono text-2xs uppercase tracking-wider text-ink-500 transition-colors hover:border-ink-950 hover:text-ink-950 dark:border-ink-700 dark:hover:border-ink-300 dark:hover:text-white"
                >
                  Load {KANBAN_LOAD_STEP} more · {organizations.length} of {totalCount.toLocaleString()}
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
        className="kanban-column-footer flex items-center gap-1"
      >
        View all <ArrowRight size={12} />
      </Link>
    </div>
  );
}

export default function OutreachBoard() {
  const { stats, loading, refetch } = useCrmDashboardStats();
  const { count: outreachFailedCount, refetch: refetchFailedCount } = useOutreachFailedCount();
  const [tick, setTick] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [selectBusy, setSelectBusy] = useState(false);

  const bump = () => {
    setTick((t) => t + 1);
    void refetchFailedCount();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectMany = (ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectFirstNPerColumn = async (n: number) => {
    setSelectBusy(true);
    try {
      const ids: string[] = [];
      for (const status of OUTREACH_KANBAN_STATUSES) {
        ids.push(...(await fetchColumnLeadIds(status, n)));
      }
      selectMany(ids);
    } finally {
      setSelectBusy(false);
    }
  };

  return (
    <div className="page-shell w-full min-w-0 max-w-none pb-24">
      <div className="page-header">
        <div>
          <h1 className="page-title">Outreach board</h1>
          <p className="mt-1 text-sm text-ink-600 dark:text-muted-foreground">
            Drag to organise — <strong>nothing is emailed on drop</strong>. Select cards, then press Send in a column.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setNewLeadOpen(true)}
            className="btn-brutal-teal inline-flex min-h-[44px] items-center gap-2 text-sm"
          >
            <Plus size={16} /> New lead
          </button>
          <Link to="/outreach" className="btn-brutal-outline inline-flex min-h-[44px] items-center gap-2 text-sm">
            <List size={16} /> Worklist view
          </Link>
        </div>
      </div>

      <CollapsibleSection
        title="Inbound & customers"
        summary="Quick links — expand to open queues"
        open={shortcutsOpen}
        onToggle={() => setShortcutsOpen((v) => !v)}
      >
        <div className="flex flex-wrap gap-3 pt-2">
          <Link to="/inbound" className="card-brutal-hover px-4 py-3 flex items-center gap-2 text-sm min-h-[44px]">
            <Inbox size={16} className="text-teal" />
            <span>
              <strong>Inbound queue</strong>
              <span className="block font-mono text-2xs text-ink-400">
                Said yes / engaging — register as customer when ready
              </span>
            </span>
          </Link>
          <Link to="/customers" className="card-brutal-hover px-4 py-3 flex items-center gap-2 text-sm min-h-[44px]">
            <Users size={16} className="text-accent" />
            <span>
              <strong>Customers</strong>
              <span className="block font-mono text-2xs text-ink-400">Onboarding, verification, monitoring</span>
            </span>
          </Link>
          <Link
            to="/email-notifications"
            className="card-brutal-hover px-4 py-3 flex items-center gap-2 text-sm min-h-[44px]"
          >
            <Mail size={16} />
            <span>
              <strong>Email notifications</strong>
              <span className="block font-mono text-2xs text-ink-400">Outreach + system email queue</span>
            </span>
          </Link>
          {outreachFailedCount > 0 && (
            <Link
              to="/email-notifications?status=failed"
              className="card-brutal-hover px-4 py-3 flex items-center gap-2 text-sm min-h-[44px] border-2 border-accent"
            >
              <AlertTriangle size={16} className="text-accent shrink-0" aria-hidden />
              <span>
                <strong className="text-accent">
                  {outreachFailedCount} outreach send{outreachFailedCount === 1 ? '' : 's'} failed
                </strong>
                <span className="block font-mono text-2xs text-ink-400">View errors and requeue</span>
              </span>
            </Link>
          )}
          <div className="card-brutal px-4 py-3 font-mono text-2xs text-ink-500 flex items-center">
            Leads not contacted: {loading ? '…' : stats.outreach_due.toLocaleString()}
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Registry insights"
        summary="NZ registry stats — collapse for more kanban space"
        open={insightsOpen}
        onToggle={() => setInsightsOpen((v) => !v)}
      >
        <RegistryInsights country="NZ" />
      </CollapsibleSection>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="label-brutal">Select per column</span>
        {SELECT_SIZES.map((n) => (
          <button
            key={n}
            type="button"
            disabled={selectBusy}
            onClick={() => void selectFirstNPerColumn(n)}
            className="btn-brutal-outline text-xs min-h-[44px] px-3 disabled:opacity-50"
          >
            First {n.toLocaleString()}
          </button>
        ))}
        <button type="button" onClick={clearSelection} className="btn-brutal-outline text-xs min-h-[44px] px-3">
          Clear selection
        </button>
        {selectBusy && <Loader2 size={15} className="animate-spin text-ink-500" aria-label="Selecting…" />}
        {selectedIds.size > 0 && (
          <span className="font-mono text-2xs text-ink-500">{selectedIds.size.toLocaleString()} selected globally</span>
        )}
      </div>
      <OutreachBatchManager />

      <div key={tick} className="kanban-shell">
        <div className="kanban-board kanban-board-tall">
          {OUTREACH_KANBAN_STATUSES.map((status) => (
            <OutreachColumn
              key={status}
              status={status}
              onGlobalRefresh={() => {
                bump();
                refetch();
              }}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onSelectMany={selectMany}
              onClearSelection={clearSelection}
            />
          ))}
        </div>
      </div>

      <OutreachBulkToolbar
        selectedIds={[...selectedIds]}
        onClear={clearSelection}
        onMoved={() => {
          bump();
          refetch();
        }}
        onLoadBatch={selectMany}
      />

      <NewLeadDialog
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        onCreated={() => {
          bump();
          refetch();
        }}
      />
    </div>
  );
}
