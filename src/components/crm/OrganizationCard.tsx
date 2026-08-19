import { Link, useState } from 'react-router-dom';
import { Globe, Mail, UserPlus, MoreHorizontal, ExternalLink, Loader2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Organization, OutreachStatus } from '../../types';
import { setOutreachStatus, markRegisteredInbound, registerAsCustomer } from '../../lib/crmOutreach';
import { useConfirm } from '../../contexts/ConfirmContext';
import type { OrgEmailStatus } from '../../hooks/useOutreachEmail';

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
      ? 'text-teal border-teal/40 bg-teal/10'
      : status.status === 'pending'
        ? 'text-amber-700 border-amber-400 bg-amber/10'
        : 'text-red-600 border-red-300 bg-red/10';
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono text-2xs border px-1.5 py-0.5 ${tone}`}
      title={status.status === 'failed' && status.errorMessage ? status.errorMessage : undefined}
    >
      <Mail size={10} aria-hidden />
      {label}
    </span>
  );
}

interface Props {
  org: Organization;
  column: OutreachStatus;
  onUpdated: () => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  emailStatus?: OrgEmailStatus;
  dragPayloadIds?: string[];
}

export default function OrganizationCard({
  org,
  column,
  onUpdated,
  selected = false,
  onToggleSelect,
  emailStatus,
  dragPayloadIds,
}: Props) {
  const confirm = useConfirm();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const move = async (next: OutreachStatus) => {
    setBusyAction(`move-${next}`);
    try {
      await setOutreachStatus(org.id, next);
      onUpdated();
    } finally {
      setBusyAction(null);
    }
  };

  const handleRegisterInbound = async () => {
    setBusyAction('register-inbound');
    try {
      await markRegisteredInbound(org.id);
      onUpdated();
    } finally {
      setBusyAction(null);
    }
  };

  const handleRegisterCustomer = async () => {
    const ok = await confirm({
      title: 'Register as customer?',
      description: `Register "${org.name}" as a customer? They will leave the lead pipeline.`,
      confirmLabel: 'Register',
    });
    if (!ok) return;
    setBusyAction('register-customer');
    try {
      await registerAsCustomer(org.id);
      onUpdated();
    } finally {
      setBusyAction(null);
    }
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
      className={`border-2 bg-white p-3 dark:bg-ink-900 cursor-grab active:cursor-grabbing transition-all ${
        selected ? 'border-accent ring-2 ring-accent/20' : 'border-ink-200 dark:border-ink-700'
      } hover:border-teal/50 dark:hover:border-teal/30`}
    >
      <div className="flex gap-2">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(org.id)}
            className="mt-1 size-5 shrink-0 accent-teal"
            aria-label={`Select ${org.name}`}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <div className="min-w-0 flex-1">
          <Link
            to={`/organizations/${org.id}`}
            className="text-sm font-semibold leading-tight hover:text-accent line-clamp-1"
            onClick={(e) => e.stopPropagation()}
          >
            {org.name}
          </Link>
          {(org.charity_registration_number || org.external_id) && (
            <p className="font-mono text-2xs text-ink-400 mt-0.5">#{org.charity_registration_number || org.external_id}</p>
          )}
          {org.email ? (
            <p className="font-mono text-2xs text-ink-500 truncate mt-0.5">{org.email}</p>
          ) : (
            <p className="font-mono text-2xs text-red-500 mt-0.5">No email on file</p>
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
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-1 text-ink-400 hover:text-ink-900 dark:hover:text-white rounded transition-colors"
              aria-label="Actions"
            >
              <MoreHorizontal size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1 border-b border-ink-200 dark:border-ink-700">
              <p className="font-mono text-2xs text-ink-500 truncate">{org.name}</p>
              <p className="font-mono text-2xs text-ink-400">{org.email || 'No email'}</p>
            </div>
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                window.open(`/organizations/${org.id}`, '_blank');
              }}
            >
              <ExternalLink size={14} className="mr-2 h-4 w-4" />
              View organization
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                if (org.email) window.open(`mailto:${org.email}`);
              }}
              disabled={!org.email}
            >
              <Mail size={14} className="mr-2 h-4 w-4" />
              Send email
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                move('not_contacted');
              }}
              disabled={busyAction === 'move-not_contacted' || column === 'not_contacted'}
            >
              → Not contacted
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                move('cold_email');
              }}
              disabled={busyAction === 'move-cold_email' || column === 'cold_email'}
            >
              → Cold email
            </DropdownMenuItem>
            
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                move('contacted');
              }}
              disabled={busyAction === 'move-contacted' || column === 'contacted'}
            >
              → Contacted
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                move('follow_up');
              }}
              disabled={busyAction === 'move-follow_up' || column === 'follow_up'}
            >
              → Follow-up
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                move('declined');
              }}
              disabled={busyAction === 'move-declined' || column === 'declined'}
            >
              → Declined
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                handleRegisterInbound();
              }}
              disabled={busyAction === 'register-inbound'}
            >
              <UserPlus size={14} className="mr-2 h-4 w-4" />
              → Inbound (interested)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                handleRegisterCustomer();
              }}
              disabled={busyAction === 'register-customer'}
              className="text-accent"
            >
              Register as customer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {busyAction && (
        <div className="absolute inset-0 bg-white/80 dark:bg-ink-900/80 flex items-center justify-center z-10">
          <Loader2 size={16} className="animate-spin text-teal" />
        </div>
      )}
    </div>
  );
}