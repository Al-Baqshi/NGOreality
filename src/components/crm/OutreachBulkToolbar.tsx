import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  OUTREACH_KANBAN_STATUSES,
  OUTREACH_STATUS_LABELS,
  type OutreachStatus,
} from '../../types';
import { bulkSetOutreachStatus } from '../../lib/crmOutreach';
import {
  deleteOutreachBatch,
  listOutreachBatches,
  saveOutreachBatch,
  type OutreachBatch,
} from '../../lib/outreachBatches';
import { isMonitorApiConfigured } from '../../lib/monitorApi';

type Props = {
  selectedIds: Set<string>;
  onClear: () => void;
  onMoved: () => void;
  onLoadBatch: (ids: string[]) => void;
};

export default function OutreachBulkToolbar({ selectedIds, onClear, onMoved, onLoadBatch }: Props) {
  const [moveTo, setMoveTo] = useState<OutreachStatus>('contacted');
  const [batchName, setBatchName] = useState('');
  const [batches, setBatches] = useState<OutreachBatch[]>(() => listOutreachBatches());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (selectedIds.size === 0) return null;

  const refreshBatches = () => setBatches(listOutreachBatches());

  const handleMove = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await bulkSetOutreachStatus(selectedIds, moveTo);
      setMessage(`Moved ${selectedIds.size} to ${OUTREACH_STATUS_LABELS[moveTo]}`);
      onMoved();
      onClear();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Move failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveBatch = () => {
    saveOutreachBatch(batchName, selectedIds);
    setBatchName('');
    refreshBatches();
    setMessage(`Saved batch (${selectedIds.size} orgs)`);
  };

  return (
    <div
      className="sticky bottom-0 z-20 border-t-2 border-ink-950 bg-ink-50 dark:bg-ink-950 p-3 sm:p-4 shadow-[0_-4px_0_#0a0a0a]"
      role="region"
      aria-label="Bulk outreach actions"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <p className="font-mono text-xs uppercase tracking-wider font-semibold shrink-0">
          {selectedIds.size} selected
        </p>

        <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0">
          <label className="flex flex-col gap-0.5 min-w-[140px] flex-1 sm:flex-none">
            <span className="font-mono text-2xs text-ink-500 uppercase">Move to</span>
            <select
              className="input-brutal text-sm min-h-[44px]"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value as OutreachStatus)}
            >
              {OUTREACH_KANBAN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {OUTREACH_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={handleMove}
            className="btn-brutal-teal min-h-[44px] text-sm px-4"
          >
            Move all
          </button>
          <button type="button" onClick={onClear} className="btn-brutal-outline min-h-[44px] text-sm px-4">
            Clear
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-end w-full sm:w-auto">
          <label className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
            <span className="font-mono text-2xs text-ink-500 uppercase">Name batch</span>
            <input
              className="input-brutal text-sm min-h-[44px]"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. Auckland batch 1"
            />
          </label>
          <button type="button" onClick={handleSaveBatch} className="btn-brutal-outline min-h-[44px] text-sm px-3">
            Save
          </button>
        </div>

        {batches.length > 0 && (
          <label className="flex flex-col gap-0.5 w-full sm:w-auto sm:min-w-[180px]">
            <span className="font-mono text-2xs text-ink-500 uppercase">Load batch</span>
            <select
              className="input-brutal text-sm min-h-[44px]"
              defaultValue=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                const batch = batches.find((b) => b.id === id);
                if (batch) onLoadBatch(batch.organizationIds);
                e.target.value = '';
              }}
            >
              <option value="">Choose…</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.organizationIds.length})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {message && <p className="font-mono text-2xs text-teal mt-2">{message}</p>}
      <p className="font-mono text-2xs text-ink-400 mt-1">
        Drag moves cards only — does not send email. Select cards in an email column, edit the message, then Send.{' '}
        <Link to="/email-notifications" className="underline">
          Deliver queued mail
        </Link>
        {!isMonitorApiConfigured() && ' (set VITE_MONITOR_API_URL on the queue page to deliver from CRM API).'}
      </p>
    </div>
  );
}

export function OutreachBatchManager() {
  const [batches, setBatches] = useState<OutreachBatch[]>(() => listOutreachBatches());
  if (!batches.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {batches.map((b) => (
        <span key={b.id} className="inline-flex items-center gap-1 border border-ink-200 px-2 py-1 font-mono text-2xs">
          {b.name} ({b.organizationIds.length})
          <button
            type="button"
            className="text-ink-400 hover:text-accent min-w-[28px] min-h-[28px]"
            aria-label={`Delete batch ${b.name}`}
            onClick={() => {
              deleteOutreachBatch(b.id);
              setBatches(listOutreachBatches());
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
