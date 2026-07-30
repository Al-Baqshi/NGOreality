import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatMembershipDate } from '../../lib/membership';

type PortalMember = {
  user_id: string;
  email: string;
  full_name: string;
  member_role: string;
  joined_at: string;
};

/** Which portal user accounts manage this organisation (owner / admin). */
export default function OrganizationPortalMembers({ organizationId }: { organizationId: string }) {
  const [members, setMembers] = useState<PortalMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc('get_organization_portal_members', { p_organization_id: organizationId })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) setError(rpcError.message);
        else setMembers((data ?? []) as PortalMember[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return (
    <div className="card-brutal">
      <div className="border-b-3 border-ink-950 px-6 py-4">
        <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
          <KeyRound size={14} /> Portal accounts
        </h3>
      </div>
      <div className="divide-y divide-ink-100">
        {loading ? (
          <div className="px-6 py-4 font-mono text-xs text-ink-400">Loading...</div>
        ) : error ? (
          <div className="px-6 py-4 font-mono text-2xs text-accent">{error}</div>
        ) : members.length === 0 ? (
          <div className="px-6 py-6 text-center text-sm text-ink-400">
            Not claimed — no portal user manages this organisation yet.
          </div>
        ) : (
          members.map((m) => (
            <div key={m.user_id} className="px-6 py-3">
              <div className="text-sm font-medium flex items-center gap-2">
                {m.full_name || m.email}
                <span className={m.member_role === 'owner' ? 'badge-verified text-2xs py-0' : 'badge-failed text-2xs py-0'}>
                  {m.member_role}
                </span>
              </div>
              <div className="font-mono text-2xs text-ink-400">{m.email}</div>
              <div className="font-mono text-2xs text-ink-400">Joined {formatMembershipDate(m.joined_at)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
