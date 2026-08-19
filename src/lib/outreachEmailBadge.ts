import type { OrgEmailStatus } from '../hooks/useOutreachEmail';

export type OutreachEmailBadge = {
  label: string;
  className: string;
  title?: string;
};

/** Kanban/worklist badge for latest outreach notification on an org. */
export function outreachEmailBadge(status?: OrgEmailStatus): OutreachEmailBadge | null {
  if (!status) return null;

  const err = status.errorMessage?.trim() || undefined;

  switch (status.status) {
    case 'sent':
      return {
        label: 'Emailed',
        className: 'bg-teal/10 text-teal border-teal/30',
      };
    case 'pending':
      return {
        label: 'Queued',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'failed':
      return {
        label: 'Failed',
        className: 'bg-red-50 text-red-700 border-red-200',
        title: err,
      };
    case 'suppressed':
      return {
        label: 'Unsubscribed',
        className: 'bg-ink-50 text-ink-600 border-ink-200',
        title: err ?? 'Recipient is on the suppression list — will not be sent.',
      };
    case 'skipped':
      if (err?.toLowerCase().includes('removed from queue')) {
        return {
          label: 'Removed',
          className: 'bg-ink-50 text-ink-500 border-ink-200',
          title: err,
        };
      }
      return {
        label: 'Not sent',
        className: 'bg-ink-50 text-ink-500 border-ink-200',
        title: err ?? 'This outreach email was not delivered.',
      };
    case 'sending':
      return {
        label: 'Sending…',
        className: 'bg-sky-50 text-sky-800 border-sky-200',
      };
    default:
      return {
        label: 'Not sent',
        className: 'bg-ink-50 text-ink-500 border-ink-200',
        title: err,
      };
  }
}
