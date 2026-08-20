import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Globe, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  getProfileCompletionItems,
  profileCompletionPercent,
} from '../../lib/ngoProfileCompletion';
import type { Organization } from '../../types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const COUNTRIES = [
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬' },
  { code: 'HK', name: 'Hong Kong', dialCode: '+852', flag: '🇭🇰' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
  { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'OTHER', name: 'Other', dialCode: '', flag: '🌐' },
] as const;

const LIMITS = {
  missionMin: 20,
  missionMax: 1000,
  descriptionMin: 20,
  descriptionMax: 500,
  cityMax: 80,
  phoneMinDigits: 6,
  phoneMaxDigits: 15,
} as const;

type ProfileForm = {
  mission_statement: string;
  description: string;
  website_url: string;
  logo_url: string;
  phone_country: string;
  phone_number: string;
  email: string;
  country: string;
  city: string;
};

type FieldKey = keyof ProfileForm;
type FieldErrors = Partial<Record<FieldKey, string>>;

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
  return cn(
    'input-brutal w-full text-base',
    hasError && 'border-accent ring-2 ring-accent/30',
    extra,
  );
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidHttpUrl(raw: string): boolean {
  if (!raw.trim()) return true;
  try {
    const parsed = new URL(normalizeUrl(raw));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname;
    if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) return false;
    if (host.includes(' ')) return false;
    const tld = host.split('.').pop() ?? '';
    return tld.length >= 2 && /^[a-z0-9-]+$/i.test(tld);
  } catch {
    return false;
  }
}

