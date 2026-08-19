import { useEffect, useState } from 'react';
import { ArrowRight, Check, Loader2, Mail, X } from 'lucide-react';
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

/** Inline batch actions — scrolls with the page, no sticky bar or side sheet. */
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
      className="card-brutal mb-4 overflow-hidden border-l-4 border-l-teal"
      role="region"
      aria-label="Batch actions"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink-950 bg-ink-950 px-4 py-2.5 text-white">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <span className="font-mono text-2xs uppercase tracking-wider text-teal">Batch</span>
          <span className="text-sm font-semibold">
            {selectedCount.toLocaleString()} selected
          </span>
          {hint && (
            <span className="text-xs text-ink-300 max-w-md truncate">{hint}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onSendEmail && (
            <button
              type="button"
              onClick={onSendEmail}
              disabled={busy}
              className="inline-flex min-h-[36px] items-center gap-1.5 border-2 border-white/30 px-3 text-xs font-semibold hover:bg-white/10 disabled:opacity-50"
            >
              <Mail size={14} />
              Send email
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="inline-flex min-h-[36px] items-center gap-1 px-2 text-xs text-ink-300 hover:text-white disabled:opacity-50"
          >
            <X size={14} />
            Clear
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <p className="font-mono text-2xs uppercase tracking-wider text-ink-500 dark:text-muted-foreground">
          Choose destination stage
        </p>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {OUTREACH_KANBAN_STATUSES.map((status) => {
            const active = pending === status;
            const hintText = OUTREACH_COLUMN_HINTS[status];
            return (
              <button
                key={status}
                type="button"
                disabled={busy}
                title={hintText}
                onClick={() => setPending(status)}
                className={`group flex min-w-[7.5rem] shrink-0 flex-col border-2 px-3 py-2.5 text-left transition-all disabled:opacity-50 ${
                  active
                    ? 'border-teal bg-teal/10 shadow-[3px_3px_0_0_#041C3C] dark:shadow-[3px_3px_0_0_#000]'
                    : 'border-ink-200 bg-white hover:border-ink-950 hover:shadow-[2px_2px_0_0_#041C3C] dark:border-border dark:bg-card dark:hover:border-foreground'
                }`}
              >
                <span className="font-mono text-2xs uppercase tracking-wider text-teal">
                  {status.replace('_', ' ')}
                </span>
                <span className="mt-1 text-xs font-semibold leading-snug text-ink-950 dark:text-foreground">
                  {OUTREACH_STATUS_LABELS[status]}
                </span>
                {hintText && (
                  <span className="mt-1 line-clamp-2 text-2xs leading-relaxed text-ink-500 opacity-0 transition-opacity group-hover:opacity-100 dark:text-muted-foreground">
                    {hintText}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {pending && (
          <div className="flex flex-wrap items-center gap-3 border-2 border-dashed border-teal bg-teal/5 px-4 py-3 animate-in fade-in-0 slide-in-from-top-1 duration-150">
            <ArrowRight size={16} className="shrink-0 text-teal" aria-hidden />
            <p className="flex-1 text-sm text-ink-800 dark:text-foreground min-w-[12rem]">
              Move{' '}
              <strong>{selectedCount.toLocaleString()}</strong>{' '}
              organisation{selectedCount === 1 ? '' : 's'} to{' '}
              <strong>{pendingLabel}</strong>?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={busy}
                className="btn-brutal-outline text-xs min-h-[40px] px-4 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
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
                disabled={busy}
                className="btn-brutal-teal text-xs min-h-[40px] px-4 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                Confirm move
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
