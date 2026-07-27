import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClients, useWorkspaceIdentity } from '../../../hooks/useWorkspace';
import * as crm from '../../../lib/crmApi';
import SEO from '../../../components/SEO';

const PAGE_SIZE = 25;

function displayName(c: { given_name: string; family_name: string; preferred_name: string | null }) {
  const full = `${c.given_name} ${c.family_name}`.trim();
  if (c.preferred_name && c.preferred_name !== c.given_name) {
    return `${full} (${c.preferred_name})`;
  }
  return full || 'Unnamed client';
}

export default function NgoWorkspaceClientsPage() {
  const identity = useWorkspaceIdentity();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);

  // Debounce so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const params = useMemo(
    () => ({ search, status, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [search, status, page],
  );
  const { data, loading, error, refetch } = useClients(params);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <SEO title="Clients — NGOreality" noindex />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Clients</h2>
          <p className="text-sm text-muted-foreground">
            {loading && !data ? 'Loading…' : `${total} ${total === 1 ? 'person' : 'people'}`}
          </p>
        </div>
        <div className="flex gap-2">
          {identity.data?.is_admin && <ImportButton onDone={refetch} />}
          {identity.data?.can_write && (
            <Link
              to="/ngo/workspace/clients/new"
              className="btn-brutal-gold inline-flex items-center px-4 py-2 text-sm font-medium"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Add client
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, reference or email…"
            aria-label="Search clients"
            className="w-full rounded-md border-2 border-foreground bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
          aria-label="Filter by status"
          className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {error && (
        <div className="card-brutal p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {data && data.items.length === 0 && !loading && (
        <div className="card-brutal p-6 text-center">
          <p className="font-medium">{search || status ? 'No matches' : 'No clients yet'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || status
              ? 'Try a different search or filter.'
              : 'Add your first client, or import your existing spreadsheet.'}
          </p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="card-brutal overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b-2 border-foreground text-left">
              <tr>
                <th className="p-3 font-bold">Name</th>
                <th className="p-3 font-bold">Reference</th>
                <th className="p-3 font-bold">Contact</th>
                <th className="p-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <Link to={`/ngo/workspace/clients/${c.id}`} className="font-medium underline">
                      {displayName(c)}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{c.reference_code ?? '—'}</td>
                  <td className="p-3 text-muted-foreground">
                    {c.contact_email ?? c.contact_phone ?? '—'}
                  </td>
                  <td className="p-3">
                    <span className="rounded border border-foreground px-2 py-0.5 text-xs font-medium">
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            disabled={page + 1 >= pageCount || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * CSV import. Most NGOs arrive with a spreadsheet, so this is the first thing
 * they need — and the result deliberately reports skipped rows rather than a
 * bare success count, because a silent partial import is worse than an error.
 */
function ImportButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<crm.ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after a fix
    if (!file) return;

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await crm.importClients(file);
      setResult(res);
      onDone();
    } catch (err) {
      setError(err instanceof crm.CrmApiError ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="inline-flex cursor-pointer items-center rounded-md border-2 border-foreground px-4 py-2 text-sm font-medium">
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="mr-2 h-4 w-4" aria-hidden />
        )}
        {busy ? 'Importing…' : 'Import CSV'}
        <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} className="sr-only" />
      </label>

      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}

      {result && (
        <div className="w-full card-brutal mt-2 p-4 text-sm">
          <p className="font-medium">
            Imported {result.imported} {result.imported === 1 ? 'client' : 'clients'}
            {result.skipped > 0 && ` · skipped ${result.skipped}`}
          </p>
          {result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-muted-foreground">
                See what was skipped ({result.errors.length})
              </summary>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {result.errors.slice(0, 25).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
                {result.errors.length > 25 && <li>…and {result.errors.length - 25} more</li>}
              </ul>
            </details>
          )}
        </div>
      )}
    </>
  );
}
