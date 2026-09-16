import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCase, useCaseNotes, useWorkspaceIdentity } from '../../../hooks/useWorkspace';
import * as crm from '../../../lib/crmApi';
import { captureError } from '../../../lib/errorReporting';
import SEO from '../../../components/SEO';
import { formatNzDateTime } from '@/lib/formatDate';

export default function NgoWorkspaceCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const identity = useWorkspaceIdentity();
  const { data: kase, loading, error, refetch } = useCase(id);
  const notes = useCaseNotes(id);

  if (loading && !kase) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }

  if (error && !kase) {
    return (
      <div className="card-brutal p-6" role="alert">
        <p className="font-medium text-destructive">{error}</p>
        <Link to="/ngo/workspace/clients" className="mt-3 inline-block text-sm underline">
          Back to clients
        </Link>
      </div>
    );
  }

  if (!kase) {
    return (
      <div className="card-brutal p-6" role="alert">
        <p className="font-medium text-destructive">Case not found</p>
        <Link to="/ngo/workspace/clients" className="mt-3 inline-block text-sm underline">
          Back to clients
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SEO title={`${kase.title || 'Case'} — NGOreality`} noindex />

      <Link
        to={`/ngo/workspace/clients/${kase.client_id}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
        Back to client
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{kase.title || 'Untitled case'}</h2>
          <p className="text-sm text-muted-foreground">
            {kase.status} · {kase.priority} priority
            {kase.service_type ? ` · ${kase.service_type}` : ''}
          </p>
        </div>
        {identity.data?.can_write && kase.status !== 'closed' && (
          <CloseCaseButton caseId={kase.id} onClosed={refetch} />
        )}
      </div>

      {error ? (
        <div className="card-brutal p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      ) : null}

      <NotesSection
        caseId={kase.id}
        notes={notes}
        canWrite={identity.data?.can_write ?? false}
        canRestrict={identity.data?.can_access_sensitive ?? false}
      />
    </div>
  );
}

function CloseCaseButton({ caseId, onClosed }: { caseId: string; onClosed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setBusy(true);
    setError(null);
    try {
      // Title is required by the API's validation, so re-send it unchanged.
      const current = await crm.getCase(caseId);
      await crm.updateCase(caseId, { title: current.title, status: 'closed' });
      onClosed();
    } catch (err) {
      setError(captureError(err, { where: 'NgoWorkspaceCaseDetail.close' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <Button variant="outline" onClick={close} disabled={busy}>
        {busy ? 'Closing…' : 'Close case'}
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Case notes are append-only in the database — there is deliberately no edit
 * or delete. The UI says so, because a caseworker who expects to be able to
 * fix a typo needs to know before they write, not after.
 */
function NotesSection({
  caseId,
  notes,
  canWrite,
  canRestrict,
}: {
  caseId: string;
  notes: ReturnType<typeof useCaseNotes>;
  canWrite: boolean;
  canRestrict: boolean;
}) {
  const [body, setBody] = useState('');
  const [restricted, setRestricted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await crm.createCaseNote(caseId, {
        body: body.trim(),
        visibility: restricted ? 'restricted' : 'team',
      });
      setBody('');
      setRestricted(false);
      void notes.refetch();
    } catch (err) {
      setError(captureError(err, { where: 'NgoWorkspaceCaseDetail.addNote' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-brutal p-5">
      <h3 className="font-bold">Case notes</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Notes cannot be edited or deleted once saved. To correct something, add a new note.
      </p>

      {canWrite && (
        <form onSubmit={add} className="mt-3 space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="What happened?"
            aria-label="New case note"
            className="w-full rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !body.trim()} className="btn-brutal-gold">
              {busy ? 'Saving…' : 'Add note'}
            </Button>
            {canRestrict && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={restricted}
                  onChange={(e) => setRestricted(e.target.checked)}
                />
                Restricted — hide from volunteers
              </label>
            )}
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {notes.error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {notes.error}
        </p>
      )}

      {notes.loading && !notes.data && <p className="mt-3 text-sm text-muted-foreground">Loading notes…</p>}

      {notes.data && notes.data.length === 0 && !notes.loading && !notes.error && (
        <p className="mt-3 text-sm text-muted-foreground">No notes yet.</p>
      )}

      {notes.data && notes.data.length > 0 && (
        <ul className="mt-4 space-y-3">
          {notes.data.map((n) => (
            <li key={n.id} className="border-l-2 border-foreground pl-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <time dateTime={n.created_at}>{formatNzDateTime(n.created_at)}</time>
                {n.visibility === 'restricted' && (
                  <span className="inline-flex items-center gap-1 rounded border border-foreground px-1.5 py-0.5">
                    <Lock className="h-3 w-3" aria-hidden />
                    Restricted
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
