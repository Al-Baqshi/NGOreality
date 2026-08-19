import { Send, Loader2 } from 'lucide-react';
import { OUTREACH_KANBAN_STATUSES, OUTREACH_STATUS_LABELS } from '../../types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  selectedCount: number;
  onClear: () => void;
  onSendEmail: () => void;
  onChangeStatus: (status: string) => void;
  busy: boolean;
  className?: string;
}

export default function BulkActionBar({
  selectedCount,
  onClear,
  onSendEmail,
  onChangeStatus,
  busy,
  className = '',
}: Props) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={`sticky bottom-0 z-40 border-t-2 border-ink-950 bg-white/95 dark:bg-ink-950/95 backdrop-blur-sm shadow-[0_-4px_12px_rgba(0,0,0,0.15)] ${className}`}
      role="region"
      aria-label="Bulk actions"
    >
      <div className="page-shell flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <span className="font-mono text-xs text-ink-500 dark:text-ink-400 shrink-0">
          {selectedCount.toLocaleString()} selected
        </span>
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0 justify-end">
          <Select value="" onValueChange={onChangeStatus}>
            <SelectTrigger className="w-[160px] min-h-[40px] text-sm">
              <SelectValue placeholder="Move to stage" />
            </SelectTrigger>
            <SelectContent>
              {OUTREACH_KANBAN_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {OUTREACH_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={onSendEmail}
            className="btn-brutal-teal text-sm min-h-[40px] px-4 inline-flex items-center gap-2 shrink-0 disabled:opacity-50"
            disabled={busy}
          >
            <Send size={14} /> Send email
          </button>

          <button type="button" onClick={onClear} className="btn-brutal-outline text-sm min-h-[40px] px-4 shrink-0">
            Clear
          </button>

          {busy && <Loader2 size={14} className="animate-spin text-ink-500" aria-label="Processing…" />}
        </div>
      </div>
    </div>
  );
}