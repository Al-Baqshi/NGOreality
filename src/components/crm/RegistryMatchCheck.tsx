import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { findRegistryMatches, type RegistryMatch } from '../../lib/registryMatch';

/**
 * For a self-submitted org: search the imported registry for similar names so
 * staff can catch "they registered as new but are already on the register"
 * before issuing anything. People genuinely forget their charity is listed.
 */
export default function RegistryMatchCheck({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [matches, setMatches] = useState<RegistryMatch[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    findRegistryMatches(organizationName, organizationId).then((rows) => {
      if (!cancelled) setMatches(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, organizationName]);

  if (matches === null) {
    return (
      <p className="font-mono text-2xs text-ink-400 uppercase tracking-wider">
        Checking NZ Charities Register for similar names…
      </p>
    );
  }

  if (matches.length === 0) {
    return (
      <p className="text-xs text-ink-500 flex items-center gap-1.5">
        <CheckCircle2 size={14} className="text-teal shrink-0" />
        No similar names found in the imported NZ Charities Register — this looks genuinely new.
      </p>
    );
  }

  return (
    <div className="border-2 border-amber-400 bg-amber-50 p-3 dark:border-amber-600 dark:bg-amber-950/40">
      <p className="text-xs font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-1.5">
        <AlertTriangle size={14} className="shrink-0" />
        Possible registry duplicate — they may already be listed. Compare before verifying:
      </p>
      <ul className="mt-2 space-y-1.5">
        {matches.map((m) => (
          <li key={m.id} className="text-xs flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link to={`/organizations/${m.id}`} className="font-semibold underline text-ink-950 dark:text-amber-50">
              {m.name}
            </Link>
            {m.charity_registration_number && (
              <span className="font-mono text-2xs text-ink-500 dark:text-amber-200">
                {m.charity_registration_number}
              </span>
            )}
            {m.location && <span className="text-ink-500 dark:text-amber-200">{m.location}</span>}
            {m.registry_url && (
              <a
                href={m.registry_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-teal underline"
              >
                Register <ExternalLink size={10} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
