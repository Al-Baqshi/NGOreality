import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Check, Copy, Download } from 'lucide-react';
import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import { formatMembershipDate } from '../../../lib/membership';
import NgoPortalPageShell from '../../../components/ngo/NgoPortalPageShell';

function badgeEmbedSnippet(organizationName: string): string {
  const origin = window.location.origin;
  return [
    `<a href="${origin}/public/verified" target="_blank" rel="noopener">`,
    `  <img src="${origin}/reality-badge.png"`,
    `       alt="${organizationName} is verified by NGOreality — Reality Badge"`,
    `       width="120" height="120" loading="lazy" />`,
    `</a>`,
  ].join('\n');
}

export default function NgoBadgePage() {
  const { badges, organization } = useNgoPortalContext();
  const activeBadge = badges.find((b) => b.is_active);
  const [copied, setCopied] = useState(false);

  const embedCode = organization ? badgeEmbedSnippet(organization.name) : '';

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the user can select the text manually.
    }
  };

  return (
    <NgoPortalPageShell title="Reality Badge" path="/ngo/badge">
      <div className="space-y-6">
        <div className="card-brutal p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Award size={18} className="text-teal" aria-hidden />
            <h2 className="text-lg font-black uppercase tracking-tight">Your badge</h2>
          </div>
          {activeBadge ? (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <img
                src="/reality-badge.png"
                alt="NGOreality Reality Badge"
                className="h-28 w-28 shrink-0 object-contain"
              />
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="label-brutal text-ink-400 inline">Badge ID</dt>
                  <dd className="font-mono font-semibold ml-2 inline">{activeBadge.verification_id}</dd>
                </div>
                <div>
                  <dt className="label-brutal text-ink-400">Issued</dt>
                  <dd className="font-semibold">{formatMembershipDate(activeBadge.issued_at)}</dd>
                </div>
                {activeBadge.expires_at && (
                  <div>
                    <dt className="label-brutal text-ink-400">Badge expires</dt>
                    <dd className="font-semibold">{formatMembershipDate(activeBadge.expires_at)}</dd>
                  </div>
                )}
              </dl>
            </div>
          ) : (
            <p className="text-sm text-ink-500">
              No active Reality Badge yet. Complete{' '}
              <Link to="/ngo/standards" className="font-semibold underline">
                trust standards
              </Link>{' '}
              and{' '}
              <Link to="/ngo/membership" className="font-semibold underline">
                membership
              </Link>
              , then submit a request from{' '}
              <Link to="/ngo/requests" className="font-semibold underline">
                Requests
              </Link>
              .
            </p>
          )}
        </div>

        {activeBadge && (
          <div className="card-brutal p-5 sm:p-6">
            <h2 className="text-lg font-black uppercase tracking-tight mb-2">Show it on your website</h2>
            <p className="text-sm text-ink-600 dark:text-muted-foreground mb-4">
              Download the badge asset for print or social media, or paste the snippet below into your
              website to link back to the NGOreality verified directory.
            </p>
            <a
              href="/reality-badge.png"
              download="ngoreality-reality-badge.png"
              className="btn-brutal-teal inline-flex items-center gap-2 px-4 py-2 text-xs mb-5"
            >
              <Download size={14} /> Download badge (PNG)
            </a>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="label-brutal">Embed code</span>
                <button
                  type="button"
                  onClick={() => void copyEmbed()}
                  className="btn-brutal-outline inline-flex items-center gap-1.5 px-3 py-1.5 text-2xs"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="overflow-x-auto border-2 border-ink-950 bg-ink-50 p-3 font-mono text-2xs leading-relaxed dark:bg-muted">
                {embedCode}
              </pre>
            </div>
          </div>
        )}
      </div>
    </NgoPortalPageShell>
  );
}
