import { useEffect, useState } from 'react';
import { CheckCircle, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { submitNgoSetupRequest, setupRequestSummary } from '../../lib/ngoSetupRequests';
import { LANDING_STANDARDS_PACKAGE_CENTS, LANDING_STANDARDS_PACKAGE_LABEL } from '../../config/customerProducts';
import type { NgoSetupRequest, Organization } from '../../types';

type NgoSetupRequestPanelProps = {
  organization: Organization;
  setupRequests: NgoSetupRequest[];
  onUpdated: () => void;
};

export default function NgoSetupRequestPanel({
  organization,
  setupRequests,
  onUpdated,
}: NgoSetupRequestPanelProps) {
  const { user } = useAuth();
  const initialHasWebsite = Boolean(organization.website_url?.trim());

  const [hasWebsite, setHasWebsite] = useState(initialHasWebsite);
  const [wantsLanding, setWantsLanding] = useState(!initialHasWebsite);
  const [logoUrl, setLogoUrl] = useState(organization.logo_url ?? '');
  const [brandPrimary, setBrandPrimary] = useState(organization.brand_primary ?? '');
  const [brandSecondary, setBrandSecondary] = useState(organization.brand_secondary ?? '');
  const [setupNotes, setSetupNotes] = useState('');
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [setupMessage, setSetupMessage] = useState('');
  const [setupError, setSetupError] = useState('');

  useEffect(() => {
    setHasWebsite(Boolean(organization.website_url?.trim()));
    setLogoUrl(organization.logo_url ?? '');
    setBrandPrimary(organization.brand_primary ?? '');
    setBrandSecondary(organization.brand_secondary ?? '');
  }, [organization.id, organization.updated_at]);

  const pendingSetup = setupRequests.find((r) => r.status === 'pending' || r.status === 'in_review');
  const needsLogo = !logoUrl.trim() && !hasWebsite;

  const submitSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (needsLogo) {
      setSetupError('Please add a logo URL (here or on your Profile page).');
      return;
    }
    setSetupSubmitting(true);
    setSetupError('');
    setSetupMessage('');

    const { error } = await submitNgoSetupRequest({
      organizationId: organization.id,
      userId: user.id,
      hasExistingWebsite: hasWebsite,
      wantsLandingPackage: hasWebsite ? false : wantsLanding,
      logoUrl,
      brandPrimary,
      brandSecondary,
      notes: setupNotes,
      questionnaire: {
        has_existing_website: hasWebsite,
        wants_landing_package: hasWebsite ? false : wantsLanding,
      },
    });

    setSetupSubmitting(false);
    if (error) {
      setSetupError(error);
      return;
    }
    setSetupMessage('Setup request sent. Our team will follow up by email.');
    setSetupNotes('');
    onUpdated();
  };

  return (
    <div className="card-brutal border-l-4 border-l-accent p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-accent" aria-hidden />
        <h2 className="text-lg font-black uppercase tracking-tight">Request setup</h2>
      </div>

      <p className="text-xs text-ink-500 leading-relaxed">
        Tell us whether you have a website or need our trust landing package. Logo is required unless you already have a
        site — add it below or on{' '}
        <Link to="/ngo/profile" className="font-semibold underline text-ink-950 dark:text-foreground">
          Profile
        </Link>
        .
      </p>

      {pendingSetup ? (
        <p className="text-sm text-ink-600 dark:text-muted-foreground">
          You already have a setup request in progress ({pendingSetup.status.replace('_', ' ')}). Our team will contact
          you at {organization.email || 'your contact email'}.
        </p>
      ) : (
        <form onSubmit={submitSetup} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="label-brutal">Do you already have a working website?</legend>
            <label className="flex items-center gap-2 text-sm min-h-[44px]">
              <input
                type="radio"
                name="has-website"
                checked={hasWebsite}
                onChange={() => {
                  setHasWebsite(true);
                  setWantsLanding(false);
                }}
              />
              Yes — use our existing site
            </label>
            <label className="flex items-center gap-2 text-sm min-h-[44px]">
              <input
                type="radio"
                name="has-website"
                checked={!hasWebsite}
                onChange={() => {
                  setHasWebsite(false);
                  setWantsLanding(true);
                }}
              />
              No — we need a trust landing page
            </label>
          </fieldset>

          {!hasWebsite && (
            <label className="flex items-start gap-2 text-sm border-2 border-ink-200 p-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={wantsLanding}
                onChange={(e) => setWantsLanding(e.target.checked)}
              />
              <span>
                <span className="font-semibold block">{LANDING_STANDARDS_PACKAGE_LABEL}</span>
                <span className="text-xs text-ink-500">
                  ${LANDING_STANDARDS_PACKAGE_CENTS / 100} NZD · includes education, checklist, and badge-ready landing
                  page
                </span>
              </span>
            </label>
          )}

          <p className="text-xs font-mono text-ink-500 border-l-2 border-teal pl-3">
            {setupRequestSummary({ hasExistingWebsite: hasWebsite, wantsLandingPackage: wantsLanding })}
          </p>

          <div>
            <label className="label-brutal" htmlFor="setup-logo">Logo URL</label>
            <input
              id="setup-logo"
              type="url"
              className="input-brutal w-full text-base"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.png"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-brutal" htmlFor="setup-brand-primary">Brand colour (optional)</label>
              <input
                id="setup-brand-primary"
                type="text"
                className="input-brutal w-full text-base"
                value={brandPrimary}
                onChange={(e) => setBrandPrimary(e.target.value)}
              />
            </div>
            <div>
              <label className="label-brutal" htmlFor="setup-brand-secondary">Secondary colour (optional)</label>
              <input
                id="setup-brand-secondary"
                type="text"
                className="input-brutal w-full text-base"
                value={brandSecondary}
                onChange={(e) => setBrandSecondary(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label-brutal" htmlFor="setup-notes">Notes for our team (optional)</label>
            <textarea
              id="setup-notes"
              className="input-brutal w-full min-h-[80px] text-base"
              value={setupNotes}
              onChange={(e) => setSetupNotes(e.target.value)}
              placeholder="Anything else we should know before we start…"
            />
          </div>

          {setupError && <p className="text-accent text-xs font-mono" role="alert">{setupError}</p>}
          {setupMessage && (
            <p className="text-teal text-xs font-mono flex items-center gap-1">
              <CheckCircle size={14} /> {setupMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={setupSubmitting}
            className="btn-brutal-accent w-full sm:w-auto min-h-[48px] px-8 disabled:opacity-60"
          >
            {setupSubmitting ? 'Sending…' : 'Submit setup request'}
          </button>
        </form>
      )}

      {setupRequests.length > 0 && (
        <ul className="space-y-2 border-t border-ink-100 pt-4">
          <li className="label-brutal text-ink-400">Previous requests</li>
          {setupRequests.map((req) => (
            <li key={req.id} className="text-xs font-mono text-ink-500">
              {new Date(req.created_at).toLocaleDateString()} · {req.request_kind.replace('_', ' ')} · {req.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
