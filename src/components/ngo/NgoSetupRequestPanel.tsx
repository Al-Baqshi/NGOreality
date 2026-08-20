import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, History, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { submitNgoSetupRequest, setupRequestSummary } from '../../lib/ngoSetupRequests';
import { LANDING_STANDARDS_PACKAGE_CENTS, LANDING_STANDARDS_PACKAGE_LABEL } from '../../config/customerProducts';
import type { NgoSetupRequest, Organization } from '../../types';
import { cn } from '@/lib/utils';

type NgoSetupRequestPanelProps = {
  organization: Organization;
  setupRequests: NgoSetupRequest[];
  onUpdated: () => void;
};

type FieldKey = 'logoUrl' | 'brandPrimary' | 'brandSecondary' | 'wantsLanding' | 'setupNotes';
type FieldErrors = Partial<Record<FieldKey, string>>;

const NOTES_MAX = 1000;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      className="mt-1.5 flex items-start gap-1.5 border-2 border-accent bg-accent-light px-2.5 py-1.5 text-xs leading-snug text-accent"
      role="alert"
    >
      <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

function inputClass(hasError: boolean, extra = '') {
  return cn('input-brutal w-full text-base', hasError && 'border-accent ring-2 ring-accent/30', extra);
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidHttpUrl(raw: string): boolean {
  if (!raw.trim()) return false;
  try {
    const parsed = new URL(normalizeUrl(raw));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname;
    if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) return false;
    const tld = host.split('.').pop() ?? '';
    return tld.length >= 2 && /^[a-z0-9-]+$/i.test(tld);
  } catch {
    return false;
  }
}

function isValidHexColour(raw: string): boolean {
  if (!raw.trim()) return true;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.trim());
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'border-ink-300 bg-ink-50 text-ink-700',
  in_review: 'border-gold/60 bg-gold-light text-ink-900',
  approved: 'border-teal/50 bg-teal/10 text-teal',
  completed: 'border-teal bg-teal-light text-teal',
  cancelled: 'border-ink-200 bg-ink-50 text-ink-500',
};

