import { useCallback, useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, ShieldOff, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { captureError } from '../../lib/errorReporting';
import { formatMembershipDate } from '../../lib/membership';

type PortalMember = {
  user_id: string;
  email: string;
  full_name: string;
  member_role: string;
  joined_at: string;
  verified_at: string | null;
  verified_by: string;
};

/**
 * Who manages this organisation, and at which tier.
 *
 * Claiming is open by design — a claim buys mission control: monitoring, alerts,
 * and the ability for a third party to sponsor a subscription. Stewardship is
 * the separate grant that lets someone edit the PUBLIC listing and apply for a
 * Reality Badge, and it is a staff decision made here.
 *
 * This is the dispute desk: when a charity says "someone else claimed us",
 * this is where you see who, and revoke them.
 */
export default function OrganizationPortalMembers({ organizationId }: { organizationId: string }) {
  const [members, setMembers] = useState<PortalMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return supabase
      .rpc('get_organization_portal_members', { p_organization_id: organizationId })
      .then(({ data, error: rpcError }) => {
        if (rpcError) {
          setError(captureError(rpcError, { where: 'OrganizationPortalMembers', detail: { organizationId } }));
        } else {
          setMembers((data ?? []) as PortalMember[]);
          setError(null);
        }
        setLoading(false);
      });
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    void load().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function setStewardship(userId: string, verified: boolean) {
    const who = members.find((m) => m.user_id === userId);
    const verb = verified ? 'Grant stewardship to' : 'Revoke stewardship from';
    if (!window.confirm(
      `${verb} ${who?.email ?? 'this account'}?\n\n` +
      (verified
        ? 'They will be able to edit this organisation’s public listing and apply for a Reality Badge.'
        : 'They keep monitoring and alerts, but can no longer edit the public listing or apply for a badge.'),
    )) return;

    setBusyUser(userId);
    const { error: rpcError } = await supabase.rpc('set_org_stewardship', {
      p_organization_id: organizationId,
      p_user_id: userId,
      p_verified: verified,
    });
    if (rpcError) {
      setError(captureError(rpcError, { where: 'setStewardship', detail: { organizationId, verified } }));
    } else {
      await load();
    }
    setBusyUser(null);
  }

  return (
    <div className="card-brutal">
      <div className="border-b-3 border-ink-950 dark:border-border px-6 py-4">
        <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
          <KeyRound size={14} /> Portal accounts
        </h3>
      </div>
      <div className="divide-y divide-ink-100 dark:divide-border">
        {loading ? (
          <div className="px-6 py-4 font-mono text-xs text-ink-400">Loading...</div>
        ) : error ? (
          <div className="px-6 py-4 font-mono text-2xs text-accent">{error}</div>
        ) : members.length === 0 ? (
          <div className="px-6 py-6 text-center text-sm text-ink-400">
            Not claimed — no portal user manages this organisation yet.
          </div>
        ) : (
          members.map((m) => {
            const isSteward = Boolean(m.verified_at);
            return (
              <div key={m.user_id} className="px-6 py-3">
                <div className="text-sm font-medium flex flex-wrap items-center gap-2">
                  {m.full_name || m.email}
                  <span className={m.member_role === 'owner' ? 'badge-verified text-2xs py-0' : 'badge-pending text-2xs py-0'}>
                    {m.member_role}
                  </span>
                  <span className={isSteward ? 'badge-verified text-2xs py-0' : 'badge-pending text-2xs py-0'}>
                    {isSteward ? 'steward' : 'claimed only'}
                  </span>
                </div>
                <div className="font-mono text-2xs text-ink-400">{m.email}</div>
                <div className="font-mono text-2xs text-ink-400">
                  Joined {formatMembershipDate(m.joined_at)}
                  {isSteward && m.verified_by ? ` · verified by ${m.verified_by}` : ''}
                </div>

                <div className="mt-2">
                  {isSteward ? (
                    <button
                      type="button"
                      disabled={busyUser === m.user_id}
                      onClick={() => setStewardship(m.user_id, false)}
                      className="btn-brutal-outline text-2xs min-h-[36px] inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {busyUser === m.user_id ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}
                      Revoke stewardship
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyUser === m.user_id}
                      onClick={() => setStewardship(m.user_id, true)}
                      className="btn-brutal-teal text-2xs min-h-[36px] inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {busyUser === m.user_id ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                      Confirm they manage this charity
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="border-t-2 border-ink-100 dark:border-border px-6 py-3 font-mono text-2xs text-ink-500 dark:text-muted-foreground">
        Anyone may claim an organisation to receive monitoring. Only a steward can
        edit the public listing or apply for a badge.
      </p>
    </div>
  );
}
