import { useState, useCallback, useMemo, useEffect } from 'react';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  OUTREACH_KANBAN_STATUSES,
  OUTREACH_STATUS_LABELS,
  OUTREACH_EMAIL_BY_COLUMN,
  type Organization,
  type OutreachStatus,
} from '../../types';
import { useCrmDashboardStats } from '../../hooks/useCrm';
import OutreachHeader from '../../components/crm/OutreachHeader';
import OutreachToolbar from '../../components/crm/OutreachToolbar';
import OutreachBatchCommand from '../../components/crm/OutreachBatchCommand';
import KanbanColumn from '../../components/crm/KanbanColumn';
import SendEmailModal from '../../components/crm/SendEmailModal';
import NewLeadDialog from '../../components/crm/NewLeadDialog';
import { OutreachBatchManager } from '../../components/crm/OutreachBulkToolbar';
import RegistryInsights from '../../components/crm/RegistryInsights';
import { bulkSetOutreachStatus } from '../../lib/crmOutreach';

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

export default function OutreachBoard() {
  const { stats } = useCrmDashboardStats();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const [sendEmailOrganizations, setSendEmailOrganizations] = useState<{ id: string; name: string; email: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [globalRefreshTick, setGlobalRefreshTick] = useState(0);

  const bump = useCallback(() => {
    setGlobalRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchValue.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchValue]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectMany = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleSendEmail = async () => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      const { data } = await supabase
        .from('organizations')
        .select('id, name, email')
        .in('id', Array.from(selectedIds));
      if (data) {
        setSendEmailOrganizations(data as { id: string; name: string; email: string }[]);
        setSendEmailOpen(true);
      }
    } catch (err) {
      console.error('Failed to fetch organizations:', err);
    } finally {
      setBusy(false);
    }
  };

  const handleBulkMove = async (status: OutreachStatus) => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      await bulkSetOutreachStatus(Array.from(selectedIds), status);
      bump();
      clearSelection();
    } catch (err) {
      console.error('Failed to move organizations:', err);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleSendEmailComplete = useCallback(() => {
    bump();
    clearSelection();
  }, [bump, clearSelection]);

  const totalLeads = useMemo(
    () => stats?.outreach_due ?? 0,
    [stats?.outreach_due]
  );

  const emailTemplate = statusFilter
    ? OUTREACH_EMAIL_BY_COLUMN[statusFilter as OutreachStatus]
    : 'outreach_cold_invite';

  const visibleStatuses = statusFilter
    ? OUTREACH_KANBAN_STATUSES.filter((s) => s === statusFilter)
    : OUTREACH_KANBAN_STATUSES;

  return (
    <div className="page-shell w-full min-w-0 max-w-none">
      <div className="flex flex-col gap-5">
        <OutreachHeader
          onNewLead={() => setNewLeadOpen(true)}
          onNavigateWorklist={() => window.location.href = '/outreach'}
        />

        <OutreachToolbar
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          onSearchSubmit={(value) => setDebouncedSearch(value.trim())}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          locationFilter={locationFilter}
          onLocationFilterChange={setLocationFilter}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          totalCount={totalLeads}
        />
      </div>

      {busy && selectedIds.size === 0 && (
        <Loader2 size={15} className="animate-spin text-ink-500 mb-4" aria-label="Processing…" />
      )}

      <OutreachBatchManager />

      <CollapsibleSection
        title="Registry insights"
        summary="NZ registry stats — collapse for more kanban space"
        open={insightsOpen}
        onToggle={() => setInsightsOpen((v) => !v)}
      >
        <RegistryInsights country="NZ" />
      </CollapsibleSection>

      <OutreachBatchCommand
        selectedCount={selectedIds.size}
        onClear={clearSelection}
        onMove={handleBulkMove}
        onSendEmail={() => void handleSendEmail()}
        busy={busy}
      />

      <div className="kanban-shell" key={globalRefreshTick}>
        <div className="kanban-board kanban-board-tall">
          {visibleStatuses.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              onGlobalRefresh={bump}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onClearSelection={clearSelection}
              onSelectMany={selectMany}
              search={debouncedSearch}
              country={locationFilter}
              category={categoryFilter}
              sortBy={sortBy}
            />
          ))}
        </div>
      </div>

      {sendEmailOpen && (
        <SendEmailModal
          open={sendEmailOpen}
          onClose={() => { setSendEmailOpen(false); setSendEmailOrganizations([]); }}
          organizations={sendEmailOrganizations as Organization[]}
          column={statusFilter || 'cold_email'}
          columnLabel={statusFilter ? OUTREACH_STATUS_LABELS[statusFilter as OutreachStatus] : 'Selected'}
          template={emailTemplate ?? 'outreach_cold_invite'}
          onSent={handleSendEmailComplete}
        />
      )}

      <NewLeadDialog
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        onCreated={bump}
      />
    </div>
  );
}
