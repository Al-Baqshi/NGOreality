import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Lock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCases, useClient, useWorkspaceIdentity } from '../../../hooks/useWorkspace';
import * as crm from '../../../lib/crmApi';
import SEO from '../../../components/SEO';

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || '—'}</dd>
    </div>
  );
}

export default function NgoWorkspaceClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const identity = useWorkspaceIdentity();
  const { data: client, loading, error, refetch } = useClient(id);
  const cases = useCases({ client_id: id, limit: 50 });

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="card-brutal p-6" role="alert">
        <p className="font-medium text-destructive">{error ?? 'Client not found'}</p>
        <Link to="/ngo/workspace/clients" className="mt-3 inline-block text-sm underline">
          Back to clients
        </Link>
      </div>
    );
  }

  const fullName = `${client.given_name} ${client.family_name}`.trim() || 'Unnamed client';

  return (
    <div className="space-y-5">
      <SEO title={`${fullName} — NGOreality`} noindex />

      <Link
        to="/ngo/workspace/clients"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
        All clients
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{fullName}</h2>
          <p className="text-sm text-muted-foreground">
            {client.reference_code ? `Ref ${client.reference_code} · ` : ''}
            {client.status}
          </p>
        </div>
      </div>

      <div className="card-brutal p-5">
        <h3 className="font-bold">Details</h3>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Preferred name" value={client.preferred_name} />
          <Field label="Date of birth" value={client.date_of_birth?.slice(0, 10)} />
          <Field label="Email" value={client.contact_email} />
          <Field label="Phone" value={client.contact_phone} />
          <Field
            label="Address"
            value={[client.address_line1, client.address_line2, client.city, client.postcode]
              .filter(Boolean)
              .join(', ')}
          />
          <Field label="Country" value={client.country} />
        </dl>
      </div>

      {/*
        Sensitive details are absent from the payload entirely for roles that
        may not see them — not hidden client-side. Saying so explicitly is
        better than silently showing nothing, which reads like missing data.
      */}
      {identity.data?.can_access_sensitive ? (
        client.sensitive ? (
          <div className="card-brutal p-5">
            <h3 className="flex items-center gap-2 font-bold">
              <Lock className="h-4 w-4" aria-hidden />
              Sensitive details
            </h3>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Ethnicity" value={client.sensitive.ethnicity} />
              <Field label="Iwi affiliation" value={client.sensitive.iwi_affiliation} />
              <Field label="Gender" value={client.sensitive.gender} />
              <Field label="Legal status" value={client.sensitive.legal_status} />
              <Field label="Health notes" value={client.sensitive.health_notes} />
              <Field
                label="Risk flags"
                value={client.sensitive.risk_flags?.join(', ')}
              />
            </dl>
          </div>
        ) : null
      ) : (
        <div className="card-brutal p-5">
          <h3 className="flex items-center gap-2 font-bold text-muted-foreground">
            <Lock className="h-4 w-4" aria-hidden />
            Sensitive details
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Your role does not have access to these. Ask an administrator if you need it.
          </p>
        </div>
      )}

      <CasesSection
        clientId={client.id}
        cases={cases}
        canWrite={identity.data?.can_write ?? false}
        onChanged={() => {
          void cases.refetch();
          void refetch();
        }}
      />
    </div>
  );
}

function CasesSection({
  clientId,
  cases,
  canWrite,
  onChanged,
}: {
  clientId: string;
  cases: ReturnType<typeof useCases>;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await crm.createCase({ client_id: clientId, title: title.trim() });
      setTitle('');
      setAdding(false);
      onChanged();
    } catch (err) {
      setError(err instanceof crm.CrmApiError ? err.message : 'Could not create the case');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-brutal p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">Cases</h3>
        {canWrite && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            New case
          </Button>
        )}
      </div>

      {adding && (
        <form onSubmit={create} className="mt-3 flex flex-wrap gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is this case about?"
            aria-label="Case title"
            autoFocus
            className="min-w-[200px] flex-1 rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={busy || !title.trim()} className="btn-brutal-gold">
            {busy ? 'Creating…' : 'Create'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {cases.loading && <p className="mt-3 text-sm text-muted-foreground">Loading cases…</p>}

      {cases.data && cases.data.items.length === 0 && !cases.loading && (
        <p className="mt-3 text-sm text-muted-foreground">No cases yet.</p>
      )}

      {cases.data && cases.data.items.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {cases.data.items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <Link to={`/ngo/workspace/cases/${c.id}`} className="text-sm font-medium underline">
                {c.title || 'Untitled case'}
              </Link>
              <span className="shrink-0 rounded border border-foreground px-2 py-0.5 text-xs">
                {c.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
