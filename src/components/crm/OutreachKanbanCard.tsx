import { Link } from 'react-router-dom';
import { Globe, GripVertical } from 'lucide-react';
import type { Organization, OutreachStatus } from '../../types';
import { OUTREACH_KANBAN_STATUSES, OUTREACH_STATUS_LABELS } from '../../types';
import { markRegisteredInbound, registerAsCustomer, setOutreachStatus } from '../../lib/crmOutreach';

type Props = {
  org: Organization;
  column: OutreachStatus;
  onUpdated: () => void;
};

export default function OutreachKanbanCard({ org, column, onUpdated }: Props) {
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

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/org-id', org.id);
        e.dataTransfer.setData('application/from-status', column);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="border-2 border-ink-200 bg-white p-3 dark:bg-ink-900 cursor-grab active:cursor-grabbing"
    >
      <div className="flex gap-2">
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
          {org.email && <p className="font-mono text-2xs text-ink-500 truncate mt-1">{org.email}</p>}
          {org.website_url?.trim() && (
            <span className="inline-flex items-center gap-0.5 font-mono text-2xs text-teal mt-1">
              <Globe size={10} /> Website
            </span>
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
          <option value="registered">→ Registered (inbound)</option>
        </select>
      </label>

      <div className="flex flex-wrap gap-1 mt-2">
        {column === 'not_contacted' && (
          <button type="button" onClick={() => move('contacted')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[36px]">
            Mark contacted
          </button>
        )}
        {column === 'contacted' && (
          <>
            <button type="button" onClick={() => move('follow_up')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[36px]">
              Follow-up
            </button>
            <button type="button" onClick={handleRegisterInbound} className="btn-brutal-teal text-2xs py-1 px-2 min-h-[36px]">
              Registered
            </button>
            <button type="button" onClick={() => move('declined')} className="btn-brutal-outline text-2xs py-1 px-2 min-h-[36px]">
              Declined
            </button>
          </>
        )}
        {column === 'follow_up' && (
          <>
            <button type="button" onClick={handleRegisterInbound} className="btn-brutal-teal text-2xs py-1 px-2 min-h-[36px]">
              Registered
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
