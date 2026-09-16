import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, History, Layout, Wrench } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { submitNgoSetupRequest } from '../../lib/ngoSetupRequests';
import { LANDING_STANDARDS_PACKAGE_CENTS, LANDING_STANDARDS_PACKAGE_LABEL } from '../../config/customerProducts';
import type { NgoSetupRequest, Organization } from '../../types';
import { cn } from '@/lib/utils';
import { formatNzDateTime } from '@/lib/formatDate';
import LogoUploadField from './LogoUploadField';
import NgoSetupReadinessGuide, { SETUP_READINESS_ITEMS, type ReadinessKey } from './NgoSetupReadinessGuide';

type NgoSetupRequestPanelProps = {
  organization: Organization;
  setupRequests: NgoSetupRequest[];
  loadError?: string | null;
  onUpdated: () => void;
};

type RequestType = 'landing_page' | 'custom_work';
type DomainStatus = 'own' | 'need' | 'unsure';

type FieldKey =
  | 'logoUrl'
  | 'brandPrimary'
  | 'brandSecondary'
  | 'currentWebsite'
  | 'pageEmail'
  | 'domainName'
  | 'setupNotes';
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
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.trim());
}

/** <input type="color"> only accepts #rrggbb. */
function toSixDigitHex(raw: string): string {
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return '#000000';
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'border-ink-300 bg-ink-50 text-ink-700',
  in_review: 'border-gold/60 bg-gold-light text-ink-900',
  approved: 'border-teal/50 bg-teal/10 text-teal',
  completed: 'border-teal bg-teal-light text-teal',
  cancelled: 'border-ink-200 bg-ink-50 text-ink-500',
};

const REQUEST_KIND_LABELS: Record<string, string> = {
  landing_standards: 'Trust landing page',
  brand_assets: 'Brand assets',
  general: 'Custom setup / work',
};

function SectionTitle({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-ink-700 dark:text-muted-foreground">
      <span className="flex size-6 items-center justify-center border-2 border-ink-950 text-2xs dark:border-border">
        {step}
      </span>
      {children}
    </h3>
  );
}

function ColourField({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  required: boolean;
}) {
  return (
    <div>
      <label className="label-brutal" htmlFor={id}>
        {label} {required ? <span className="text-accent">*</span> : null}
      </label>
      <div className="flex gap-2">
        <input
          type="color"
          className="h-12 w-14 shrink-0 cursor-pointer border-2 border-ink-950 bg-transparent p-1 dark:border-border"
          value={toSixDigitHex(value)}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={`${label} picker`}
        />
        <input
          id={id}
          type="text"
          className={inputClass(Boolean(error), 'flex-1 font-mono uppercase')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `err-${id}` : undefined}
        />
      </div>
      <FieldError id={`err-${id}`} message={error} />
    </div>
  );
}

