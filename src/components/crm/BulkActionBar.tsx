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
      className={`fixed bottom-0 left-0 right-0 z-40 border-t-3 border-ink-950 bg-white dark:bg-card dark:border-border shadow-brutal-lg ${className}`}
      role="region"
      aria-label="Bulk actions"
    >
      <div className="page-shell !py-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">
          {selectedCount.toLocaleString()} selected
        </span>

        <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0">
          <Select value="" onValueChange={onChangeStatus}>
            <SelectTrigger className="w-[160px] min-h-[44px]">
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
            className="btn-brutal-teal min-h-[44px] text-sm px-4 flex items-center gap-2"
            disabled={busy}
          >
            <Send size={16} /> Send email
          </button>

          <button type="button" onClick={onClear} className="btn-brutal-outline min-h-[44px] text-sm px-4">
            Clear
          </button>
        </div>

        {busy && <Loader2 size={15} className="animate-spin text-ink-500" aria-label="Processing…" />}
      </div>
    </div>
  );
}