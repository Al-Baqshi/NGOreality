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
      className={`border-2 bg-white p-3 dark:bg-ink-900 cursor-grab active:cursor-grabbing ${
        selected ? 'border-accent ring-1 ring-accent' : 'border-ink-200'
      }`}
    >
      <div className="flex gap-2">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(org.id)}
            className="mt-1 size-5 shrink-0 accent-accent"
            aria-label={`Select ${org.name}`}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <GripVertical size={14} className="text-ink-300 shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <Link
            to={`/organizations/${org.id}`}
            className="text-sm font-semibold leading-tight hover:text-accent line-clamp-2"
            onClick={(e) => e.stopPropagation()}
          >
            {org.name}
          </Link>
          {(org.charity_registration_number || org.external_id) && (
            <p className="font-mono text-2xs text-ink-400 mt-1">#{org.charity_registration_number || org.external_id}</p>
          )}
          {org.email ? (
            <p className="font-mono text-2xs text-ink-500 truncate mt-1">{org.email}</p>
          ) : (
            <p className="font-mono text-2xs text-red-500 mt-1">No email on file</p>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            {org.website_url?.trim() ? (
              <span className="inline-flex items-center gap-0.5 font-mono text-2xs text-teal">
                <Globe size={10} /> Website
              </span>
            ) : (
              <span className="font-mono text-2xs text-ink-400">No website</span>
            )}
            {emailBadge(emailStatus)}
          </div>
          {emailStatus?.status === 'failed' && emailStatus.errorMessage && (
            <p className="font-mono text-2xs text-red-600 mt-1 line-clamp-2" title={emailStatus.errorMessage}>
              {emailStatus.errorMessage}
            </p>
          )}
        </div>
      </div>

      <label className="block mt-2">
        <span className="sr-only">Move to column</span>
        <select
          className="input-brutal w-full text-2xs py-1.5 min-h-[44px]"
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

      <div className="flex flex-wrap gap-1 mt-2">
        {column === 'not_contacted' && (
          <button type="button" onClick={() => move('cold_email')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[36px]">
            → Cold email
          </button>
        )}
        {(column === 'not_contacted' || column === 'cold_email') && (
          <button type="button" onClick={() => move('contacted')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[36px]">
            Contacted
          </button>
        )}
        {column === 'contacted' && (
          <>
            <button type="button" onClick={() => move('follow_up')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[36px]">
              Follow-up
            </button>
            <button type="button" onClick={handleRegisterInbound} className="btn-brutal-teal text-2xs py-1 px-2 min-h-[36px]">
              → Inbound
            </button>
            <button type="button" onClick={() => move('declined')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[36px]">
              Declined
            </button>
          </>
        )}
        {column === 'follow_up' && (
          <>
            <button type="button" onClick={handleRegisterInbound} className="btn-brutal-teal text-2xs py-1 px-2 min-h-[36px]">
              → Inbound
            </button>
            <button type="button" onClick={() => move('declined')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[36px]">
              Declined
            </button>
          </>
        )}
        <button
          type="button"
          onClick={handleRegisterCustomer}
          className="btn-brutal-accent text-2xs py-1 px-2 min-h-[36px] w-full sm:w-auto"
        >
          Register as customer
        </button>
      </div>
    </div>
  );
}
