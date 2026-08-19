import { useState, useCallback, useMemo } from 'react';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  OUTREACH_KANBAN_STATUSES,
  OUTREACH_STATUS_LABELS,
  OUTREACH_EMAIL_BY_COLUMN,
} from '../../types';
import { useCrmDashboardStats } from '../../hooks/useCrm';
import { fetchColumnLeadIds } from '../../components/crm/KanbanColumn';
import OutreachHeader from '../../components/crm/OutreachHeader';
import OutreachToolbar from '../../components/crm/OutreachToolbar';
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
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const [sendEmailOrganizations, setSendEmailOrganizations] = useState<{ id: string; name: string; email: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [globalRefreshTick, setGlobalRefreshTick] = useState(0);
  const [moveTo, setMoveTo] = useState<OutreachStatus>('contacted');

  const bump = useCallback(() => {
    setGlobalRefreshTick((t) => t + 1);
  }, []);

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

  const handleApplyBulk = async () => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      await bulkSetOutreachStatus(Array.from(selectedIds), moveTo);
      clearSelection();
      bump();
    } catch (err) {
      console.error('Failed to change status:', err);
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

  return (
    <div className="page-shell w-full min-w-0 max-w-none pb-16">
      <OutreachHeader
        onNewLead={() => setNewLeadOpen(true)}
        onNavigateWorklist={() => window.location.href = '/outreach'}
      />

      <OutreachToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={() => {}}
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

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <button type="button" onClick={clearSelection} className="btn-brutal-outline text-xs min-h-[44px] px-3">
          Clear selection
        </button>
        {busy && <Loader2 size={15} className="animate-spin text-ink-500" aria-label="Selecting…" />}
        {selectedIds.size > 0 && (
          <span className="font-mono text-2xs text-ink-500">{selectedIds.size.toLocaleString()} selected globally</span>
        )}
      </div>
      <OutreachBatchManager />

      <CollapsibleSection
        title="Registry insights"
        summary="NZ registry stats — collapse for more kanban space"
        open={insightsOpen}
        onToggle={() => setInsightsOpen((v) => !v)}
      >
        <RegistryInsights country="NZ" />
      </CollapsibleSection>

      <div className="kanban-shell" key={globalRefreshTick}>
        <div className="kanban-board kanban-board-tall">
          {OUTREACH_KANBAN_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              onGlobalRefresh={bump}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onClearSelection={clearSelection}
              onSelectMany={selectMany}
            />
          ))}
        </div>
      </div>

      {/* Bulk toolbar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-0 z-40 bg-white/98 dark:bg-ink-950/98 backdrop-blur-md border-t border-ink-200 dark:border-ink-800 shadow-xl">
          <div className="page-shell flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono text-xs text-ink-500 dark:text-ink-400">
                {selectedIds.size.toLocaleString()} selected
              </span>
              <span className="w-px h-6 bg-ink-200 dark:bg-ink-700" aria-hidden="true" />
              <label className="flex items-center gap-2">
                <select className="input-brutal min-h-[38px] text-sm w-auto min-w-[150px]" value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value as OutreachStatus)}>
                  {OUTREACH_KANBAN_STATUSES.map((s) => (
                    <option key={s} value={s}>{OUTREACH_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={handleApplyBulk} disabled={busy}
                className="btn-brutal-gold text-sm min-h-[38px] px-4 inline-flex items-center gap-2 shrink-0 disabled:opacity-50">
                {busy && <Loader2 size={13} className="animate-spin" />}
                Apply
              </button>
              <button type="button" onClick={clearSelection} className="btn-brutal-ghost text-sm min-h-[38px] px-4 shrink-0">
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {sendEmailOpen && (
      <SendEmailModal
        open={sendEmailOpen}
        onClose={() => { setSendEmailOpen(false); setSendEmailOrganizations([]); }}
        organizations={sendEmailOrganizations}
        column={statusFilter || 'cold_email'}
        columnLabel={statusFilter ? OUTREACH_STATUS_LABELS[statusFilter as 'cold_email' | 'no_website' | 'website_issues'] : 'Selected'}
        template={statusFilter ? OUTREACH_EMAIL_BY_COLUMN[statusFilter as 'cold_email' | 'no_website' | 'website_issues'] : 'outreach_cold_invite'}
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