function isLikelyImageUrl(raw: string): boolean {
  if (!raw.trim()) return true;
  if (!isValidHttpUrl(raw)) return false;
  try {
    const parsed = new URL(normalizeUrl(raw));
    const path = parsed.pathname.toLowerCase();
    // Allow CDN paths without extension; reject obvious non-http schemes already handled.
    if (/\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(path)) return true;
    // Many orgs host logos at /logo or CDN roots — accept valid https URLs.
    return parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function isValidEmail(email: string): boolean {
  if (!email.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim());
}

function phoneDigitCount(phone: string): number {
  return phone.replace(/\D/g, '').length;
}

function isValidPhone(phone: string): boolean {
  if (!phone.trim()) return true;
  const digits = phoneDigitCount(phone);
  if (digits < LIMITS.phoneMinDigits || digits > LIMITS.phoneMaxDigits) return false;
  // Allow digits, spaces, dashes, parentheses, plus (once at start of local part rarely)
  return /^[\d\s\-().]+$/.test(phone.trim());
}

function extractPhoneParts(phone: string): { phoneCountry: string; number: string } {
  const match = phone.match(/^(\+\d{1,4})?\s*(.*)$/);
  if (!match) return { phoneCountry: 'NZ', number: phone };
  const dial = match[1] || '+64';
  const number = match[2] || '';
  const country = COUNTRIES.find((c) => c.dialCode === dial);
  return { phoneCountry: country?.code || 'NZ', number };
}

function validateProfileForm(form: ProfileForm): FieldErrors {
  const errors: FieldErrors = {};

  const mission = form.mission_statement.trim();
  if (!mission) {
    errors.mission_statement = 'Mission is required — tell donors what you do and who you serve.';
  } else if (mission.length < LIMITS.missionMin) {
    errors.mission_statement = `Mission needs at least ${LIMITS.missionMin} characters (currently ${mission.length}).`;
  } else if (mission.length > LIMITS.missionMax) {
    errors.mission_statement = `Mission must be ${LIMITS.missionMax} characters or fewer.`;
  }

  const description = form.description.trim();
  if (!description) {
    errors.description = 'Short description is required for your public profile.';
  } else if (description.length < LIMITS.descriptionMin) {
    errors.description = `Description needs at least ${LIMITS.descriptionMin} characters (currently ${description.length}).`;
  } else if (description.length > LIMITS.descriptionMax) {
    errors.description = `Description must be ${LIMITS.descriptionMax} characters or fewer.`;
  }

  if (!form.email.trim()) {
    errors.email = 'Contact email is required so donors and our team can reach you.';
  } else if (!isValidEmail(form.email)) {
    errors.email = 'Enter a valid email address (e.g. name@organisation.org).';
  }

  if (form.phone_number.trim() && !isValidPhone(form.phone_number)) {
    errors.phone_number = `Enter a valid phone number (${LIMITS.phoneMinDigits}–${LIMITS.phoneMaxDigits} digits).`;
  }
  if (!form.phone_country.trim() || !COUNTRIES.some((c) => c.code === form.phone_country)) {
    errors.phone_country = 'Select a country dialling code.';
  }

  if (form.website_url.trim() && !isValidHttpUrl(form.website_url)) {
    errors.website_url = 'Enter a valid website (e.g. https://example.org).';
  }

  if (form.logo_url.trim()) {
    if (!isValidHttpUrl(form.logo_url)) {
      errors.logo_url = 'Enter a valid logo URL starting with https://';
    } else if (!isLikelyImageUrl(form.logo_url)) {
      errors.logo_url = 'Logo URL should point to an image (PNG, JPG, SVG, or WebP).';
    }
  }

  if (!form.country.trim()) {
    errors.country = 'Select a country.';
  } else if (!COUNTRIES.some((c) => c.code === form.country)) {
    errors.country = 'Select a country from the list.';
  }

  const city = form.city.trim();
  if (!city) {
    errors.city = 'City is required for your public location.';
  } else if (city.length < 2) {
    errors.city = 'Enter a full city or town name.';
  } else if (city.length > LIMITS.cityMax) {
    errors.city = `City must be ${LIMITS.cityMax} characters or fewer.`;
  } else if (!/^[\p{L}\p{M}\d\s.'’\-]+$/u.test(city)) {
    errors.city = 'City can only include letters, numbers, spaces, and basic punctuation.';
  }

  return errors;
}

type NgoProfilePanelProps = {
  organization: Organization;
  onUpdated: () => void;
};

export default function NgoProfilePanel({ organization, onUpdated }: NgoProfilePanelProps) {
  const completionItems = useMemo(() => getProfileCompletionItems(organization), [organization]);
  const completionPct = profileCompletionPercent(completionItems);
  const phoneParts = useMemo(() => extractPhoneParts(organization.phone ?? ''), [organization.phone]);

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    mission_statement: organization.mission_statement ?? '',
    description: organization.description ?? '',
    website_url: organization.website_url ?? '',
    logo_url: organization.logo_url ?? '',
    phone_country: phoneParts.phoneCountry,
    phone_number: phoneParts.number,
    email: organization.email ?? '',
    country: organization.country ?? 'NZ',
    city: '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const cityFromLocation = organization.location?.split(',')[0]?.trim() || '';
    setProfileForm({
      mission_statement: organization.mission_statement ?? '',
      description: organization.description ?? '',
      website_url: organization.website_url ?? '',
      logo_url: organization.logo_url ?? '',
      phone_country: phoneParts.phoneCountry,
      phone_number: phoneParts.number,
      email: organization.email ?? '',
      country: organization.country ?? 'NZ',
      city: cityFromLocation,
    });
    setFieldErrors({});
    setSaveError('');
  }, [organization.id, organization.updated_at, phoneParts.phoneCountry, phoneParts.number]);

  const clearFieldError = (key: FieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const updateField = <K extends FieldKey>(key: K, value: ProfileForm[K]) => {
    setProfileForm((f) => ({ ...f, [key]: value }));
    clearFieldError(key);
    setSaveError('');
    setProfileMessage('');
  };

  const validateField = (key: FieldKey, value?: string) => {
    const draft =
      value !== undefined ? { ...profileForm, [key]: value } : profileForm;
    const next = validateProfileForm(draft);
    setFieldErrors((prev) => {
      const merged = { ...prev };
      if (next[key]) merged[key] = next[key];
      else delete merged[key];
      return merged;
    });
  };

  const errorCount = Object.keys(fieldErrors).length;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateProfileForm(profileForm);
    setFieldErrors(errors);
    setProfileMessage('');
    setSaveError('');

    if (Object.keys(errors).length > 0) {
      window.setTimeout(() => {
        document
          .getElementById('profile-validation-summary')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }

    setProfileSaving(true);

    const dial =
      COUNTRIES.find((c) => c.code === profileForm.phone_country)?.dialCode || '+64';
    const fullPhone = profileForm.phone_number.trim()
      ? `${dial} ${profileForm.phone_number.trim()}`
      : '';

    const countryName =
      COUNTRIES.find((c) => c.code === profileForm.country)?.name || profileForm.country;
    const fullLocation = profileForm.city.trim()
      ? `${profileForm.city.trim()}, ${countryName}`
      : '';

    const website = profileForm.website_url.trim()
      ? normalizeUrl(profileForm.website_url)
      : '';
    const logo = profileForm.logo_url.trim() ? normalizeUrl(profileForm.logo_url) : '';

    const { error } = await supabase
      .from('organizations')
      .update({
        mission_statement: profileForm.mission_statement.trim(),
        description: profileForm.description.trim(),
        website_url: website,
        logo_url: logo,
        phone: fullPhone,
        email: profileForm.email.trim(),
        country: profileForm.country,
        location: fullLocation,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organization.id);

    setProfileSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setProfileMessage('Profile saved.');
    onUpdated();
  };

  const missionLen = profileForm.mission_statement.trim().length;
  const descriptionLen = profileForm.description.trim().length;

  return (
    <div className="card-brutal space-y-6 p-5 sm:p-6">
      <p className="text-xs leading-relaxed text-ink-500">
        Complete your public trust profile. Need a landing page or package? Use{' '}
        <Link
          to="/ngo/setup-request"
          className="font-semibold text-ink-950 underline dark:text-foreground"
        >
          Setup request
        </Link>
        .
      </p>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="label-brutal text-ink-400">Completion</span>
          <span className="font-mono text-2xs uppercase">{completionPct}%</span>
        </div>
        <div className="h-2 border-2 border-ink-950 bg-ink-100 dark:border-border dark:bg-muted">
          <div
            className="h-full bg-teal transition-all"
            style={{ width: `${completionPct}%` }}
            role="progressbar"
            aria-valuenow={completionPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
          {completionItems.map((item) => (
            <li key={item.key} className="flex items-center gap-2">
              {item.complete ? (
                <CheckCircle size={14} className="shrink-0 text-teal" aria-hidden />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0 border border-ink-300" aria-hidden />
              )}
              <span className={item.complete ? 'text-ink-600' : 'font-medium text-ink-950'}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={saveProfile} className="space-y-4" noValidate>
        {errorCount > 0 ? (
          <div
            id="profile-validation-summary"
            className="border-2 border-accent bg-accent-light px-3 py-3 text-sm text-accent"
            role="alert"
            tabIndex={-1}
          >
            <p className="flex items-center gap-2 font-semibold">
              <AlertCircle size={16} aria-hidden />
              Fix {errorCount} {errorCount === 1 ? 'field' : 'fields'} before saving
            </p>
            <ul className="mt-2 list-inside list-disc space-y-0.5 font-mono text-2xs">
              {Object.entries(fieldErrors).map(([key, msg]) => (
                <li key={key}>{msg}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-end justify-between gap-2">
            <label className="label-brutal mb-0" htmlFor="ngo-mission">
              Mission <span className="text-accent">*</span>
            </label>
            <span
              className={cn(
                'font-mono text-2xs tabular-nums',
                missionLen > 0 && missionLen < LIMITS.missionMin
                  ? 'text-accent'
                  : 'text-ink-400',
              )}
            >
              {missionLen}/{LIMITS.missionMax}
            </span>
          </div>
          <textarea
            id="ngo-mission"
            className={inputClass(Boolean(fieldErrors.mission_statement), 'min-h-[88px]')}
            value={profileForm.mission_statement}
            onChange={(e) => updateField('mission_statement', e.target.value)}
            onBlur={(e) => validateField('mission_statement', e.target.value)}
            placeholder="What your organisation does and who you serve"
            maxLength={LIMITS.missionMax + 50}
            aria-invalid={Boolean(fieldErrors.mission_statement)}
            aria-describedby={fieldErrors.mission_statement ? 'err-mission' : undefined}
          />
          <FieldError id="err-mission" message={fieldErrors.mission_statement} />
        </div>

        <div>
          <div className="mb-2 flex items-end justify-between gap-2">
            <label className="label-brutal mb-0" htmlFor="ngo-description">
              Short description <span className="text-accent">*</span>
            </label>
            <span
              className={cn(
                'font-mono text-2xs tabular-nums',
                descriptionLen > 0 && descriptionLen < LIMITS.descriptionMin
                  ? 'text-accent'
                  : 'text-ink-400',
              )}
            >
              {descriptionLen}/{LIMITS.descriptionMax}
            </span>
          </div>
          <textarea
            id="ngo-description"
            className={inputClass(Boolean(fieldErrors.description), 'min-h-[72px]')}
            value={profileForm.description}
            onChange={(e) => updateField('description', e.target.value)}
            onBlur={(e) => validateField('description', e.target.value)}
            maxLength={LIMITS.descriptionMax + 50}
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={fieldErrors.description ? 'err-description' : undefined}
          />
          <FieldError id="err-description" message={fieldErrors.description} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label-brutal" htmlFor="ngo-email">
              Contact email <span className="text-accent">*</span>
            </label>
            <input
              id="ngo-email"
              type="email"
              autoComplete="email"
              className={inputClass(Boolean(fieldErrors.email))}
              value={profileForm.email}
              onChange={(e) => updateField('email', e.target.value)}
              onBlur={(e) => validateField('email', e.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'err-email' : undefined}
            />
            <FieldError id="err-email" message={fieldErrors.email} />
          </div>
          <div>
            <label className="label-brutal flex items-center gap-1" htmlFor="ngo-phone">
              <Phone size={12} aria-hidden /> Phone
              <span className="font-normal normal-case tracking-normal text-ink-400">(optional)</span>
            </label>
            <div className="flex gap-2">
              <Select
                value={profileForm.phone_country}
                onValueChange={(value) => updateField('phone_country', value ?? 'NZ')}
              >
                <SelectTrigger
                  className={cn(
                    'min-h-[48px] w-[120px]',
                    fieldErrors.phone_country && 'border-accent ring-2 ring-accent/30',
                  )}
                >
                  <SelectValue placeholder="Code" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.flag} {c.dialCode || '—'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                id="ngo-phone"
                type="tel"
                autoComplete="tel-national"
                className={inputClass(Boolean(fieldErrors.phone_number), 'min-h-[48px] flex-1')}
                value={profileForm.phone_number}
                onChange={(e) => updateField('phone_number', e.target.value)}
                onBlur={(e) => validateField('phone_number', e.target.value)}
                placeholder="Phone number"
                aria-invalid={Boolean(fieldErrors.phone_number)}
                aria-describedby={fieldErrors.phone_number ? 'err-phone' : undefined}
              />
            </div>
            <FieldError
              id="err-phone"
              message={fieldErrors.phone_number || fieldErrors.phone_country}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label-brutal flex items-center gap-1" htmlFor="ngo-website">
              <Globe size={12} aria-hidden /> Website URL
            </label>
            <input
              id="ngo-website"
              type="url"
              inputMode="url"
              className={inputClass(Boolean(fieldErrors.website_url))}
              value={profileForm.website_url}
              onChange={(e) => updateField('website_url', e.target.value)}
              onBlur={(e) => validateField('website_url', e.target.value)}
              placeholder="https://example.org"
              aria-invalid={Boolean(fieldErrors.website_url)}
              aria-describedby={fieldErrors.website_url ? 'err-website' : undefined}
            />
            <FieldError id="err-website" message={fieldErrors.website_url} />
          </div>
          <div>
            <label className="label-brutal" htmlFor="ngo-logo">
              Logo URL
            </label>
            <input
              id="ngo-logo"
              type="url"
              inputMode="url"
              className={inputClass(Boolean(fieldErrors.logo_url))}
              value={profileForm.logo_url}
              onChange={(e) => updateField('logo_url', e.target.value)}
              onBlur={(e) => validateField('logo_url', e.target.value)}
              placeholder="https://…/logo.png"
              aria-invalid={Boolean(fieldErrors.logo_url)}
              aria-describedby={fieldErrors.logo_url ? 'err-logo' : undefined}
            />
            <FieldError id="err-logo" message={fieldErrors.logo_url} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label-brutal" htmlFor="ngo-country">
              Country <span className="text-accent">*</span>
            </label>
            <Select
              value={profileForm.country}
              onValueChange={(value) => updateField('country', value ?? 'NZ')}
            >
              <SelectTrigger
                id="ngo-country"
                className={cn(
                  'min-h-[48px] w-full',
                  fieldErrors.country && 'border-accent ring-2 ring-accent/30',
                )}
                aria-invalid={Boolean(fieldErrors.country)}
              >
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.filter((c) => c.code !== 'OTHER').map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id="err-country" message={fieldErrors.country} />
          </div>
          <div>
            <label className="label-brutal" htmlFor="ngo-city">
              City <span className="text-accent">*</span>
            </label>
            <input
              id="ngo-city"
              type="text"
              autoComplete="address-level2"
              className={inputClass(Boolean(fieldErrors.city))}
              value={profileForm.city}
              onChange={(e) => updateField('city', e.target.value)}
              onBlur={(e) => validateField('city', e.target.value)}
              placeholder="City or town"
              maxLength={LIMITS.cityMax + 20}
              aria-invalid={Boolean(fieldErrors.city)}
              aria-describedby={fieldErrors.city ? 'err-city' : undefined}
            />
            <FieldError id="err-city" message={fieldErrors.city} />
          </div>
        </div>

        {saveError ? (
          <div
            className="flex items-start gap-2 border-2 border-accent bg-accent-light px-3 py-2 text-sm text-accent"
            role="alert"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{saveError}</span>
          </div>
        ) : null}

        {profileMessage ? (
          <p
            className="flex items-center gap-2 border-2 border-teal/40 bg-teal/5 px-3 py-2 text-sm text-teal"
            role="status"
          >
            <CheckCircle size={16} aria-hidden />
            {profileMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={profileSaving}
          className="btn-brutal min-h-[48px] w-full px-8 disabled:opacity-60 sm:w-auto"
        >
          {profileSaving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}
