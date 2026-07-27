import { useState } from 'react';
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as crm from '../../lib/crmApi';

/**
 * One-click workspace creation.
 *
 * The whole point is that an NGO already signed in on ngoreality.com needs to
 * do nothing but press a button: no second account, no configuration, no
 * waiting for us. Provisioning takes a moment because a private schema is
 * created and migrated, so the button reports what is happening rather than
 * just spinning.
 */
export default function WorkspaceSignupCard({
  organizationId,
  organizationName,
  onCreated,
}: {
  organizationId: string;
  organizationName: string;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!crm.CRM_API_CONFIGURED) {
    return (
      <div className="card-brutal p-6">
        <h3 className="text-lg font-bold">Client &amp; case management</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Not available yet — the workspace service is not configured for this site.
        </p>
      </div>
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await crm.createWorkspace(organizationId);
      onCreated();
    } catch (err) {
      setError(
        err instanceof crm.CrmApiError ? err.message : 'Could not create your workspace',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-brutal p-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 h-5 w-5 shrink-0" aria-hidden />
        <div className="flex-1">
          <h3 className="text-lg font-bold">Set up your private workspace</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage the people {organizationName} supports — intake, cases, notes, and the
            service records funders ask for.
          </p>

          <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Private to your organisation.</strong> Your
              records live in their own database schema. No other charity — and no one at
              NGOreality — can read them.
            </li>
            <li>
              <strong className="text-foreground">Roles for your team.</strong> Volunteers can
              record visits without seeing sensitive details.
            </li>
            <li>
              <strong className="text-foreground">Bring your spreadsheet.</strong> Import your
              existing client list, and export it any time.
            </li>
          </ul>

          {error && (
            <p role="alert" className="mt-4 text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <Button onClick={create} disabled={busy} className="btn-brutal-gold mt-5">
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Creating your workspace…
              </>
            ) : (
              <>
                Create workspace
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </>
            )}
          </Button>

          <p className="mt-3 text-xs text-muted-foreground">
            Takes a few seconds. You will be the owner and can invite your team afterwards.
          </p>
        </div>
      </div>
    </div>
  );
}