export default function NgoSetupRequestPanel({
  organization,
  setupRequests,
  loadError,
  onUpdated,
}: NgoSetupRequestPanelProps) {
  const { user, isAuthenticated } = useAuth();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();

  const [requestType, setRequestType] = useState<RequestType>(
    searchParams.get('type') === 'custom' ? 'custom_work' : 'landing_page',
  );
  const [currentWebsite, setCurrentWebsite] = useState(organization.website_url ?? '');
  const [logoUrl, setLogoUrl] = useState(organization.logo_url ?? '');
  const [brandPrimary, setBrandPrimary] = useState(organization.brand_primary ?? '');
  const [brandSecondary, setBrandSecondary] = useState(organization.brand_secondary ?? '');
  const [pageEmail, setPageEmail] = useState(organization.email ?? '');
  const [pagePhone, setPagePhone] = useState(organization.phone ?? '');
  const [pageAddress, setPageAddress] = useState(organization.location ?? '');
  const [domainStatus, setDomainStatus] = useState<DomainStatus>(
    organization.website_url?.trim() ? 'own' : 'unsure',
  );
  const [domainName, setDomainName] = useState('');
  const [ready, setReady] = useState<Set<ReadinessKey>>(new Set());
  const [setupNotes, setSetupNotes] = useState('');
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [setupMessage, setSetupMessage] = useState('');
  const [setupError, setSetupError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    setCurrentWebsite(organization.website_url ?? '');
    setLogoUrl(organization.logo_url ?? '');
    setBrandPrimary(organization.brand_primary ?? '');
    setBrandSecondary(organization.brand_secondary ?? '');
    setPageEmail(organization.email ?? '');
    setPagePhone(organization.phone ?? '');
    setPageAddress(organization.location ?? '');
    setFieldErrors({});
  }, [organization.id, organization.updated_at]);

  useEffect(() => {
    if (searchParams.get('type') === 'custom') setRequestType('custom_work');
  }, [searchParams]);

  const pendingSetup = setupRequests.find((r) => r.status === 'pending' || r.status === 'in_review');
  const isLanding = requestType === 'landing_page';

  const clearFieldError = (key: FieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSetupError('');
  };

  const validateForm = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (currentWebsite.trim() && !isValidHttpUrl(currentWebsite)) {
      errors.currentWebsite = 'Enter a valid website (e.g. https://example.org), or leave it blank.';
    }

    if (isLanding) {
      if (!logoUrl.trim()) {
        errors.logoUrl = 'Upload your logo so we can put it on the page.';
      } else if (!isValidHttpUrl(logoUrl)) {
        errors.logoUrl = 'The logo link is not valid. Upload the file instead.';
      }
      if (!isValidHexColour(brandPrimary)) {
        errors.brandPrimary = 'Pick a main colour (or type a hex code like #041C3C).';
      }
      if (!isValidHexColour(brandSecondary)) {
        errors.brandSecondary = 'Pick an accent colour (or type a hex code like #EBBB57).';
      }
      if (!pageEmail.trim()) {
        errors.pageEmail = 'Add the email people should use to contact you.';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(pageEmail.trim())) {
        errors.pageEmail = 'Enter a valid email address.';
      }
    } else {
      if (logoUrl.trim() && !isValidHttpUrl(logoUrl)) {
        errors.logoUrl = 'The logo link is not valid. Upload the file instead.';
      }
      if (brandPrimary.trim() && !isValidHexColour(brandPrimary)) {
        errors.brandPrimary = 'Use a hex colour like #041C3C.';
      }
      if (brandSecondary.trim() && !isValidHexColour(brandSecondary)) {
        errors.brandSecondary = 'Use a hex colour like #EBBB57.';
      }
      if (!setupNotes.trim()) {
        errors.setupNotes = 'Describe the work so we can quote it.';
      }
    }

    if (domainStatus === 'own' && domainName.trim() && !isValidHttpUrl(domainName)) {
      errors.domainName = 'Enter just the domain, e.g. yourorg.org.nz';
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

    if (loadError && !pendingSetup) {
      setSetupError(
        'Existing setup requests could not be loaded. Refresh before sending another so we do not duplicate one already in progress.',
      );
      return;
    }

    const readyLabels = SETUP_READINESS_ITEMS.filter((i) => ready.has(i.key)).map((i) => i.title);
    const missingLabels = SETUP_READINESS_ITEMS.filter((i) => !ready.has(i.key)).map((i) => i.title);

    const ok = await confirm({
      title: isLanding ? 'Request your trust landing page?' : 'Ask for a custom work quote?',
      description: [
        isLanding
          ? `${LANDING_STANDARDS_PACKAGE_LABEL} — $${LANDING_STANDARDS_PACKAGE_CENTS / 100} NZD one-off. Pay on Services & pay; we start once the transfer arrives.`
          : 'We will review your request and email a quote. No work starts until you accept it.',
        missingLabels.length
          ? `Not ready yet: ${missingLabels.join(', ')}. That is fine — we will help you set them up.`
          : 'You have every account ready. Nice.',
        'Our team will follow up by email.',
      ].join('\n\n'),
      confirmLabel: 'Send request',
      cancelLabel: 'Go back',
    });
    if (!ok) return;

    setSetupSubmitting(true);

    const website = currentWebsite.trim() ? normalizeUrl(currentWebsite) : '';
    const domainLine =
      domainStatus === 'own'
        ? `Domain: own${domainName.trim() ? ` (${domainName.trim()})` : ''}`
        : domainStatus === 'need'
          ? 'Domain: needs one'
          : 'Domain: not sure';

    // Staff see `notes` in their task, so lead with the NGO's words and follow with the facts.
    const notes = [
      setupNotes.trim(),
      [
        isLanding ? 'Type: trust landing page' : 'Type: custom work (quote)',
        website ? `Current site: ${website}` : 'Current site: none',
        domainLine,
        isLanding ? `Page contact: ${[pageEmail.trim(), pagePhone.trim(), pageAddress.trim()].filter(Boolean).join(' · ')}` : null,
        `Ready: ${readyLabels.length ? readyLabels.join(', ') : 'none yet'}`,
      ]
        .filter(Boolean)
        .join('\n'),
    ]
      .filter(Boolean)
      .join('\n\n');

    const { error } = await submitNgoSetupRequest({
      organizationId: organization.id,
      userId: user.id,
      hasExistingWebsite: Boolean(website),
      wantsLandingPackage: isLanding,
      requestKind: isLanding ? 'landing_standards' : 'general',
      logoUrl: logoUrl.trim() ? normalizeUrl(logoUrl) : '',
      brandPrimary,
      brandSecondary,
      notes,
      questionnaire: {
        has_existing_website: Boolean(website),
        wants_landing_package: isLanding,
        request_type: requestType,
        current_website: website,
        page_email: isLanding ? pageEmail.trim() : undefined,
        page_phone: isLanding ? pagePhone.trim() : undefined,
        page_address: isLanding ? pageAddress.trim() : undefined,
        domain_status: domainStatus,
        domain_name: domainName.trim() || undefined,
        ready: [...ready],
      },
    });

    setSetupSubmitting(false);
    if (error) {
      setSetupError(error);
      return;
    }
    setSetupMessage(
      isLanding
        ? 'Request sent. Next: pay for the package on Services & pay so we can start.'
        : 'Request sent. We will email you a quote.',
    );
    setSetupNotes('');
    setFieldErrors({});
    onUpdated();
  };

  const errorCount = Object.keys(fieldErrors).length;

  return (
    <div className="space-y-6">
      <div className="card-brutal space-y-6 border-l-4 border-l-accent p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-black uppercase tracking-tight">Request a website setup</h2>
          <p className="mt-1 text-sm text-ink-600 dark:text-muted-foreground">
            Tell us what you want built, how it should look, and which accounts you already have. We
            use your{' '}
            <Link to="/ngo/profile" className="font-semibold text-ink-950 underline dark:text-foreground">
              profile
            </Link>{' '}
            for your mission and description, so keep that current too.
          </p>
        </div>

        {setupMessage ? (
          <p
            className="flex items-center gap-2 border-2 border-teal/40 bg-teal/5 px-3 py-2 text-sm text-teal"
            role="status"
          >
            <CheckCircle size={16} aria-hidden />
            <span>
              {setupMessage}{' '}
              {isLanding ? (
                <Link to="/ngo/services" className="font-semibold underline">
                  Go to Services &amp; pay
                </Link>
              ) : null}
            </span>
          </p>
        ) : null}

        {pendingSetup ? (
          <div className="border-2 border-gold/50 bg-gold-light/40 px-3 py-3 text-sm text-ink-800">
            You already have a{' '}
            <span className="font-semibold">
              {(REQUEST_KIND_LABELS[pendingSetup.request_kind] ?? 'setup').toLowerCase()}
            </span>{' '}
            request in progress ({pendingSetup.status.replace('_', ' ')}). Our team will contact you at{' '}
            {organization.email || 'your contact email'}. Need to add something? Reply to our email.
          </div>
        ) : loadError ? (
          <div className="border-2 border-accent bg-accent-light px-3 py-3 text-sm text-accent" role="alert">
            Existing setup requests could not be loaded. Refresh before sending another so we do
            not duplicate one already in progress.
          </div>
        ) : (
          <form onSubmit={submitSetup} className="space-y-8" noValidate>
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

            <fieldset className="space-y-3">
              <legend className="mb-3">
                <SectionTitle step={1}>What do you need?</SectionTitle>
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    {
                      type: 'landing_page' as const,
                      icon: Layout,
                      title: 'Trust landing page',
                      price: `$${LANDING_STANDARDS_PACKAGE_CENTS / 100} NZD one-off`,
                      body: 'A one-page site with your logo, colours, mission, contact details and Reality Badge, on accounts you own.',
                    },
                    {
                      type: 'custom_work' as const,
                      icon: Wrench,
                      title: 'Custom setup or work',
                      price: 'Quoted per job',
                      body: 'Domain or DNS moves, organisation email, hosting, fixes to your current site, donation pages and more.',
                    },
                  ]
                ).map((opt) => (
                  <label
                    key={opt.type}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1.5 border-2 p-4 transition-colors',
                      requestType === opt.type
                        ? 'border-teal bg-teal/5 ring-2 ring-teal/30'
                        : 'border-ink-200 hover:border-ink-400 dark:border-border',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="request-type"
                        checked={requestType === opt.type}
                        onChange={() => {
                          setRequestType(opt.type);
                          setFieldErrors({});
                        }}
                      />
                      <opt.icon size={16} className="text-teal" aria-hidden />
                      <span className="font-semibold">{opt.title}</span>
                    </span>
                    <span className="font-mono text-2xs uppercase text-ink-500">{opt.price}</span>
                    <span className="text-xs text-ink-600 dark:text-muted-foreground">{opt.body}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="label-brutal" htmlFor="setup-current-website">
                  Current website <span className="font-normal normal-case tracking-normal text-ink-400">(if you have one)</span>
                </label>
                <input
                  id="setup-current-website"
                  type="url"
                  inputMode="url"
                  className={inputClass(Boolean(fieldErrors.currentWebsite))}
                  value={currentWebsite}
                  onChange={(e) => {
                    setCurrentWebsite(e.target.value);
                    clearFieldError('currentWebsite');
                  }}
                  placeholder="https://yourorg.org.nz"
                  aria-invalid={Boolean(fieldErrors.currentWebsite)}
                />
                <FieldError id="err-current-website" message={fieldErrors.currentWebsite} />
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="mb-3">
                <SectionTitle step={2}>How it should look</SectionTitle>
              </legend>
              <div>
                <label className="label-brutal" htmlFor="setup-logo">
                  Logo {isLanding ? <span className="text-accent">*</span> : null}
                </label>
                <LogoUploadField
                  id="setup-logo"
                  organizationId={organization.id}
                  value={logoUrl}
                  onChange={(url) => {
                    setLogoUrl(url);
                    clearFieldError('logoUrl');
                  }}
                  invalid={Boolean(fieldErrors.logoUrl)}
                  describedBy={fieldErrors.logoUrl ? 'err-setup-logo' : undefined}
                />
                <FieldError id="err-setup-logo" message={fieldErrors.logoUrl} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ColourField
                  id="setup-brand-primary"
                  label="Main colour"
                  value={brandPrimary}
                  onChange={(v) => {
                    setBrandPrimary(v);
                    clearFieldError('brandPrimary');
                  }}
                  placeholder="#041C3C"
                  error={fieldErrors.brandPrimary}
                  required={isLanding}
                />
                <ColourField
                  id="setup-brand-secondary"
                  label="Accent colour"
                  value={brandSecondary}
                  onChange={(v) => {
                    setBrandSecondary(v);
                    clearFieldError('brandSecondary');
                  }}
                  placeholder="#EBBB57"
                  error={fieldErrors.brandSecondary}
                  required={isLanding}
                />
              </div>
            </fieldset>

            {isLanding ? (
              <fieldset className="space-y-4">
                <legend className="mb-3">
                  <SectionTitle step={3}>Contact details for the page</SectionTitle>
                </legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label-brutal" htmlFor="setup-page-email">
                      Public email <span className="text-accent">*</span>
                    </label>
                    <input
                      id="setup-page-email"
                      type="email"
                      className={inputClass(Boolean(fieldErrors.pageEmail))}
                      value={pageEmail}
                      onChange={(e) => {
                        setPageEmail(e.target.value);
                        clearFieldError('pageEmail');
                      }}
                      placeholder="hello@yourorg.org.nz"
                      aria-invalid={Boolean(fieldErrors.pageEmail)}
                    />
                    <FieldError id="err-page-email" message={fieldErrors.pageEmail} />
                  </div>
                  <div>
                    <label className="label-brutal" htmlFor="setup-page-phone">
                      Public phone <span className="font-normal normal-case tracking-normal text-ink-400">(optional)</span>
                    </label>
                    <input
                      id="setup-page-phone"
                      type="tel"
                      className={inputClass(false)}
                      value={pagePhone}
                      onChange={(e) => setPagePhone(e.target.value)}
                      placeholder="+64 21 000 0000"
                    />
                  </div>
                </div>
                <div>
                  <label className="label-brutal" htmlFor="setup-page-address">
                    Address or area served <span className="font-normal normal-case tracking-normal text-ink-400">(optional)</span>
                  </label>
                  <input
                    id="setup-page-address"
                    type="text"
                    className={inputClass(false)}
                    value={pageAddress}
                    onChange={(e) => setPageAddress(e.target.value)}
                    placeholder="e.g. Serving South Auckland"
                  />
                </div>
              </fieldset>
            ) : null}

            <fieldset className="space-y-4">
              <legend className="mb-3">
                <SectionTitle step={isLanding ? 4 : 3}>Your accounts</SectionTitle>
              </legend>
              <p className="text-xs text-ink-500">
                Tick what you already have. Missing some is fine: we help you set them up, always
                in your organisation&rsquo;s name.
              </p>
              <div className="space-y-2">
                <span className="label-brutal">Domain name</span>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['own', 'We have a domain'],
                      ['need', 'We need one'],
                      ['unsure', 'Not sure'],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className={cn(
                        'flex min-h-[44px] cursor-pointer items-center gap-2 border-2 px-3 text-sm',
                        domainStatus === value ? 'border-teal bg-teal/5' : 'border-ink-200 dark:border-border',
                      )}
                    >
                      <input
                        type="radio"
                        name="domain-status"
                        checked={domainStatus === value}
                        onChange={() => {
                          setDomainStatus(value);
                          clearFieldError('domainName');
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {domainStatus === 'own' ? (
                  <>
                    <input
                      type="text"
                      className={inputClass(Boolean(fieldErrors.domainName))}
                      value={domainName}
                      onChange={(e) => {
                        setDomainName(e.target.value);
                        clearFieldError('domainName');
                      }}
                      placeholder="yourorg.org.nz"
                      aria-label="Domain name"
                    />
                    <FieldError id="err-domain" message={fieldErrors.domainName} />
                  </>
                ) : null}
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {SETUP_READINESS_ITEMS.filter((i) => i.key !== 'domain').map((item) => (
                  <li key={item.key}>
                    <label
                      className={cn(
                        'flex min-h-[44px] cursor-pointer items-start gap-2 border-2 p-3 text-sm',
                        ready.has(item.key) ? 'border-teal bg-teal/5' : 'border-ink-200 dark:border-border',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={ready.has(item.key)}
                        onChange={(e) =>
                          setReady((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.key);
                            else next.delete(item.key);
                            return next;
                          })
                        }
                      />
                      <span>
                        <span className="block font-semibold">{item.title}</span>
                        <span className="text-xs text-ink-500">{item.have}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            <div>
              <div className="mb-2 flex items-end justify-between gap-2">
                <label className="label-brutal mb-0" htmlFor="setup-notes">
                  {isLanding ? 'Anything else we should know?' : 'Describe the work'}{' '}
                  {isLanding ? (
                    <span className="font-normal normal-case tracking-normal text-ink-400">(optional)</span>
                  ) : (
                    <span className="text-accent">*</span>
                  )}
                </label>
                <span className="font-mono text-2xs tabular-nums text-ink-400">
                  {setupNotes.trim().length}/{NOTES_MAX}
                </span>
              </div>
              <textarea
                id="setup-notes"
                className={inputClass(Boolean(fieldErrors.setupNotes), 'min-h-[96px]')}
                value={setupNotes}
                onChange={(e) => {
                  setSetupNotes(e.target.value);
                  clearFieldError('setupNotes');
                }}
                placeholder={
                  isLanding
                    ? 'e.g. sections you want, photos to use, a deadline, who to talk to…'
                    : 'e.g. move our domain from a volunteer’s account to ours, set up admin@ email…'
                }
                maxLength={NOTES_MAX}
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

            <button
              type="submit"
              disabled={setupSubmitting}
              className="btn-brutal-accent min-h-[48px] w-full px-8 disabled:opacity-60 sm:w-auto"
            >
              {setupSubmitting
                ? 'Sending…'
                : isLanding
                  ? 'Request landing page'
                  : 'Ask for a quote'}
            </button>
          </form>
        )}
      </div>

      <NgoSetupReadinessGuide />

      <div className="card-brutal space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <History size={18} className="text-ink-500" aria-hidden />
          <h2 className="text-lg font-black uppercase tracking-tight">Previous requests</h2>
        </div>

        {loadError && setupRequests.length === 0 ? (
          <p className="text-sm text-accent" role="alert">
            Previous setup requests could not be loaded.
          </p>
        ) : setupRequests.length === 0 ? (
          <p className="text-sm text-ink-500">
            No setup requests yet. Submit one above when you are ready.
          </p>
        ) : (
          <>
            {loadError ? (
              <p className="text-sm text-accent mb-3" role="alert">
                Previous setup requests could not be refreshed. Showing the last loaded list.
              </p>
            ) : null}
            <ul className="divide-y-2 divide-ink-100 border-2 border-ink-100 dark:divide-border dark:border-border">
            {setupRequests.map((req) => (
              <li
                key={req.id}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-ink-950 dark:text-foreground">
                    {REQUEST_KIND_LABELS[req.request_kind] ?? req.request_kind.replace(/_/g, ' ')}
                  </p>
                  <p className="font-mono text-2xs text-ink-500">
                    Submitted {formatNzDateTime(req.created_at)}
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
          </>
        )}
      </div>
    </div>
  );
}
