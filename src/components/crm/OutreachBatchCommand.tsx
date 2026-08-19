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

/** Compact batch actions — sits directly above the board or worklist. */
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
      className="mb-2 overflow-hidden border-3 border-ink-950 bg-ink-950 text-white"
      role="region"
      aria-label="Batch actions"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="bg-teal px-1.5 py-0.5 font-mono text-2xs font-bold tabular-nums leading-none">
            {selectedCount.toLocaleString()}
          </span>
          <span className="text-sm font-semibold leading-none">selected</span>
          {hint && (
            <span className="hidden max-w-[16rem] truncate text-xs text-ink-300 sm:inline">
              {hint}
            </span>
          )}
        </div>

        <div className="h-4 w-px bg-white/20 hidden sm:block" aria-hidden />

        {pending ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <p className="text-sm leading-snug">
              Move to <strong>{pendingLabel}</strong>?
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
                    /* parent surfaces errors; keep confirm open */
                  }
                })();
              }}
              className="inline-flex min-h-[32px] items-center gap-1.5 bg-teal px-2.5 text-xs font-semibold text-white hover:bg-teal/90 disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Confirm
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPending(null)}
              className="inline-flex min-h-[32px] items-center px-2 text-xs text-ink-300 hover:text-white disabled:opacity-50"
            >
              Back
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className="shrink-0 font-mono text-2xs uppercase tracking-wider text-ink-400">
              Move to
            </span>
            {OUTREACH_KANBAN_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                disabled={busy}
                title={OUTREACH_COLUMN_HINTS[status] ?? OUTREACH_STATUS_LABELS[status]}
                onClick={() => setPending(status)}
                className="inline-flex min-h-[32px] items-center border border-white/25 px-2 text-xs font-medium text-white/90 transition-colors hover:border-white hover:bg-white/10 disabled:opacity-50"
              >
                {STAGE_CHIPS[status]}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {onSendEmail && (
            <button
              type="button"
              onClick={onSendEmail}
              disabled={busy}
              className="inline-flex min-h-[32px] items-center gap-1.5 border border-white/30 px-2.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
            >
              <Mail size={13} />
              Email
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="inline-flex min-h-[32px] items-center gap-1 px-2 text-xs text-ink-300 hover:text-white disabled:opacity-50"
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
