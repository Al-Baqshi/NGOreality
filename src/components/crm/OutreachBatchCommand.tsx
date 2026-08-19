import { useEffect, useState } from 'react';
import { Check, Loader2, Mail, X } from 'lucide-react';
import {
  OUTREACH_KANBAN_STATUSES,
  OUTREACH_COLUMN_HINTS,
  OUTREACH_STATUS_LABELS,
  type OutreachStatus,
} from '../../types';

export interface OutreachBatchCommandProps {
  selectedCount: number;
  onClear: () => void;
  onMove: (status: OutreachStatus) => Promise<void>;
  busy?: boolean;
  onSendEmail?: () => void;
  hint?: React.ReactNode;
}

const STAGE_CHIPS: Record<(typeof OUTREACH_KANBAN_STATUSES)[number], string> = {
  not_contacted: 'Not contacted',
  cold_email: 'Cold email',
  contacted: 'Contacted',
  follow_up: 'Follow-up',
  declined: 'Declined',
};

/** Compact batch actions — full width, light palette. */
export default function OutreachBatchCommand({
  selectedCount,
  onClear,
  onMove,
  busy = false,
  onSendEmail,
  hint,
}: OutreachBatchCommandProps) {
  const [pending, setPending] = useState<OutreachStatus | null>(null);

  useEffect(() => {
    if (selectedCount === 0) setPending(null);
  }, [selectedCount]);

  if (selectedCount === 0) return null;

  const pendingLabel = pending ? OUTREACH_STATUS_LABELS[pending] : '';

  return (
    <section
      className="mb-2 w-full overflow-hidden rounded-lg border-2 border-teal/25 bg-gradient-to-r from-teal/10 via-white to-amber-50/80 shadow-sm dark:from-teal/15 dark:via-card dark:to-card"
      role="region"
      aria-label="Batch actions"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-teal px-2 py-1 font-mono text-2xs font-bold tabular-nums leading-none text-white">
            {selectedCount.toLocaleString()}
          </span>
          <span className="text-sm font-semibold leading-none text-ink-800 dark:text-foreground">selected</span>
          {hint && (
            <span className="hidden max-w-[20rem] truncate text-xs text-ink-500 dark:text-muted-foreground sm:inline">
              {hint}
            </span>
          )}
        </div>

        <div className="hidden h-5 w-px bg-teal/20 sm:block" aria-hidden />

        {pending ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <p className="text-sm leading-snug text-ink-700 dark:text-foreground">
              Move to <strong className="text-teal">{pendingLabel}</strong>?
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  if (!pending) return;
                  try {
                    await onMove(pending);
                    setPending(null);
                  } catch {
                    /* parent surfaces errors */
                  }
                })();
              }}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md bg-teal px-3 text-xs font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Confirm
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPending(null)}
              className="inline-flex min-h-[34px] items-center px-2 text-xs text-ink-500 hover:text-ink-800 disabled:opacity-50 dark:text-muted-foreground"
            >
              Back
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className="shrink-0 font-mono text-2xs uppercase tracking-wider text-ink-400">Move to</span>
            {OUTREACH_KANBAN_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                disabled={busy}
                title={OUTREACH_COLUMN_HINTS[status] ?? OUTREACH_STATUS_LABELS[status]}
                onClick={() => setPending(status)}
                className="inline-flex min-h-[34px] items-center rounded-md border border-ink-200/80 bg-white/90 px-2.5 text-xs font-medium text-ink-700 transition-colors hover:border-teal/50 hover:bg-teal/5 hover:text-teal disabled:opacity-50 dark:border-border dark:bg-card dark:text-foreground"
              >
                {STAGE_CHIPS[status]}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {onSendEmail && (
            <button
              type="button"
              onClick={onSendEmail}
              disabled={busy}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 hover:border-teal/40 hover:bg-teal/5 disabled:opacity-50 dark:border-border dark:bg-card"
            >
              <Mail size={13} />
              Email
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-md px-2 text-xs text-ink-500 hover:bg-ink-100 hover:text-ink-800 disabled:opacity-50 dark:hover:bg-muted"
            aria-label="Clear selection"
          >
            <X size={13} />
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}