export default function NgoSetupRequestPanel({
  organization,
  setupRequests,
  onUpdated,
}: NgoSetupRequestPanelProps) {
  const { user, isAuthenticated } = useAuth();
  const confirm = useConfirm();
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    setHasWebsite(Boolean(organization.website_url?.trim()));
    setLogoUrl(organization.logo_url ?? '');
    setBrandPrimary(organization.brand_primary ?? '');
    setBrandSecondary(organization.brand_secondary ?? '');
    setFieldErrors({});
  }, [organization.id, organization.updated_at]);

  const pendingSetup = setupRequests.find((r) => r.status === 'pending' || r.status === 'in_review');
  const logoRequired = !hasWebsite;

  const clearFieldError = (key: FieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validateForm = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (logoRequired && !logoUrl.trim()) {
      errors.logoUrl = 'Logo URL is required when you do not have a website yet.';
    } else if (logoUrl.trim() && !isValidHttpUrl(logoUrl)) {
      errors.logoUrl = 'Enter a valid logo URL (e.g. https://example.org/logo.png).';
    }

    if (brandPrimary.trim() && !isValidHexColour(brandPrimary)) {
      errors.brandPrimary = 'Use a hex colour like #041C3C or #EBB.';
    }
    if (brandSecondary.trim() && !isValidHexColour(brandSecondary)) {
      errors.brandSecondary = 'Use a hex colour like #EBBB57 or #FFF.';
    }

    if (!hasWebsite && !wantsLanding) {
      errors.wantsLanding =
        'Select the trust landing package, or choose “Yes — use our existing site” above.';
    }

    if (setupNotes.trim().length > NOTES_MAX) {
      errors.setupNotes = `Notes must be ${NOTES_MAX} characters or fewer.`;
    }

    return errors;
  };

  const submitSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !user) {
      setSetupError('Please sign in again to submit a setup request.');
      return;
    }

    const errors = validateForm();
    setFieldErrors(errors);
    setSetupError('');
    setSetupMessage('');

    if (Object.keys(errors).length > 0) {
      window.setTimeout(() => {
        document
          .getElementById('setup-validation-summary')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }

    const wantsPackage = hasWebsite ? false : wantsLanding;
    const summary = setupRequestSummary({
      hasExistingWebsite: hasWebsite,
      wantsLandingPackage: wantsPackage,
    });
    const ok = await confirm({
      title: 'Send setup request?',
      description: [
        summary,
        wantsPackage
          ? `This queues the $${LANDING_STANDARDS_PACKAGE_CENTS / 100} trust landing package for our team.`
          : null,
        logoUrl.trim() ? `Logo: ${normalizeUrl(logoUrl)}` : null,
        'Our team will follow up by email after you confirm.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      confirmLabel: 'Send request',
      cancelLabel: 'Go back',
    });
    if (!ok) return;

    setSetupSubmitting(true);

    const { error } = await submitNgoSetupRequest({
      organizationId: organization.id,
      userId: user.id,
      hasExistingWebsite: hasWebsite,
      wantsLandingPackage: wantsPackage,
      logoUrl: logoUrl.trim() ? normalizeUrl(logoUrl) : '',
      brandPrimary,
      brandSecondary,
      notes: setupNotes,
      questionnaire: {
        has_existing_website: hasWebsite,
        wants_landing_package: wantsPackage,
      },
    });

    setSetupSubmitting(false);
    if (error) {
      setSetupError(error);
      return;
    }
    setSetupMessage('Setup request sent. Our team will follow up by email.');
    setSetupNotes('');
    setFieldErrors({});
    onUpdated();
  };

  const errorCount = Object.keys(fieldErrors).length;

  return (
    <div className="space-y-6">
      <div className="card-brutal space-y-4 border-l-4 border-l-accent p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" aria-hidden />
          <h2 className="text-lg font-black uppercase tracking-tight">New setup request</h2>
        </div>

        <p className="text-xs leading-relaxed text-ink-500">
          Tell us whether you have a website or need our trust landing package.
          {logoRequired ? (
            <>
              {' '}
              A logo URL is required — add it below or on{' '}
              <Link
                to="/ngo/profile"
                className="font-semibold text-ink-950 underline dark:text-foreground"
              >
                Profile
              </Link>
              .
            </>
          ) : (
            <>
              {' '}
              You can still add a logo and brand colours for your public profile.
            </>
          )}
        </p>

        {pendingSetup ? (
          <div className="border-2 border-gold/50 bg-gold-light/40 px-3 py-3 text-sm text-ink-800">
            You already have a setup request in progress (
            <span className="font-semibold">{pendingSetup.status.replace('_', ' ')}</span>
            ). Our team will contact you at {organization.email || 'your contact email'}.
          </div>
        ) : (
          <form onSubmit={submitSetup} className="space-y-4" noValidate>
            {errorCount > 0 ? (
              <div
                id="setup-validation-summary"
                className="border-2 border-accent bg-accent-light px-3 py-3 text-sm text-accent"
                role="alert"
                tabIndex={-1}
              >
                <p className="flex items-center gap-2 font-semibold">
                  <AlertCircle size={16} aria-hidden />
                  Fix {errorCount} {errorCount === 1 ? 'field' : 'fields'} before submitting
                </p>
                <ul className="mt-2 list-inside list-disc space-y-0.5 font-mono text-2xs">
                  {Object.entries(fieldErrors).map(([key, msg]) => (
                    <li key={key}>{msg}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <fieldset className="space-y-2">
              <legend className="label-brutal">
                Do you already have a working website? <span className="text-accent">*</span>
              </legend>
              <label className="flex min-h-[44px] items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="has-website"
                  checked={hasWebsite}
                  onChange={() => {
                    setHasWebsite(true);
                    setWantsLanding(false);
                    clearFieldError('wantsLanding');
                    clearFieldError('logoUrl');
                  }}
                />
                Yes — use our existing site
              </label>
              <label className="flex min-h-[44px] items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="has-website"
                  checked={!hasWebsite}
                  onChange={() => {
                    setHasWebsite(false);
                    setWantsLanding(true);
                    clearFieldError('wantsLanding');
                  }}
                />
                No — we need a trust landing page
              </label>
            </fieldset>

            {!hasWebsite && (
              <div>
                <label
                  className={cn(
                    'flex items-start gap-2 border-2 p-3 text-sm',
                    fieldErrors.wantsLanding ? 'border-accent bg-accent-light/40' : 'border-ink-200',
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={wantsLanding}
                    onChange={(e) => {
                      setWantsLanding(e.target.checked);
                      clearFieldError('wantsLanding');
                    }}
                  />
                  <span>
                    <span className="block font-semibold">
                      {LANDING_STANDARDS_PACKAGE_LABEL}{' '}
                      <span className="text-accent">*</span>
                    </span>
                    <span className="text-xs text-ink-500">
                      ${LANDING_STANDARDS_PACKAGE_CENTS / 100} NZD · includes education, checklist,
                      and badge-ready landing page
                    </span>
                  </span>
                </label>
                <FieldError id="err-landing" message={fieldErrors.wantsLanding} />
              </div>
            )}

            <p className="border-l-2 border-teal pl-3 font-mono text-xs text-ink-500">
              {setupRequestSummary({
                hasExistingWebsite: hasWebsite,
                wantsLandingPackage: wantsLanding,
              })}
            </p>

            <div>
              <label className="label-brutal" htmlFor="setup-logo">
                Logo URL{' '}
                {logoRequired ? (
                  <span className="text-accent">*</span>
                ) : (
                  <span className="font-normal normal-case tracking-normal text-ink-400">
                    (optional)
                  </span>
                )}
              </label>
              <input
                id="setup-logo"
                type="url"
                inputMode="url"
                className={inputClass(Boolean(fieldErrors.logoUrl))}
                value={logoUrl}
                onChange={(e) => {
                  setLogoUrl(e.target.value);
                  clearFieldError('logoUrl');
                  setSetupError('');
                }}
                placeholder="https://example.org/logo.png"
                aria-invalid={Boolean(fieldErrors.logoUrl)}
                aria-describedby={fieldErrors.logoUrl ? 'err-logo' : undefined}
              />
              <FieldError id="err-logo" message={fieldErrors.logoUrl} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label-brutal" htmlFor="setup-brand-primary">
                  Brand colour{' '}
                  <span className="font-normal normal-case tracking-normal text-ink-400">
                    (optional)
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="setup-brand-primary"
                    type="text"
                    className={inputClass(Boolean(fieldErrors.brandPrimary), 'flex-1')}
                    value={brandPrimary}
                    onChange={(e) => {
                      setBrandPrimary(e.target.value);
                      clearFieldError('brandPrimary');
                    }}
                    placeholder="#041C3C"
                    aria-invalid={Boolean(fieldErrors.brandPrimary)}
                    aria-describedby={fieldErrors.brandPrimary ? 'err-brand-primary' : undefined}
                  />
                  {isValidHexColour(brandPrimary) && brandPrimary.trim() ? (
                    <span
                      className="size-12 shrink-0 border-3 border-ink-950"
                      style={{ backgroundColor: brandPrimary.trim() }}
                      aria-hidden
                    />
                  ) : null}
                </div>
                <FieldError id="err-brand-primary" message={fieldErrors.brandPrimary} />
              </div>
              <div>
                <label className="label-brutal" htmlFor="setup-brand-secondary">
                  Secondary colour{' '}
                  <span className="font-normal normal-case tracking-normal text-ink-400">
                    (optional)
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="setup-brand-secondary"
                    type="text"
                    className={inputClass(Boolean(fieldErrors.brandSecondary), 'flex-1')}
                    value={brandSecondary}
                    onChange={(e) => {
                      setBrandSecondary(e.target.value);
                      clearFieldError('brandSecondary');
                    }}
                    placeholder="#EBBB57"
                    aria-invalid={Boolean(fieldErrors.brandSecondary)}
                    aria-describedby={
                      fieldErrors.brandSecondary ? 'err-brand-secondary' : undefined
                    }
                  />
                  {isValidHexColour(brandSecondary) && brandSecondary.trim() ? (
                    <span
                      className="size-12 shrink-0 border-3 border-ink-950"
                      style={{ backgroundColor: brandSecondary.trim() }}
                      aria-hidden
                    />
                  ) : null}
                </div>
                <FieldError id="err-brand-secondary" message={fieldErrors.brandSecondary} />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-end justify-between gap-2">
                <label className="label-brutal mb-0" htmlFor="setup-notes">
                  Notes for our team{' '}
                  <span className="font-normal normal-case tracking-normal text-ink-400">
                    (optional)
                  </span>
                </label>
                <span className="font-mono text-2xs tabular-nums text-ink-400">
                  {setupNotes.trim().length}/{NOTES_MAX}
                </span>
              </div>
              <textarea
                id="setup-notes"
                className={inputClass(Boolean(fieldErrors.setupNotes), 'min-h-[80px]')}
                value={setupNotes}
                onChange={(e) => {
                  setSetupNotes(e.target.value);
                  clearFieldError('setupNotes');
                }}
                placeholder="Anything else we should know before we start…"
                maxLength={NOTES_MAX + 50}
                aria-invalid={Boolean(fieldErrors.setupNotes)}
                aria-describedby={fieldErrors.setupNotes ? 'err-notes' : undefined}
              />
              <FieldError id="err-notes" message={fieldErrors.setupNotes} />
            </div>

            {setupError ? (
              <div
                className="flex items-start gap-2 border-2 border-accent bg-accent-light px-3 py-2 text-sm text-accent"
                role="alert"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
                <span>{setupError}</span>
              </div>
            ) : null}

            {setupMessage ? (
              <p
                className="flex items-center gap-2 border-2 border-teal/40 bg-teal/5 px-3 py-2 text-sm text-teal"
                role="status"
              >
                <CheckCircle size={16} aria-hidden />
                {setupMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={setupSubmitting}
              className="btn-brutal-accent min-h-[48px] w-full px-8 disabled:opacity-60 sm:w-auto"
            >
              {setupSubmitting ? 'Sending…' : 'Submit setup request'}
            </button>
          </form>
        )}
      </div>

      <div className="card-brutal space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <History size={18} className="text-ink-500" aria-hidden />
          <h2 className="text-lg font-black uppercase tracking-tight">Previous requests</h2>
        </div>

        {setupRequests.length === 0 ? (
          <p className="text-sm text-ink-500">
            No setup requests yet. Submit one above when you are ready.
          </p>
        ) : (
          <ul className="divide-y-2 divide-ink-100 border-2 border-ink-100 dark:divide-border dark:border-border">
            {setupRequests.map((req) => (
              <li
                key={req.id}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold capitalize text-ink-950 dark:text-foreground">
                    {req.request_kind.replace(/_/g, ' ')}
                  </p>
                  <p className="font-mono text-2xs text-ink-500">
                    Submitted {new Date(req.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={cn(
                    'inline-flex w-fit shrink-0 border-2 px-2.5 py-1 font-mono text-2xs font-semibold uppercase tracking-wider',
                    STATUS_STYLES[req.status] ?? STATUS_STYLES.pending,
                  )}
                >
                  {req.status.replace(/_/g, ' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
