import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Clock, FolderOpen, Loader2, Users } from 'lucide-react';
import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import { useWorkspaceIdentity, useWorkspaceStats } from '../../../hooks/useWorkspace';
import WorkspaceSignupCard from '../../../components/ngo/WorkspaceSignupCard';
import SEO from '../../../components/SEO';

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: typeof Users;
}) {
  return (
    <div className="card-brutal p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function NgoWorkspacePage() {
  const { organization } = useNgoPortalContext();
  const identity = useWorkspaceIdentity();

  if (identity.loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading your workspace…
      </div>
    );
  }

  // No workspace yet — this is the signup moment, not an error.
  if (identity.noWorkspace) {
    if (!organization) {
      return (
        <div className="card-brutal p-6">
          <h3 className="text-lg font-bold">Link your organisation first</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect your charity to your account, then you can create a workspace.
          </p>
          <Link to="/ngo/profile" className="mt-4 inline-flex items-center text-sm font-medium underline">
            Go to profile <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          </Link>
        </div>
      );
    }
    return (
      <>
        <SEO title="Workspace — NGOreality" noindex />
        <WorkspaceSignupCard
          organizationId={organization.id}
          organizationName={organization.name}
          onCreated={() => void identity.refetch()}
        />
      </>
    );
  }

  if (identity.error) {
    return (
      <div className="card-brutal p-6" role="alert">
        <div className="flex items-center gap-2 font-medium text-destructive">
          <AlertCircle className="h-4 w-4" aria-hidden />
          Could not load your workspace
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{identity.error}</p>
        <button onClick={() => void identity.refetch()} className="mt-4 text-sm font-medium underline">
          Try again
        </button>
      </div>
    );
  }

  return <WorkspaceDashboard roleLabel={identity.data?.role ?? 'viewer'} />;
}

function WorkspaceDashboard({ roleLabel }: { roleLabel: string }) {
  const { data, loading, error } = useWorkspaceStats();

  return (
    <div className="space-y-6">
      <SEO title="Workspace — NGOreality" noindex />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Caseload</h2>
          <p className="text-sm text-muted-foreground">Last 3 months · you are signed in as {roleLabel}</p>
        </div>
        <Link to="/ngo/workspace/clients" className="btn-brutal-gold inline-flex items-center px-4 py-2 text-sm font-medium">
          View clients <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading figures…
        </div>
      )}

      {error && (
        <div className="card-brutal p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Active clients" value={data.clients_active} hint={`${data.clients_total} total`} icon={Users} />
            <StatTile label="Open cases" value={data.cases_open} hint={`${data.cases_closed_in_period} closed this period`} icon={FolderOpen} />
            <StatTile label="Overdue" value={data.cases_overdue} hint="Past their due date" icon={Clock} />
            <StatTile
              label="Sessions delivered"
              value={data.sessions_in_period}
              hint={`${Math.round(data.session_minutes_in_period / 60)} hours · ${data.clients_served_in_period} people`}
              icon={Users}
            />
          </div>

          {Object.keys(data.sessions_by_service_type).length > 0 && (
            <div className="card-brutal p-5">
              <h3 className="font-bold">Sessions by service</h3>
              <ul className="mt-3 space-y-2">
                {Object.entries(data.sessions_by_service_type)
                  .sort((a, b) => b[1] - a[1])
                  .map(([service, count]) => (
                    <li key={service} className="flex items-center justify-between gap-4 text-sm">
                      <span className="truncate">{service}</span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {data.clients_total === 0 && (
            <div className="card-brutal p-6">
              <h3 className="font-bold">No clients yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Add your first client, or import the spreadsheet you use today.
              </p>
              <Link to="/ngo/workspace/clients" className="mt-4 inline-flex items-center text-sm font-medium underline">
                Get started <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
