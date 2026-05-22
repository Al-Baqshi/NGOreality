import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import {
  allPublicCriteriaPass,
  isMemberCriterion,
  isPublicCriterion,
  publicCriteriaScore,
} from '../../../lib/criteria';
import NgoPortalPageShell from '../../../components/ngo/NgoPortalPageShell';

export default function NgoStandardsPage() {
  const { criteria } = useNgoPortalContext();
  const publicCriteria = criteria.filter(isPublicCriterion);
  const memberCriteria = criteria.filter(isMemberCriterion);
  const publicReady = allPublicCriteriaPass(criteria);
  const publicPct = publicCriteriaScore(criteria);

  return (
    <NgoPortalPageShell title="Trust standards" path="/ngo/standards">
      <div className="card-brutal p-5 sm:p-6 space-y-6">
        <section>
          <h2 className="text-lg font-black uppercase tracking-tight mb-2">Public trust standards</h2>
          {publicCriteria.length === 0 ? (
            <p className="text-sm text-ink-500">
              Your trust checklist is being set up. Our team will add criteria soon — check back after onboarding.
            </p>
          ) : (
            <>
              <p className="text-xs text-ink-500 mb-4">
                These are reviewed before your Reality Badge is issued. Our team uses the same checklist in outreach.
              </p>
              <p className="font-mono text-2xs uppercase mb-4">
                Progress: {publicPct}% · {publicReady ? 'Ready for badge on payment' : 'In progress'}
              </p>
              <ul className="space-y-2">
                {publicCriteria.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm border-b border-ink-100 pb-2">
                    <span>{c.criterion_label}</span>
                    <span
                      className={`font-mono text-2xs uppercase px-2 py-0.5 border ${
                        c.status === 'pass'
                          ? 'border-teal text-teal'
                          : c.status === 'fail'
                            ? 'border-accent text-accent'
                            : 'border-ink-200 text-ink-400'
                      }`}
                    >
                      {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {memberCriteria.length > 0 && (
          <section className="border-t border-ink-100 pt-6">
            <h2 className="text-lg font-black uppercase tracking-tight mb-2">Member security checklist</h2>
            <p className="text-xs text-ink-500 mb-4">
              For your organisation only (not shown publicly): repository ownership, security baseline, and related
              items.
            </p>
            <ul className="space-y-2">
              {memberCriteria.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm border-b border-ink-100 pb-2">
                  <span>{c.criterion_label}</span>
                  <span className="font-mono text-2xs uppercase text-ink-400">{c.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </NgoPortalPageShell>
  );
}
