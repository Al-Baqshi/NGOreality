import { Link } from 'react-router-dom';
import { ExternalLink, Globe, GripVertical, Mail } from 'lucide-react';
import type { Organization, OutreachStatus } from '../../types';
import { OUTREACH_KANBAN_STATUSES, OUTREACH_STATUS_LABELS } from '../../types';
import { markRegisteredInbound, registerAsCustomer, setOutreachStatus } from '../../lib/crmOutreach';
import { useConfirm } from '../../contexts/ConfirmContext';
import type { OrgEmailStatus } from '../../hooks/useOutreachEmail';
import { outreachEmailBadge } from '../../lib/outreachEmailBadge';

type Props = {
  org: Organization;
  column: OutreachStatus;
  onUpdated: () => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  emailStatus?: OrgEmailStatus;
  dragPayloadIds?: string[];
};

function emailBadge(status?: OrgEmailStatus) {
  const badge = outreachEmailBadge(status);
  if (!badge) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 font-mono text-2xs ${badge.className}`}
      title={badge.title}
    >
      <Mail size={9} aria-hidden />
      {badge.label}
    </span>
  );
}

export default function OutreachKanbanCard({
  org,
  column,
  onUpdated,
  selected = false,
  onToggleSelect,
  emailStatus,
  dragPayloadIds,
}: Props) {
  const confirm = useConfirm();

  const move = async (next: OutreachStatus) => {
    await setOutreachStatus(org.id, next);
    onUpdated();
  };

  const handleRegisterInbound = async () => {
    await markRegisteredInbound(org.id);
    onUpdated();
  };

  const handleRegisterCustomer = async () => {
    const ok = await confirm({
      title: 'Register as customer?',
      description: `Register "${org.name}" as a customer? They will leave the lead pipeline.`,
      confirmLabel: 'Register',
    });
    if (!ok) return;
    await registerAsCustomer(org.id);
    onUpdated();
  };

  const idsToDrag = dragPayloadIds?.length ? dragPayloadIds : [org.id];

  const quickActions: { label: string; onClick: () => void; primary?: boolean }[] = [];
  if (column === 'not_contacted') {
    quickActions.push({ label: 'Cold email', onClick: () => void move('cold_email') });
  }
  if (column === 'not_contacted' || column === 'cold_email') {
    quickActions.push({ label: 'Contacted', onClick: () => void move('contacted') });
  }
  if (column === 'contacted') {
    quickActions.push(
      { label: 'Follow-up', onClick: () => void move('follow_up') },
      { label: 'Inbound', onClick: () => void handleRegisterInbound(), primary: true },
      { label: 'Declined', onClick: () => void move('declined') },
    );
  }
  if (column === 'follow_up') {
    quickActions.push(
      { label: 'Inbound', onClick: () => void handleRegisterInbound(), primary: true },
      { label: 'Declined', onClick: () => void move('declined') },
    );
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/org-ids', idsToDrag.join(','));
        e.dataTransfer.setData('application/org-id', org.id);
        e.dataTransfer.setData('application/from-status', column);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`kanban-card mb-2 cursor-grab active:cursor-grabbing ${selected ? 'kanban-card-selected' : ''}`}
    >
      <div className="flex gap-2">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(org.id)}
            className="mt-1 size-4 shrink-0 rounded accent-teal"
            aria-label={`Select ${org.name}`}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <GripVertical size={14} className="mt-0.5 shrink-0 text-ink-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              to={`/organizations/${org.id}`}
              className="text-sm font-semibold leading-snug text-ink-950 hover:text-teal line-clamp-2 dark:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              {org.name}
            </Link>
            <Link
              to={`/organizations/${org.id}`}
              className="shrink-0 text-ink-400 hover:text-teal"
              title="Open profile"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={13} />
            </Link>
          </div>

          {(org.charity_registration_number || org.external_id) && (
            <p className="mt-0.5 font-mono text-2xs text-ink-400">
              #{org.charity_registration_number || org.external_id}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {org.email ? (
              <span className="max-w-full truncate font-mono text-2xs text-ink-500">{org.email}</span>
            ) : (
              <span className="font-mono text-2xs text-red-500/90">No email</span>
            )}
            {org.website_url?.trim() ? (
              <a
                href={org.website_url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-0.5 font-mono text-2xs text-teal hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Globe size={10} /> Site
              </a>
            ) : (
              <span className="font-mono text-2xs text-ink-400">No site</span>
            )}
            {emailBadge(emailStatus)}
          </div>

          {emailStatus?.status === 'failed' && emailStatus.errorMessage && (
            <p className="mt-1 line-clamp-2 font-mono text-2xs text-red-600" title={emailStatus.errorMessage}>
              {emailStatus.errorMessage}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2 border-t border-ink-100 pt-2.5 dark:border-border">
        <label className="block">
          <span className="mb-1 block font-mono text-2xs uppercase tracking-wider text-ink-400">Stage</span>
          <select
            className="kanban-stage-select"
            value={column}
            onChange={async (e) => {
              const next = e.target.value as OutreachStatus;
              if (next === 'registered') {
                await handleRegisterInbound();
              } else if (OUTREACH_KANBAN_STATUSES.includes(next)) {
                await move(next);
              }
            }}
          >
            {OUTREACH_KANBAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {OUTREACH_STATUS_LABELS[s]}
              </option>
            ))}
            <option value="registered">Inbound — interested</option>
          </select>
        </label>

        {quickActions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className={action.primary ? 'kanban-action-chip kanban-action-chip-primary' : 'kanban-action-chip'}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleRegisterCustomer()}
          className="w-full text-left font-mono text-2xs text-ink-400 underline-offset-2 hover:text-accent hover:underline"
        >
          Register as customer
        </button>
      </div>
    </div>
  );
}
