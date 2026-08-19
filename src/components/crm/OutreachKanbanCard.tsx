import { Link } from 'react-router-dom';
import { Globe, GripVertical, Mail } from 'lucide-react';
import type { Organization, OutreachStatus } from '../../types';
import { OUTREACH_KANBAN_STATUSES, OUTREACH_STATUS_LABELS } from '../../types';
import { markRegisteredInbound, registerAsCustomer, setOutreachStatus } from '../../lib/crmOutreach';
import type { OrgEmailStatus } from '../../hooks/useOutreachEmail';

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
  if (!status) return null;
  const label =
    status.status === 'sent'
      ? 'Emailed'
      : status.status === 'pending'
        ? 'Queued'
        : status.status === 'failed'
          ? 'Send failed'
          : 'Skipped';
  const tone =
    status.status === 'sent'
      ? 'text-teal border-teal/40'
      : status.status === 'pending'
        ? 'text-amber-700 border-amber-400'
        : 'text-red-600 border-red-300';
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono text-2xs border px-1 ${tone}`}
      title={status.status === 'failed' && status.errorMessage ? status.errorMessage : undefined}
    >
      <Mail size={10} aria-hidden />
      {label}
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
  const move = async (next: OutreachStatus) => {
    await setOutreachStatus(org.id, next);
    onUpdated();
  };

  const handleRegisterInbound = async () => {
    await markRegisteredInbound(org.id);
    onUpdated();
  };

  const handleRegisterCustomer = async () => {
    if (!confirm(`Register "${org.name}" as a customer? They will leave the lead pipeline.`)) return;
    await registerAsCustomer(org.id);
    onUpdated();
  };

  const idsToDrag = dragPayloadIds?.length ? dragPayloadIds : [org.id];

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/org-ids', idsToDrag.join(','));
        e.dataTransfer.setData('application/org-id', org.id);
        e.dataTransfer.setData('application/from-status', column);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`border-2 bg-white p-2.5 dark:bg-ink-900 cursor-grab active:cursor-grabbing ${
        selected ? 'border-accent ring-1 ring-accent' : 'border-ink-200'
      }`}
    >
      <div className="flex gap-1.5">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(org.id)}
            className="mt-0.5 size-4 shrink-0 accent-accent"
            aria-label={`Select ${org.name}`}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <GripVertical size={12} className="text-ink-300 shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <Link
            to={`/organizations/${org.id}`}
            className="text-sm font-semibold leading-snug hover:text-accent line-clamp-2"
            onClick={(e) => e.stopPropagation()}
          >
            {org.name}
          </Link>
          {(org.charity_registration_number || org.external_id) && (
            <p className="font-mono text-2xs text-ink-400 mt-0.5">#{org.charity_registration_number || org.external_id}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {org.email ? (
              <p className="font-mono text-2xs text-ink-500 truncate">{org.email}</p>
            ) : (
              <p className="font-mono text-2xs text-red-500">No email on file</p>
            )}
            {org.website_url?.trim() ? (
              <span className="inline-flex items-center gap-0.5 font-mono text-2xs text-teal whitespace-nowrap">
                <Globe size={10} /> Website
              </span>
            ) : (
              <span className="font-mono text-2xs text-ink-400 whitespace-nowrap">No website</span>
            )}
            {emailBadge(emailStatus)}
          </div>
          {emailStatus?.status === 'failed' && emailStatus.errorMessage && (
            <p className="font-mono text-2xs text-red-600 mt-0.5 line-clamp-2" title={emailStatus.errorMessage}>
              {emailStatus.errorMessage}
            </p>
          )}
        </div>
      </div>

      <label className="block mt-1.5">
        <span className="sr-only">Move to column</span>
        <select
          className="input-brutal w-full text-2xs py-1 min-h-[36px]"
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
              → {OUTREACH_STATUS_LABELS[s]}
            </option>
          ))}
          <option value="registered">→ Inbound (interested)</option>
        </select>
      </label>

      <div className="flex flex-wrap gap-1 mt-1.5">
        {column === 'not_contacted' && (
          <button type="button" onClick={() => move('cold_email')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[32px] whitespace-nowrap">
            → Cold email
          </button>
        )}
        {(column === 'not_contacted' || column === 'cold_email') && (
          <button type="button" onClick={() => move('contacted')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[32px] whitespace-nowrap">
            Contacted
          </button>
        )}
        {column === 'contacted' && (
          <>
            <button type="button" onClick={() => move('follow_up')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[32px] whitespace-nowrap">
              Follow-up
            </button>
            <button type="button" onClick={handleRegisterInbound} className="btn-brutal-teal text-2xs py-1 px-2 min-h-[32px] whitespace-nowrap">
              → Inbound
            </button>
            <button type="button" onClick={() => move('declined')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[32px] whitespace-nowrap">
              Declined
            </button>
          </>
        )}
        {column === 'follow_up' && (
          <>
            <button type="button" onClick={handleRegisterInbound} className="btn-brutal-teal text-2xs py-1 px-2 min-h-[32px] whitespace-nowrap">
              → Inbound
            </button>
            <button type="button" onClick={() => move('declined')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[32px] whitespace-nowrap">
              Declined
            </button>
          </>
        )}
        <button
          type="button"
          onClick={handleRegisterCustomer}
          className="btn-brutal-accent text-2xs py-1 px-2 min-h-[32px] w-full sm:w-auto whitespace-nowrap"
        >
          Register as customer
        </button>
      </div>
    </div>
  );
}
