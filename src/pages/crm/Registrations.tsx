import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, BookMarked, PenLine, Sparkles, UserPlus, ExternalLink } from 'lucide-react';
import { SectionHeader, OrgTrustStatusBadge } from '../../components/ui';
import OrgOriginChip from '../../components/crm/OrgOriginChip';
import RegistryMatchCheck from '../../components/crm/RegistryMatchCheck';
import { updateBadgeRequestStatus, updateSetupRequestStatus } from '../../lib/crmRequests';
import {
  useRegistrations,
  type BadgeRequestRow,
  type SetupRequestRow,
  type SignupOrg,
} from '../../hooks/useRegistrations';
import {
  BADGE_REQUEST_TYPE_LABELS,
  BADGE_REQUEST_STATUS_LABELS,
  NGO_SETUP_REQUEST_STATUS_LABELS,
} from '../../types';

type SignupFilter = 'all' | 'registry' | 'new';

export default function Registrations() {
  const { signups, signupCounts, badgeRequests, setupRequests, loading, refetch } =
    useRegistrations();
  const [signupFilter, setSignupFilter] = useState<SignupFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (id: string, run: () => Promise<string | null>) => {
    setBusyId(id);
    setError(null);
    const err = await run();
    if (err) setError(err);
    await refetch();
    setBusyId(null);
  };

  const filteredSignups = signups.filter((org) =>
    signupFilter === 'all'
      ? true
      : signupFilter === 'registry'
        ? Boolean(org.source_registry)
        : !org.source_registry,
  );

  return (
    <div className="w-full min-w-0 max-w-5xl">
      <SectionHeader>Registrations</SectionHeader>
      <p className="font-mono text-2xs text-ink-500 uppercase tracking-wider -mt-4 mb-6">
        Who signed up, what they asked for, and where they came from
      </p>

      <div className="grid grid-cols-1 min-[400px]:grid-cols-3 gap-3 mb-6">
        <div className="card-brutal p-4 text-center">
          <div className="text-2xl font-black">{loading ? '—' : signupCounts.total}</div>
          <div className="label-brutal mt-1">Portal signups</div>
        </div>
        <div className="card-brutal p-4 text-center">
          <div className="text-2xl font-black text-teal">
            {loading ? '—' : signupCounts.fromRegistry}
          </div>
          <div className="label-brutal mt-1">From registry</div>
        </div>
        <div className="card-brutal p-4 text-center">
          <div className="text-2xl font-black text-accent">
            {loading ? '—' : signupCounts.newSubmissions}
          </div>
          <div className="label-brutal mt-1">New submissions</div>
        </div>
      </div>

      <div className="card-brutal p-4 mb-8 text-xs text-ink-600 space-y-1.5">
        <p className="flex items-start gap-2">
          <BookMarked size={14} className="text-teal shrink-0 mt-0.5" />
          <span>
            <strong className="text-ink-950">From registry</strong> — they claimed an NGO we
            imported from the NZ Charities Register. Identity is anchored to the official record;
            review their website and mission, then pass the standards.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <PenLine size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <span>
            <strong className="text-ink-950">New submission</strong> — they typed their organisation
            in themselves. People sometimes forget they are already on the register, so each new
            submission is checked for possible registry duplicates below before you verify it.
          </span>
        </p>
      </div>

      {error && (
        <div className="border-2 border-accent bg-accent/10 p-3 mb-6 text-sm font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <p className="font-mono text-sm text-ink-400">Loading registrations…</p>
      ) : (
        <div className="space-y-10">
          <RequestSection
            title="Verification & badge requests"
            icon={<Award size={14} />}
            empty="No badge requests waiting"
            count={badgeRequests.length}
            hint="Approve after the badge is issued from the organization page (standards → pass → issue). Rejecting notifies the NGO."
          >
            {badgeRequests.map((r) => (
              <RequestRow
                key={r.id}
                organizationId={r.organization_id}
                name={r.organizations?.name ?? 'Organization'}
                sourceRegistry={r.organizations?.source_registry ?? ''}
                registrationNumber={r.organizations?.charity_registration_number ?? ''}
                meta={`${BADGE_REQUEST_TYPE_LABELS[r.request_type]} · ${BADGE_REQUEST_STATUS_LABELS[r.status]} · ${new Date(r.created_at).toLocaleDateString()}`}
                notes={r.notes}
                busy={busyId === r.id}
                actions={badgeActions(r, act)}
              />
            ))}
          </RequestSection>

          <RequestSection
            title="Setup requests (landing page / brand)"
            icon={<Sparkles size={14} />}
            empty="No setup requests waiting"
            count={setupRequests.length}
            hint="Approve to start the work, mark completed when delivered, or decline. The NGO is notified on every status change."
          >
            {setupRequests.map((r) => (
              <RequestRow
                key={r.id}
                organizationId={r.organization_id}
                name={r.organizations?.name ?? 'Organization'}
                sourceRegistry={r.organizations?.source_registry ?? ''}
                registrationNumber={r.organizations?.charity_registration_number ?? ''}
                meta={`${setupKindLabel(r)} · ${NGO_SETUP_REQUEST_STATUS_LABELS[r.status]} · ${new Date(r.created_at).toLocaleDateString()}`}
                notes={r.notes}
                busy={busyId === r.id}
                actions={setupActions(r, act)}
              />
            ))}
          </RequestSection>

          <div className="card-brutal">
            <div className="border-b-3 border-ink-950 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
                <UserPlus size={14} /> Recent portal signups
              </h3>
              <div className="flex gap-1">
                {(
                  [
                    ['all', 'All'],
                    ['registry', 'From registry'],
                    ['new', 'New'],
                  ] as [SignupFilter, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSignupFilter(value)}
                    className={`font-mono text-2xs uppercase tracking-wider px-2.5 py-1.5 border-2 transition-colors ${
                      signupFilter === value
                        ? 'border-ink-950 bg-ink-950 text-white'
                        : 'border-ink-200 text-ink-500 hover:border-ink-950'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {filteredSignups.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-400 text-center">No signups yet</p>
            ) : (
              <div>
                {filteredSignups.map((org) => (
                  <SignupRow key={org.id} org={org} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function badgeActions(
  r: BadgeRequestRow,
  act: (id: string, run: () => Promise<string | null>) => Promise<void>,
) {
  const set = (status: 'in_review' | 'approved' | 'rejected') => () =>
    act(r.id, () => updateBadgeRequestStatus(r.id, r.organization_id, status));
  const actions = [];
  if (r.status === 'pending') {
    actions.push({ label: 'Start review', onClick: set('in_review'), tone: 'outline' as const });
  }
  actions.push({ label: 'Approve', onClick: set('approved'), tone: 'teal' as const });
  actions.push({ label: 'Reject', onClick: set('rejected'), tone: 'danger' as const });
  return actions;
}

function setupActions(
  r: SetupRequestRow,
  act: (id: string, run: () => Promise<string | null>) => Promise<void>,
) {
  const set = (status: 'in_review' | 'approved' | 'completed' | 'cancelled') => () =>
    act(r.id, () => updateSetupRequestStatus(r.id, r.organization_id, status));
  const actions = [];
  if (r.status === 'pending') {
    actions.push({ label: 'Start review', onClick: set('in_review'), tone: 'outline' as const });
  }
  actions.push({ label: 'Approve', onClick: set('approved'), tone: 'teal' as const });
  actions.push({ label: 'Completed', onClick: set('completed'), tone: 'outline' as const });
  actions.push({ label: 'Decline', onClick: set('cancelled'), tone: 'danger' as const });
  return actions;
}

function setupKindLabel(r: SetupRequestRow): string {
  if (r.wants_landing_package) return 'Landing + standards package';
  if (r.has_existing_website) return 'Has website';
  return r.request_kind.replace(/_/g, ' ');
}

function RequestSection({
  title,
  icon,
  empty,
  count,
  hint,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  count: number;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-brutal">
      <div className="border-b-3 border-ink-950 px-4 py-3 flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
          {icon} {title}
        </h3>
        <span className="font-mono text-2xs text-ink-400">{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-400 text-center">{empty}</p>
      ) : (
        <>
          <p className="px-4 pt-3 text-2xs text-ink-400 font-mono leading-relaxed">{hint}</p>
          <div>{children}</div>
        </>
      )}
    </div>
  );
}

function RequestRow({
  organizationId,
  name,
  sourceRegistry,
  registrationNumber,
  meta,
  notes,
  busy,
  actions,
}: {
  organizationId: string;
  name: string;
  sourceRegistry: string;
  registrationNumber: string;
  meta: string;
  notes: string;
  busy: boolean;
  actions: { label: string; onClick: () => void; tone: 'teal' | 'danger' | 'outline' }[];
}) {
  return (
    <div className="px-4 py-3 border-b border-ink-100 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/organizations/${organizationId}`} className="text-sm font-semibold underline">
          {name}
        </Link>
        <OrgOriginChip sourceRegistry={sourceRegistry} registrationNumber={registrationNumber} />
      </div>
      <div className="font-mono text-2xs text-ink-500 uppercase tracking-wider mt-1">{meta}</div>
      {notes && <p className="text-xs text-ink-600 mt-1 line-clamp-2">{notes}</p>}
      <div className="flex flex-wrap gap-2 mt-2">
        <Link
          to={`/organizations/${organizationId}`}
          className="btn-brutal-outline text-2xs py-1.5 px-3 inline-flex items-center gap-1"
        >
          Open review <ExternalLink size={10} />
        </Link>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={busy}
            onClick={a.onClick}
            className={`text-2xs py-1.5 px-3 disabled:opacity-50 ${
              a.tone === 'teal'
                ? 'btn-brutal-teal'
                : a.tone === 'danger'
                  ? 'btn-brutal-accent'
                  : 'btn-brutal-outline'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SignupRow({ org }: { org: SignupOrg }) {
  return (
    <div className="px-4 py-3 border-b border-ink-100 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/organizations/${org.id}`} className="text-sm font-semibold underline">
          {org.name}
        </Link>
        <OrgOriginChip
          sourceRegistry={org.source_registry}
          registrationNumber={org.charity_registration_number}
        />
        <OrgTrustStatusBadge org={org} showHint={false} />
      </div>
      <div className="font-mono text-2xs text-ink-400 uppercase tracking-wider mt-1">
        {org.claimed_at ? `Signed up ${new Date(org.claimed_at).toLocaleDateString()}` : ''}
        {org.category ? ` · ${org.category}` : ''}
        {org.location ? ` · ${org.location}` : ''}
      </div>
      {!org.source_registry && (
        <div className="mt-2">
          <RegistryMatchCheck organizationId={org.id} organizationName={org.name} />
        </div>
      )}
    </div>
  );
}
