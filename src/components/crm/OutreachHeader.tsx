import { Link } from 'react-router-dom';
import { Plus, Inbox, Users, Mail, AlertTriangle, List } from 'lucide-react';
import { useOutreachFailedCount } from '../../hooks/useOutreachEmail';

interface Props {
  onNewLead: () => void;
  onNavigateWorklist: () => void;
}

export default function OutreachHeader({ onNewLead, onNavigateWorklist }: Props) {
  const { count: outreachFailedCount } = useOutreachFailedCount();

  return (
    <div className="flex flex-col gap-2">
      <div className="page-header mb-0">
        <div>
          <h1 className="page-title">Outreach</h1>
          <p className="mt-1 text-sm text-ink-600 dark:text-muted-foreground">
            Manage and track organizations through your outreach pipeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onNewLead}
            className="btn-brutal-teal inline-flex min-h-[44px] items-center gap-2 text-sm"
          >
            <Plus size={16} /> New lead
          </button>
          <button
            type="button"
            onClick={onNavigateWorklist}
            className="btn-brutal-outline inline-flex min-h-[44px] items-center gap-2 text-sm"
          >
            <List size={16} /> Worklist view
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/inbound" className="card-brutal-hover px-4 py-3 flex items-center gap-2 text-sm min-h-[44px]">
          <Inbox size={16} className="text-teal" />
          <span>
            <strong>Inbound queue</strong>
            <span className="block font-mono text-2xs text-ink-400">
              Said yes / engaging — register as customer when ready
            </span>
          </span>
        </Link>
        <Link to="/customers" className="card-brutal-hover px-4 py-3 flex items-center gap-2 text-sm min-h-[44px]">
          <Users size={16} className="text-accent" />
          <span>
            <strong>Customers</strong>
            <span className="block font-mono text-2xs text-ink-400">Onboarding, verification, monitoring</span>
          </span>
        </Link>
        <Link to="/email-notifications" className="card-brutal-hover px-4 py-3 flex items-center gap-2 text-sm min-h-[44px]">
          <Mail size={16} />
          <span>
            <strong>Email notifications</strong>
            <span className="block font-mono text-2xs text-ink-400">Outreach + system email queue</span>
          </span>
        </Link>
        {outreachFailedCount > 0 && (
          <Link
            to="/email-notifications?status=failed"
            className="card-brutal-hover px-4 py-3 flex items-center gap-2 text-sm min-h-[44px] border-2 border-accent"
          >
            <AlertTriangle size={16} className="text-accent shrink-0" aria-hidden />
            <span>
              <strong className="text-accent">
                {outreachFailedCount} outreach send{outreachFailedCount === 1 ? '' : 's'} failed
              </strong>
              <span className="block font-mono text-2xs text-ink-400">View errors and requeue</span>
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
