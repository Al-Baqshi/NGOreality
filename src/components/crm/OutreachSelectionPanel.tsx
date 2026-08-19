import { Loader2, Send, X } from 'lucide-react';
import { OUTREACH_KANBAN_STATUSES, OUTREACH_STATUS_LABELS, type OutreachStatus } from '../../types';

export interface OutreachSelectionPanelProps {
  selectedCount: number;
  moveTo: OutreachStatus;
  onMoveToChange: (status: OutreachStatus) => void;
  onApply: () => void;
  onClear: () => void;
  busy?: boolean;
  applyLabel?: string;
  onSendEmail?: () => void;
  children?: React.ReactNode;
}

export default function OutreachSelectionPanel({
  selectedCount,
  moveTo,
  onMoveToChange,
  onApply,
  onClear,
  busy = false,
  applyLabel,
  onSendEmail,
  children,
}: OutreachSelectionPanelProps) {
  if (selectedCount === 0) return null;

  const label =
    applyLabel ?? `Move ${selectedCount.toLocaleString()} organization${selectedCount === 1 ? '' : 's'}`;

  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 w-[min(100%-2rem,36rem)] -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-4 duration-200"
      role="region"
      aria-label="Selection actions"
    >
      <div className="rounded-2xl border border-ink-200/80 bg-white/95 shadow-[0_12px_40px_rgba(4,28,60,0.18)] backdrop-blur-md dark:border-border dark:bg-card/95 dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-3 dark:border-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-2 shrink-0 rounded-full bg-teal" aria-hidden />
              <p className="text-sm font-semibold text-ink-950 dark:text-foreground">
                {selectedCount.toLocaleString()} selected
              </p>
            </div>
            {children && <div className="mt-1.5 text-xs text-ink-500 dark:text-muted-foreground">{children}</div>}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-muted dark:hover:text-foreground"
            aria-label="Clear selection"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div>
            <p className="mb-2 font-mono text-2xs uppercase tracking-wider text-ink-500 dark:text-muted-foreground">
              Move to stage
            </p>
            <div className="flex flex-wrap gap-1.5">
              {OUTREACH_KANBAN_STATUSES.map((status) => {
                const active = moveTo === status;
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={busy}
                    onClick={() => onMoveToChange(status)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                      active
                        ? 'bg-teal text-white shadow-sm'
                        : 'bg-ink-50 text-ink-700 hover:bg-ink-100 dark:bg-muted dark:text-foreground dark:hover:bg-muted/80'
                    }`}
                  >
                    {OUTREACH_STATUS_LABELS[status]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onApply}
              disabled={busy}
              className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-xl bg-teal px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              {label}
            </button>
            {onSendEmail && (
              <button
                type="button"
                onClick={onSendEmail}
                disabled={busy}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-800 transition-colors hover:bg-ink-50 disabled:opacity-50 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted"
              >
                <Send size={15} />
                Email
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
